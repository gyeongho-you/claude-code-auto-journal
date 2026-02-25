import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Config, RunHistoryEntry } from './types';

export const DATA_DIR = path.join(os.homedir(), '.claude', 'daily-journal');
const DEFAULT_OUTPUT_DIR = path.join(DATA_DIR, 'data');

function loadDefaultConfig(): Config {
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

export function loadConfig(): Config {
  const defaultConfig = loadDefaultConfig();
  const userConfigPath = path.join(DATA_DIR, 'user-config.json');

  if (!fs.existsSync(userConfigPath)) {
    return defaultConfig;
  }

  try {
    const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
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
      cleanup: userConfig.cleanup ?? defaultConfig.cleanup,
      save: userConfig.save ?? defaultConfig.save,
      timeZone: resolveTimeZone(userConfig.timeZone, defaultConfig.timeZone),
    };
  } catch {
    return defaultConfig;
  }
}

export function getDateString(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone }).format(new Date());
}

export function getNowMinutes(timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
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

export function recordRunHistory(entry: RunHistoryEntry): void {
  try {
    const historyPath = path.join(DATA_DIR, 'run-history.json');
    let history: Record<string, RunHistoryEntry> = {};
    if (fs.existsSync(historyPath)) {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    }
    const oldHistory = history[entry.date];

    // 일지작성에 대한 상태값인지 확인
    const isGenerateJournal = (s: string) => ['success', 'failed', 'no_data'].includes(s);

    if(!isGenerateJournal(entry.status)) {
      // 첫 생성시 create로 상태 생성
      if(!oldHistory) {
        entry.status = 'create';
      } else if(!isGenerateJournal(oldHistory?.status)) {
        return;
      }
    } else {
      if(!oldHistory) return;
    }

    history[entry.date] = entry;
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
  } catch {
    // run-history 기록 실패는 무시
  }
}

export function logError(message: string): void {
  try {
    const logPath = path.join(DATA_DIR, 'error.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // 에러 로그 실패는 무시
  }
}
