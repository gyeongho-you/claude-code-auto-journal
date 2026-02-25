import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {DATA_DIR, loadConfig} from './config';
import {execSync} from "child_process";

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const PLUGIN_DIR = path.join(CLAUDE_DIR, 'plugins', 'daily-journal');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

function registerStopHook(): void {
  const hookCommand = `node "${path.join(PLUGIN_DIR, 'dist', 'stop-hook.js')}"`;

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    } catch {
      settings = {};
    }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const stopHooks = (hooks.Stop ?? []) as Array<{ hooks: Array<{ type: string; command: string }> }>;

  // 이미 등록된 경우 skip
  const alreadyRegistered = stopHooks.some(h =>
    h.hooks?.some(hh => hh.command?.includes('daily-journal'))
  );

  if (!alreadyRegistered) {
    stopHooks.push({
      hooks: [{ type: 'command', command: hookCommand }],
    });
  }

  settings.hooks = { ...hooks, Stop: stopHooks };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  console.log('✓ Stop 훅 등록 완료');
}

function registerTaskScheduler(endTime: string): void {
  if (process.platform === 'win32') {
    registerWindowsScheduler(endTime);
  } else {
    registerCronJob(endTime);
  }
}

function registerWindowsScheduler(endTime: string): void {
  const [hour, minute] = endTime.split(':');
  const generateScript = path.join(PLUGIN_DIR, 'dist', 'generate-journal.js');
  const taskName = 'DailyJournalPlugin';

  const deleteCmd = `schtasks /delete /tn "${taskName}" /f 2>nul`;
  const createCmd = [
    `schtasks /create /tn "${taskName}"`,
    `/tr "node \\"${generateScript}\\""`,
    `/sc daily /st ${hour}:${minute}`,
    `/f`,
  ].join(' ');

  try {
    execSync(deleteCmd, { stdio: 'ignore' });
  } catch { /* 없으면 무시 */ }

  execSync(createCmd, { stdio: 'inherit' });
  console.log(`✓ Task Scheduler 등록 완료 (매일 ${endTime})`);
}

function registerCronJob(endTime: string): void {
  const [hour, minute] = endTime.split(':');
  const generateScript = path.join(PLUGIN_DIR, 'dist', 'generate-journal.js');
  const cronLine = `${minute} ${hour} * * * node "${generateScript}" # daily-journal-plugin`;

  let currentCrontab = '';
  try {
    currentCrontab = execSync('crontab -l', { encoding: 'utf-8' });
  } catch { /* crontab 없으면 무시 */ }

  const filtered = currentCrontab.split('\n')
    .filter(l => !l.includes('daily-journal-plugin'))
    .filter(Boolean);
  filtered.push(cronLine);

  const tmpFile = path.join(os.tmpdir(), 'daily-journal-crontab.tmp');
  fs.writeFileSync(tmpFile, filtered.join('\n') + '\n', 'utf-8');
  execSync(`crontab "${tmpFile}"`);
  fs.unlinkSync(tmpFile);

  console.log(`✓ cron 등록 완료 (매일 ${endTime})`);
}

function createUserConfigIfAbsent(): void {
  const userConfigPath = path.join(DATA_DIR, 'user-config.json');
  if (fs.existsSync(userConfigPath)) return;

  const defaultConfig = {
    schedule: {
      start: '09:00',
      end: '18:00',
    },
    summary: {
      use: true,
      prompt: '다음 Claude 응답을 핵심만 1~2줄로 요약해줘. 변경된 파일, 해결한 문제 위주로.',
    },
    journal: {
      prompt: '아래 작업 요약 목록을 바탕으로 오늘의 개발 일지를 마크다운으로 작성해줘.',
      output_dir: '',
    },
    cleanup: false,
    save: true,
  };

  fs.writeFileSync(userConfigPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
  console.log(`✓ 사용자 설정 파일 생성: ${userConfigPath}`);
}

function main(): void {
  setup();
}

export function setup(): void {
  // 1. 데이터 디렉토리 생성
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`✓ 데이터 디렉토리 생성: ${DATA_DIR}`);

  // 2. user-config.json 생성 (없을 때만)
  createUserConfigIfAbsent();

  // 3. Stop 훅 등록
  registerStopHook();

  // 4. 스케쥴러 등록
  const config = loadConfig();
  registerTaskScheduler(config.schedule.end);

  // 5. 전역 CLI 등록 (dj 명령어)
  try {
    execSync('npm link', { cwd: PLUGIN_DIR, stdio: 'ignore' });
    console.log('✓ CLI 전역 등록 완료 (dj 명령어 사용 가능)');
  } catch {
    console.warn('⚠ CLI 전역 등록 실패. 수동으로 등록하려면:');
    console.warn(`  cd "${PLUGIN_DIR}" && npm link`);
  }

  console.log('\n✅ daily-journal 플러그인 설치 완료');
  console.log(`   데이터 위치: ${DATA_DIR}`);
  console.log(`   일지 생성 시간: 매일 ${config.schedule.end}`);
  console.log('\n   사용자 설정 파일: ~/.claude/daily-journal/user-config.json');
  console.log('\n   ─────────────────────────────────────────────────');
  console.log('   도움말 dj help');
  console.log('   ─────────────────────────────────────────────────');
}

const isDirectRun = process.argv[1]?.endsWith('setup.js') ||
    process.argv[1]?.endsWith('setup.ts');
if (isDirectRun) {
  main();
}
