import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Config, FileEditEntry, GitHookEntry, RunHistoryEntry } from './types';

export const DATA_DIR = path.join(os.homedir(), '.claude', 'daily-journal');
export const PLUGIN_DIR = path.join(os.homedir(), '.claude', 'plugins', 'daily-journal');
export const GIT_HOOKS_PATH = path.join(DATA_DIR, 'git-hooks.json');
export const GIT_HOOK_MARKER_BEGIN = '# BEGIN daily-journal';
export const GIT_HOOK_MARKER_END = '# END daily-journal';
export const SESSION_EDITS_DIR = path.join(os.homedir(), '.claude', 'session-edits');
const DEFAULT_OUTPUT_DIR = path.join(DATA_DIR, 'data');

export function loadDefaultConfig(): Config {
  const configPath = path.join(__dirname, '..', 'config.json');
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return {
    ...raw,
    journal: {
      ...raw.journal,
      output_dir: raw.journal?.output_dir || DEFAULT_OUTPUT_DIR,
    },
  };
}

function resolveTimeZone(candidate: unknown, fallback: string): string {
  if (typeof candidate !== 'string' || !candidate) return fallback;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    logError(`유효하지 않은 timeZone: "${candidate}", 기본값 사용: "${fallback}"`);
    return fallback;
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

export function loadConfig(): Config {
  const defaultConfig = loadDefaultConfig();
  const userConfigPath = path.join(DATA_DIR, 'user-config.json');

  if (!fs.existsSync(userConfigPath)) {
    return defaultConfig;
  }

  try {
    const userConfig = JSON.parse(stripBom(fs.readFileSync(userConfigPath, 'utf-8')));
    return {
      ...defaultConfig,
      schedule: { ...defaultConfig.schedule, ...userConfig.schedule },
      summary: {
        ...defaultConfig.summary,
        ...userConfig.summary,
        defaultPrompt: defaultConfig.summary.defaultPrompt,
      },
      journal: {
        ...defaultConfig.journal,
        ...userConfig.journal,
        defaultPrompt: defaultConfig.journal.defaultPrompt,
        output_dir: userConfig.journal?.output_dir || defaultConfig.journal.output_dir,
      },
      focus: { ...defaultConfig.focus, ...userConfig.focus },
      exclude: { ...defaultConfig.exclude, ...userConfig.exclude },
      gitCommit: { ...defaultConfig.gitCommit, ...userConfig.gitCommit },
      cleanup: userConfig.cleanup ?? defaultConfig.cleanup,
      save: userConfig.save ?? defaultConfig.save,
      timeZone: resolveTimeZone(userConfig.timeZone, defaultConfig.timeZone),
    };
  } catch (e) {
    logError(`user-config.json 파싱 실패: ${e}`);
    return defaultConfig;
  }
}

export function extractProjectName(cwd: string): string {
  if (!cwd) return '_unknown';
  const parts = cwd.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || '_unknown';
}

const SESSION_PROJECT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7일

// 같은 세션 안에서 cwd가 바뀌어도(예: 다른 폴더 파일 작업) 세션 최초 cwd 기준
// 프로젝트 이름을 그대로 유지하기 위한 캐시
export function getStableProjectName(sessionId: string, cwd: string): string {
  const filePath = path.join(SESSION_EDITS_DIR, `${sessionId}.project.json`);

  try {
    if (fs.existsSync(filePath)) {
      const cached = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (cached.projectName) return cached.projectName;
    }
  } catch {
    // 손상된 캐시는 무시하고 재계산
  }

  const projectName = extractProjectName(cwd);
  try {
    fs.mkdirSync(SESSION_EDITS_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ projectName, cwd }), 'utf-8');
  } catch {
    // 캐시 저장 실패는 이번 실행에만 영향
  }
  return projectName;
}

// 오래된 세션 캐시 파일 누적 방지
export function cleanupStaleSessionProjectCache(): void {
  try {
    if (!fs.existsSync(SESSION_EDITS_DIR)) return;
    const now = Date.now();
    for (const file of fs.readdirSync(SESSION_EDITS_DIR)) {
      if (!file.endsWith('.project.json')) continue;
      const filePath = path.join(SESSION_EDITS_DIR, file);
      if (now - fs.statSync(filePath).mtimeMs > SESSION_PROJECT_CACHE_MAX_AGE_MS) {
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    // 정리 실패는 무시
  }
}

// focus.files와 exclude.files에 같은 프로젝트가 있으면 focus가 우선 (포함)
export function shouldTrackProject(config: Config, projectName: string): boolean {
  if (config.focus.use) {
    return config.focus.files.includes(projectName);
  }
  if (config.exclude.use && config.exclude.files.includes(projectName)) {
    return false;
  }
  return true;
}

export function getDateString(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone }).format(new Date());
}

