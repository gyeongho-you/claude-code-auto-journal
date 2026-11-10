import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  cleanupStaleSessionProjectCache,
  getDateString,
  getDateStringWithHourMinutes,
  getNowMinutes,
  getStableProjectName,
  getTodayDir,
  isInternalJudgePrompt,
  loadConfig,
  loadGitHooks,
  logError,
  PLUGIN_DIR,
  readAndClearSessionEdits,
  recordRunHistory,
  saveGitHooks,
  shouldTrackProject,
  GIT_HOOK_MARKER_BEGIN,
  GIT_HOOK_MARKER_END,
} from './config';
import {ClaudeModel, Config, HistoryEntry, StdinPayload, TranscriptLine} from './types';
import {callClaude, describeFailure, neutralizeFence} from "./claude";

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

// answer 필드가 무거워지지 않도록 두는 상한선. 대부분의 턴은 텍스트 조각이 1~3개뿐이라
// 실질적으로 잘리지 않고, 도구 호출을 아주 많이 반복하는 예외적인 턴에서만 개입한다.
const MAX_ANSWER_SEGMENTS = 10;
const MAX_ANSWER_CHARS = 6000;

type CurrentTurn = {
  prompt: string | null;
  assistantTexts: string[];
};

// transcript_path는 이번 턴만이 아니라 세션 전체의 JSONL 기록이며, user/assistant 외에도
// attachment/system/cost-state 등 훅과 무관한 라인이 섞여 있다. 여기서는 "진짜" user 턴
// 경계(문자열 content 또는 text 파트가 있는 경우 - tool_result만 있는 user 라인은 제외)를
// 마지막으로 찾고, 그 이후에 나온 assistant의 text 파트들을 시간순으로 모두 모은다.
function extractCurrentTurn(transcriptPath: string): CurrentTurn {
  let lines: string[];
  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    lines = content.trim().split('\n').filter(Boolean);
  } catch (e) {
    logError(`transcript 파싱 실패: ${e}`);
    return { prompt: null, assistantTexts: [] };
  }

  const entries: (TranscriptLine | null)[] = lines.map(line => {
    try {
      return JSON.parse(line) as TranscriptLine;
    } catch (e) {
      logError("손상된 history Skip: " + line);
      return null;
    }
  });

  let prompt: string | null = null;
  let lastUserIndex = -1;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.type !== 'user' || !entry.message?.content) continue;
    // 서브에이전트 대화(sidechain)와 시스템이 넣은 meta 라인은 사용자 턴 경계가 아니다
    if (entry.isSidechain || entry.isMeta) continue;

    const messageContent = entry.message.content;
    if (typeof messageContent === 'string') {
      prompt = messageContent;
      lastUserIndex = i;
    } else if (Array.isArray(messageContent)) {
      const textPart = messageContent.find(p => p.type === 'text');
      if (textPart?.text) {
        prompt = textPart.text;
        lastUserIndex = i;
      }
      // tool_result만 있는 user 엔트리는 진짜 턴 경계가 아니므로 무시하고 계속 탐색
    }
  }

  const assistantTexts: string[] = [];
  for (let i = lastUserIndex + 1; i < entries.length; i++) {
    const entry = entries[i];
    if (entry?.type !== 'assistant' || entry.isSidechain || !Array.isArray(entry.message?.content)) continue;
    for (const part of entry.message.content) {
      if (part.type === 'text' && part.text) assistantTexts.push(part.text);
    }
  }

  return { prompt, assistantTexts };
}

// 이번 턴의 assistant 텍스트 조각들을 시간순으로 이어붙이되, 세그먼트 개수와 전체 길이를 제한한다.
// 마지막 조각(= 기존 last_assistant_message에 해당)은 항상 최대한 온전히 보존한다.
function buildAnswer(assistantTexts: string[]): string {
  if (assistantTexts.length === 0) return '';

  const recent = assistantTexts.length > MAX_ANSWER_SEGMENTS
    ? assistantTexts.slice(-MAX_ANSWER_SEGMENTS)
    : assistantTexts;

  const joined = recent.join('\n\n');
  if (joined.length <= MAX_ANSWER_CHARS) return joined;

  return '...(앞부분 생략)...\n\n' + joined.slice(joined.length - MAX_ANSWER_CHARS);
}

function buildDailyJournalBlock(gitCommitHookJsPath: string): string {
  const nodePath = gitCommitHookJsPath.replace(/\\/g, '/');
  return `${GIT_HOOK_MARKER_BEGIN}\nnode "${nodePath}"\n${GIT_HOOK_MARKER_END}`;
}

