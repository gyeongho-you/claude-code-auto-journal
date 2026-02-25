import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig } from './config';

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const DATA_DIR = path.join(HOME, '.claude', 'daily-journal');
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
  const [hour, minute] = endTime.split(':');
  const generateScript = path.join(PLUGIN_DIR, 'dist', 'generate-journal.js');
  const taskName = 'DailyJournalPlugin';

  // 기존 작업 제거 후 재등록
  const deleteCmd = `schtasks /delete /tn "${taskName}" /f 2>nul`;
  const createCmd = [
    `schtasks /create /tn "${taskName}"`,
    `/tr "node \\"${generateScript}\\""`,
    `/sc daily /st ${hour}:${minute}`,
    `/f`,
  ].join(' ');

  const { execSync } = require('child_process');
  try {
    execSync(deleteCmd, { stdio: 'ignore' });
  } catch { /* 없으면 무시 */ }

  execSync(createCmd, { stdio: 'inherit' });
  console.log(`✓ Task Scheduler 등록 완료 (매일 ${endTime})`);
}

function main(): void {
  // 1. 데이터 디렉토리 생성
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`✓ 데이터 디렉토리 생성: ${DATA_DIR}`);

  // 2. Stop 훅 등록
  registerStopHook();

  // 3. Task Scheduler 등록
  const config = loadConfig();
  registerTaskScheduler(config.schedule.end);

  // 4. 전역 CLI 등록 (dj 명령어)
  const { execSync } = require('child_process');
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

main();