export function getDateStringWithHourMinutes(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function getDateStringWithHourMinutesSeconds(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function getNowMinutes(timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0') % 24;
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

export function getTodayDir(config: Config): string {
  return path.join(config.journal.output_dir, getDateString(config.timeZone));
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

function readRunHistory(historyPath: string): Record<string, RunHistoryEntry> {
  if (!fs.existsSync(historyPath)) return {};
  try {
    return JSON.parse(stripBom(fs.readFileSync(historyPath, 'utf-8')));
  } catch (e) {
    // 손상된 파일은 백업해 두고 새로 시작한다(이후 모든 기록이 조용히 실패하는 것을 방지)
    try { fs.copyFileSync(historyPath, `${historyPath}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    logError(`run-history.json 파싱 실패, 백업 후 새로 시작: ${e}`);
    return {};
  }
}

// 일지작성에 대한 상태값인지 확인
const isGenerateStatus = (s: string) => ['success', 'failed', 'no_data'].includes(s);

export function recordRunHistory(entry: RunHistoryEntry): void {
  try {
    const historyPath = path.join(DATA_DIR, 'run-history.json');
    const history = readRunHistory(historyPath);
    const oldHistory = history[entry.date];

    if (!isGenerateStatus(entry.status)) {
      // 새 대화/커밋이 추가됨 (create | modified)
      if (!oldHistory) {
        entry.status = 'create'; // 첫 기록
      } else if (!isGenerateStatus(oldHistory.status)) {
        return; // 이미 create/modified 상태
      } else if (oldHistory.status === 'failed') {
        // 실패 사유와 누적 실패 횟수는 보존(진단 정보 유실 방지)
        entry.error = oldHistory.error;
        entry.attempts = oldHistory.attempts;
      }
    } else if (entry.status === 'failed') {
      entry.attempts = (oldHistory?.attempts ?? 0) + 1;
    }
    // success/no_data 는 이전 기록이 없어도 항상 기록한다(attempts 초기화)

    history[entry.date] = entry;
    writeJsonAtomic(historyPath, history);
  } catch {
    // run-history 기록 실패는 무시
  }
}

export function loadRunHistoryEntry(date: string): RunHistoryEntry | undefined {
  try {
    return readRunHistory(path.join(DATA_DIR, 'run-history.json'))[date];
  } catch {
    return undefined;
  }
}

export function readAndClearSessionEdits(sessionId: string): FileEditEntry[] {
  const filePath = path.join(SESSION_EDITS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    try { fs.unlinkSync(filePath); } catch { /* 삭제 실패는 무시 */ }
    return data.edits ?? [];
  } catch {
    return [];
  }
}

export function loadGitHooks(): Record<string, GitHookEntry> {
  if (!fs.existsSync(GIT_HOOKS_PATH)) return {};
  try {
    return JSON.parse(stripBom(fs.readFileSync(GIT_HOOKS_PATH, 'utf-8')));
  } catch {
    try { fs.copyFileSync(GIT_HOOKS_PATH, `${GIT_HOOKS_PATH}.corrupt-${Date.now()}`); } catch { /* ignore */ }
    return {};
  }
}

export function saveGitHooks(hooks: Record<string, GitHookEntry>): void {
  writeJsonAtomic(GIT_HOOKS_PATH, hooks);
}

// logError는 loadConfig를 부르지 않는다(loadConfig↔logError 무한 재귀 방지).
const LOG_TIME_ZONE = 'Asia/Seoul';

export function logError(message: string): void {
  try {
    const logPath = path.join(DATA_DIR, 'error.log');
    fs.appendFileSync(logPath, `[${getDateStringWithHourMinutesSeconds(LOG_TIME_ZONE)}] ${message}\n`);
    console.error(`[Error] ${message}`);
  } catch {
    // 에러 로그 실패는 무시
  }
}