function tryRegisterGitHook(cwd: string, projectName: string, config: Config): void {
  const hooks = loadGitHooks();
  const entry = hooks[projectName];
  const today = getDateString(config.timeZone);

  if (entry?.status === 'registered') return;
  if (entry?.status === 'failed' && entry.timestamp.substring(0, 10) === today) return;

  let repoRoot: string;
  try {
    repoRoot = execSync(`git -C "${cwd}" rev-parse --show-toplevel`, { encoding: 'utf-8' }).trim();
  } catch {
    return;
  }

  // worktree(.git이 파일)·core.hooksPath 저장소도 git이 알려주는 실제 hooks 경로를 쓴다
  let hookPath = path.join(repoRoot, '.git', 'hooks', 'post-commit');
  try {
    const gitPath = execSync(`git -C "${repoRoot}" rev-parse --git-path hooks/post-commit`, { encoding: 'utf-8' }).trim();
    if (gitPath) hookPath = path.resolve(repoRoot, gitPath);
  } catch { /* 기본 경로 사용 */ }
  const gitCommitHookJsPath = path.join(PLUGIN_DIR, 'dist', 'git-commit-hook.js');
  const timestamp = new Date().toISOString();

  try {
    // core.hooksPath가 저장소 안의 추적 폴더(예: .husky)를 가리키면 팀 공용 파일을 수정하게 되므로 등록하지 않는다
    let gitCommonDir = path.join(repoRoot, '.git');
    try {
      gitCommonDir = path.resolve(repoRoot, execSync(`git -C "${repoRoot}" rev-parse --git-common-dir`, { encoding: 'utf-8' }).trim());
    } catch { /* 기본값 사용 */ }
    const rel = (from: string, to: string) => path.relative(from, to);
    const insideRepo = !rel(repoRoot, hookPath).startsWith('..') && !path.isAbsolute(rel(repoRoot, hookPath));
    const insideGitDir = !rel(gitCommonDir, hookPath).startsWith('..') && !path.isAbsolute(rel(gitCommonDir, hookPath));
    if (insideRepo && !insideGitDir) {
      throw new Error(`hooks 경로(${hookPath})가 저장소 추적 폴더 안이라 자동 등록하지 않음(core.hooksPath)`);
    }

    const block = buildDailyJournalBlock(gitCommitHookJsPath);
    let content = '';

    if (fs.existsSync(hookPath)) {
      content = fs.readFileSync(hookPath, 'utf-8');
      // 마커 방식 이전의 레거시 훅(스크립트 경로만 있음)도 등록된 것으로 본다(이중 등록 방지)
      if (content.includes(GIT_HOOK_MARKER_BEGIN) || content.includes('git-commit-hook.js')) {
        hooks[projectName] = { status: 'registered', timestamp, hookPath };
        saveGitHooks(hooks);
        return;
      }
      if (!content.endsWith('\n')) content += '\n';
      content += block + '\n';
    } else {
      content = `#!/bin/sh\n${block}\n`;
    }

    fs.mkdirSync(path.dirname(hookPath), { recursive: true });
    fs.writeFileSync(hookPath, content, 'utf-8');
    if (process.platform !== 'win32') fs.chmodSync(hookPath, 0o755);

    hooks[projectName] = { status: 'registered', timestamp, hookPath };
    saveGitHooks(hooks);
  } catch (e) {
    hooks[projectName] = { status: 'failed', timestamp, hookPath, error: String(e) };
    saveGitHooks(hooks);
    logError(`git hook 등록 실패 (${projectName}): ${e}`);
  }
}

function summarize(defaultPrompt: string, stylePrompt: string, response: string, model: ClaudeModel): string {
  const input = `${defaultPrompt}\n${stylePrompt}\n\n<content>\n${neutralizeFence(response)}\n</content>`;
  // Stop 훅 자체의 제한 시간(기본 60초) 안에 끝나야 기록이 남으므로 요약은 짧은 타임아웃을 쓴다
  const result = callClaude(input, model, SUMMARY_TIMEOUT_MS);

  if (result.error || result.status !== 0) {
    throw new Error(describeFailure(result));
  }
  return sanitizeSummary(result.stdout);
}

const SUMMARY_TIMEOUT_MS = 45_000;
const MAX_SUMMARY_CHARS = 3000;

// 요약이 아닌 응답(빈 응답, 거절/안내 문구, JSON, 지나치게 긴 응답)은 비워서 원문(answer)으로 대체되게 한다.
// 'SKIP'은 호출부가 그대로 판별해야 하므로 보존한다.
function sanitizeSummary(raw: string): string {
  const t = (raw || '').trim();
  if (!t) return '';
  if (t.toUpperCase() === 'SKIP') return 'SKIP';
  if (/^(no content|no text|i (can'?t|cannot|don'?t)|sorry|죄송|내용이 (없|제공))/i.test(t)) return '';
  if ((t.startsWith('{') || t.startsWith('[')) && (() => { try { JSON.parse(t); return true; } catch { return false; } })()) return '';
  return t.length > MAX_SUMMARY_CHARS ? t.slice(0, MAX_SUMMARY_CHARS) + '…' : t;
}

