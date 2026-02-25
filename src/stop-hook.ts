import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getTodayDir, logError, recordRunHistory } from './config';
import { StdinPayload, HistoryEntry, TranscriptLine } from './types';
import {callClaude} from "./claude";

function isInTimeRange(start: string, end: string): boolean {
  const now = new Date();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
}

function extractProjectName(cwd: string): string {
  if (!cwd) return '_unknown';
  const parts = cwd.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || '_unknown';
}

function getLastUserMessage(transcriptPath: string): string | null {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i--) {
      const entry: TranscriptLine = JSON.parse(lines[i]);
      if (entry.type === 'user' && entry.message?.content) {
        const content = entry.message.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
          const textPart = content.find(p => p.type === 'text');
          if (textPart?.text) return textPart.text;
          // bash 명령어 등 사용시 tool_result만 존재함. 그 경우 가장 최근 유저 text를 확인하기 위해 역방향 탐색
        }
      }
    }
  } catch (e) {
    logError(`transcript 파싱 실패: ${e}`);
  }
  return null;
}

function summarize(summaryPrompt: string, response: string): string {
  const input = `${summaryPrompt}\n\n---\n${response}`;
  const result = callClaude(input);

  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'claude CLI 실패');
  }
  return result.stdout.trim();
}

async function main(): Promise<void> {
  // summarize()에서 호출한 claude --print 종료 시 재진입 방지
  if (process.env.DAILY_JOURNAL_RUNNING) {
    return;
  }

  const config = loadConfig();

  if (!isInTimeRange(config.schedule.start, config.schedule.end) || !config.save) {
    return;
  }

  // stdin 읽기 (fd 0 = cross-platform)
  const stdinData = fs.readFileSync(0, 'utf-8');
  let payload: StdinPayload;
  try {
    payload = JSON.parse(stdinData);
  } catch (e) {
    logError(`stdin 파싱 실패: ${e}`);
    return;
  }

  const { session_id, cwd, last_assistant_message, transcript_path } = payload;

  if (!last_assistant_message) {
    return;
  }

  const prompt = getLastUserMessage(transcript_path);
  if (!prompt) {
    logError(`user 메시지 추출 실패 (session: ${session_id}), skip`);
    return;
  }

  // 요약 사용 여부에 따라 대화내용 원본을 저장할지 요약본을 생성할지 결졍
  const summary = config.summary.use ? summarize(config.summary.prompt, last_assistant_message) : last_assistant_message;

  if(summary.length === 0) return;

  const projectName = extractProjectName(cwd);
  const todayDir = getTodayDir(config);
  const historyDir = path.join(todayDir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  const entry: HistoryEntry = {
    timestamp: new Date().toISOString(),
    session_id,
    prompt,
    summary,
  };

  fs.appendFileSync(
    path.join(historyDir, `${projectName}.jsonl`),
    JSON.stringify(entry) + '\n',
  );

  // 이미 일지가 생성된 날에 새 대화가 추가되면 modified로 변경
  const today = new Date().toISOString().slice(0, 10);
  recordRunHistory({ date: today, status: 'modified', timestamp: new Date().toISOString() });
}

main().catch(e => logError(`stop-hook 오류: ${e}`));
