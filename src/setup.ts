import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {DATA_DIR, loadConfig} from './config';
import {execSync} from "child_process";

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const PLUGIN_DIR = path.join(CLAUDE_DIR, 'plugins', 'daily-journal');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

function initClaudeSetting(): void {
  // hook 등록
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

  // 기록파일 쓰기권한 추가
  const permissions = (settings.permissions ?? {}) as Record<string, unknown>;
  const allowList = (permissions.allow ?? []) as string[];
  const dailyJournalPermission = `Write(${path.join(DATA_DIR, '**')})`;

  if (!allowList.includes(dailyJournalPermission)) {
    allowList.push(dailyJournalPermission);
  }

  settings.permissions = { ...permissions, allow: allowList };

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  console.log('✓ Stop 훅, write 권한 등록 완료');
}

function registerTaskScheduler(endTime: string): void {
  if (process.platform === 'win32') {
    registerWindowsScheduler(endTime);
  } else {
    registerCronJob(endTime);
  }
}

function unregisterTaskScheduler(): void {
  if (process.platform === 'win32') {
    try {
      execSync(`schtasks /delete /tn "DailyJournalPlugin" /f`, { stdio: 'ignore' });
    } catch { /* 없으면 무시 */ }
  } else {
    let currentCrontab = '';
    try {
      currentCrontab = execSync('crontab -l', { encoding: 'utf-8' });
    } catch { /* crontab 없으면 무시 */ }

    const filtered = currentCrontab.split('\n')
      .filter(l => !l.includes('daily-journal-plugin'))
      .filter(Boolean);

    if (filtered.length > 0) {
      const tmpFile = path.join(os.tmpdir(), 'daily-journal-crontab.tmp');
      fs.writeFileSync(tmpFile, filtered.join('\n') + '\n', 'utf-8');
      execSync(`crontab "${tmpFile}"`);
      fs.unlinkSync(tmpFile);
    } else {
      try {
        execSync('crontab -r', { stdio: 'ignore' });
      } catch { /* 없으면 무시 */ }
    }
  }
  console.log('- 스케쥴러 제거 완료');
}

function registerWindowsScheduler(endTime: string): void {
  const [h, m] = endTime.split(':');
  const hour = h.padStart(2, '0');
  const minute = m.padStart(2, '0');
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
      use: true,
      start: '09:00',
      end: '18:00',
    },
    summary: {
      use: true,
      claudeModel: "haiku",
      stylePrompt: '핵심만 3줄 이내로 요약. 변경된 파일, 사용된 기술, 해결된 문제를 중심으로',
    },
    journal: {
      stylePrompt: '각 프로젝트별로 형식은 마크다운 형식으로 작성',
      claudeModel: "haiku",
      output_dir: '',
    },
    cleanup: false,
    save: true,
    timeZone: 'Asia/Seoul',
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

  // 3. claudeSetting값 수정 ( 훅 등록, 쓰기권한 등록 )
  initClaudeSetting();

  // 4. 스케쥴러 등록
  const config = loadConfig();
  if (config.schedule.use) {
    registerTaskScheduler(config.schedule.end);
  } else {
    console.log('스케줄러 제거. (daily-journal.schedule.use: false)')
    unregisterTaskScheduler();
  }

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
  if(config.schedule.use){
    console.log(`   일지 생성 시간: 매일 ${config.schedule.end}`);
  }
  console.log('\n   사용자 설정 파일: ~/.claude/daily-journal/user-config.json');
  console.log('\n   ─────────────────────────────────────────────────');
  console.log('   도움말 dj help');
  console.log('   ─────────────────────────────────────────────────');
}

function removeClaudeSetting(): void {
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
  settings.hooks = { ...hooks, Stop: stopHooks.filter(h => !h.hooks?.some(hh => hh.command?.includes('daily-journal'))) };

  const permissions = (settings.permissions ?? {}) as Record<string, unknown>;
  const allowList = (permissions.allow ?? []) as string[];
  const dailyJournalPermission = `Write(${path.join(DATA_DIR, '**')})`;
  settings.permissions = { ...permissions, allow: allowList.filter(p => p !== dailyJournalPermission) };

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  console.log('✓ Stop 훅, write 권한 제거 완료');
}

export function uninstall(): void {
  // 1. Stop 훅 삭제
  removeClaudeSetting();

  // 2. 스케쥴러 삭제
  console.log('스케줄러 제거.')
  unregisterTaskScheduler();


  // 3. 전역 CLI 삭제 (dj 명령어)
  try {
    execSync('npm unlink', { cwd: PLUGIN_DIR, stdio: 'ignore' });
    console.log('✓ CLI 전역 삭제 완료');
  } catch {
    console.warn('⚠ CLI 전역 삭제 실패. 수동으로 삭제하려면:');
    console.warn(`  cd "${PLUGIN_DIR}" && npm unlink`);
  }

  console.log('\n✅ daily-journal 제거완료');
  console.log(`     - 플러그인 폴더를 완전히 삭제하려면: ${PLUGIN_DIR} 폴더를 삭제해주세요.`);
  console.log(`     - 재설치 명령어 : node "${PLUGIN_DIR}/dist/setup.js"`);
}

const isDirectRun = process.argv[1]?.endsWith('setup.js') ||
    process.argv[1]?.endsWith('setup.ts');
if (isDirectRun) {
  main();
}