function main(): void {
  // summarize()에서 호출한 claude --print 종료 시 재진입 방지
  if (process.env.DAILY_JOURNAL_RUNNING === '1') {
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

  // 서브 claude(요약/일지 변환) 전용 작업 폴더에서 끝난 세션은 환경변수가 유실돼도 기록하지 않는다(재진입 이중 방어)
  if ((cwd || '').replace(/\\/g, '/').includes('/.claude/daily-journal/_runner')) {
    return;
  }

  const config = loadConfig();

  cleanupStaleSessionProjectCache();
  const projectName = getStableProjectName(session_id, cwd);

  if (!shouldTrackProject(config, projectName)) {
     readAndClearSessionEdits(session_id); // 제외 프로젝트의 편집 내용이 디스크에 쌓이지 않게 정리
     return;
  }

  if (config.save && config.gitCommit.use) {
    tryRegisterGitHook(cwd, projectName, config);
  }

  if (!config.save || !isInTimeRange(config.schedule.start, config.schedule.end, config.timeZone)) {
    readAndClearSessionEdits(session_id);
    return;
  }

  // transcript가 없는 외부 임시 세션(예: 삭제된 jobs/tmp 경로)은 에러 로그를 오염시키지 않고 조용히 skip
  if (!transcript_path || !fs.existsSync(transcript_path)) {
    readAndClearSessionEdits(session_id);
    return;
  }

  const { prompt: extractedPrompt, assistantTexts } = extractCurrentTurn(transcript_path);
  let prompt = extractedPrompt;
  if (prompt && isInternalJudgePrompt(prompt)) {
    readAndClearSessionEdits(session_id);
    return; // 외부 앱의 내부 판단 호출은 일지 대상이 아님
  }
  if (!prompt) {
    logError(`user 메시지 추출 실패 (session: ${session_id}), skip`);
    readAndClearSessionEdits(session_id);
    return;
  }

  // 스킬 호출 시 전체 SKILL.md 대신 첫 줄(경로)만 저장 - 포멧 변경시 수정 필요
  if (prompt.startsWith('Base directory for this skill:')) {
    prompt = "skill 사용 \n" + prompt.split('\n')[0];
  }

  // transcript에서 텍스트를 하나도 못 찾은 경우(예: transcript 아직 flush 전)에 한해
  // payload가 넘겨준 last_assistant_message를 안전망으로 사용한다.
  // transcript flush가 늦어 마지막 조각만 빠진 경우도 보완한다(마지막 조각이 payload 메시지를 포함하지 않으면 덧붙임).
  const texts = [...assistantTexts];
  if (last_assistant_message) {
    const tail = texts[texts.length - 1] ?? '';
    const probe = last_assistant_message.trim().slice(0, 200);
    if (texts.length === 0 || (probe && !tail.includes(probe))) texts.push(last_assistant_message);
  }
  const answer = buildAnswer(texts);

  let summary = ""

  // 요약 사용 여부에 따라 대화내용 요약본을 생성할지 결정
  // answer가 빈 텍스트(도구 호출만 하고 턴이 텍스트 응답 없이 끝난 경우)인 경우에는
  // 요약할 내용이 없으므로 summarize() 호출(서브 claude 프로세스 실행)을 건너뛴다.
  // (실제로 호출해보면 "No content provided." 같은 형식에 안 맞는 응답이 나옴)
  if(config.summary.use && answer){
    try {
      summary = summarize(config.summary.defaultPrompt, config.summary.stylePrompt, answer, config.summary.claudeModel);
    } catch (e) {
      // 요약만 실패해도 원문(answer)은 기록한다(일지 생성 시 [정리필요] 경로로 처리됨)
      logError(`요약 실패, 원문만 기록: ${e}`);
      summary = '';
    }

    if(summary.trim().toUpperCase() === 'SKIP') {
      readAndClearSessionEdits(session_id);
      return;
    }
  }

  const todayDir = getTodayDir(config);
  const historyDir = path.join(todayDir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  const time = getDateStringWithHourMinutes(config.timeZone)
  const fileEdits = readAndClearSessionEdits(session_id);

  const entry: HistoryEntry = {
    time,
    prompt,
    summary,
    answer,
    sessionId: session_id,
    ...(fileEdits.length > 0 ? { fileEdits } : {}),
  };

  // (중복 방지는 두지 않는다: 같은 세션이 같은 분에 같은 말을 반복하는 정상 턴을 버리게 되고,
  //  answer까지 동일한 실제 이중 발화는 기록상 확인되지 않았다)
  fs.appendFileSync(path.join(historyDir, `${projectName}.jsonl`), JSON.stringify(entry) + '\n');

  // 이미 일지가 생성된 날에 새 대화가 추가되면 modified로 변경
  recordRunHistory({ date: getDateString(config.timeZone), status: 'modified', timestamp: new Date().toISOString() });
}

try{
  main();
} catch (e) {
  logError(`stop-hook 오류: ${e}`);
}
