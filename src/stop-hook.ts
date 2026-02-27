import * as fs from 'fs';
import * as path from 'path';
import {getDateString, getNowMinutes, getTodayDir, loadConfig, logError, recordRunHistory} from './config';
import {ClaudeModel, HistoryEntry, StdinPayload, TranscriptLine} from './types';
import {callClaude} from "./claude";

function isInTimeRange(start: string, end: string, timeZone: string): boolean {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const nowMinutes = getNowMinutes(timeZone);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }
  // 자정을 넘기는 범위 (예: 22:00 ~ 02:00)
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
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
      try {
        const entry: TranscriptLine = JSON.parse(lines[i]);
        if (entry.type === 'user' && entry.message?.content) {
          const messageContent = entry.message.content;
          if (typeof messageContent === 'string') return messageContent;
          if (Array.isArray(messageContent)) {
            const textPart = messageContent.find(p => p.type === 'text');
            if (textPart?.text) return textPart.text;
            // bash 명령어 등 사용시 tool_result만 존재함. 그 경우 가장 최근 유저 text를 확인하기 위해 역방향 탐색
          }
        }
      } catch (e) {
        logError("손상된 history Skip: " + lines[i] + "");
      }
    }
  } catch (e) {
    logError(`transcript 파싱 실패: ${e}`);
  }
  return null;
}

function summarize(defaultPrompt: string, stylePrompt: string, response: string, model: ClaudeModel): string {
  const input = `${defaultPrompt}\n${stylePrompt}\n\n---\n${response}`;
  const result = callClaude(input, model);

  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'claude CLI 실패');
  }
  return result.stdout.trim();
}

function main(): void {
  // summarize()에서 호출한 claude --print 종료 시 재진입 방지
  if (process.env.DAILY_JOURNAL_RUNNING) {
    return;
  }

  const config = loadConfig();

  if (!config.save || !isInTimeRange(config.schedule.start, config.schedule.end, config.timeZone)) {
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
  const summary = config.summary.use ? summarize(config.summary.defaultPrompt, config.summary.stylePrompt, last_assistant_message, config.summary.claudeModel) : last_assistant_message;

  if(summary.length === 0 || summary.trim().toUpperCase() === 'SKIP') return;

  const projectName = extractProjectName(cwd);
  const todayDir = getTodayDir(config);
  const historyDir = path.join(todayDir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone }).format(now);
  const timeParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const h = timeParts.find(p => p.type === 'hour')?.value ?? '00';
  const m = timeParts.find(p => p.type === 'minute')?.value ?? '00';
  const time = `${dateStr} ${h}:${m}`;

  const entry: HistoryEntry = {
    time,
    prompt,
    summary,
  };

  fs.appendFileSync(
    path.join(historyDir, `${projectName}.jsonl`),
    JSON.stringify(entry) + '\n',
  );

  // 이미 일지가 생성된 날에 새 대화가 추가되면 modified로 변경
  recordRunHistory({ date: getDateString(config.timeZone), status: 'modified', timestamp: new Date().toISOString() });
}

try{
  main();
} catch (e) {
  logError(`stop-hook 오류: ${e}`);
}
