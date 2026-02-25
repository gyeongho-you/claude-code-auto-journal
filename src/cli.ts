#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import {DATA_DIR, loadConfig, logError} from './config';
import {RunHistoryEntry} from './types';
import {writeJournal} from "./generate-journal";
import {setup} from "./setup";

const RUN_HISTORY_PATH = path.join(DATA_DIR, 'run-history.json');

function loadRunHistory(): Record<string, RunHistoryEntry> {
  try {
    if (fs.existsSync(RUN_HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(RUN_HISTORY_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

// ─── write-journal ──────────────────────────────────────────────────────────

function cmdWriteJournal(): void {
  const config = loadConfig();
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n오늘(${today}) 일지 생성 중...\n`);
  writeJournal(today, config);
  console.log('');
}

// ─── config ────────────────────────────────────────────────────────────────

function cmdConfig(): void {
  const config = loadConfig();
  const userConfigPath = path.join(DATA_DIR, 'user-config.json');
  const hasUserConfig = fs.existsSync(userConfigPath);

  console.log(`\n현재 설정 (user-config.json ${hasUserConfig ? '적용됨' : '없음 — 기본값 사용'})\n`);
  console.log(`  schedule.start     : "${config.schedule.start}"`);
  console.log(`                       훅 활성화 시작 시간. 이 시간 이전 대화는 기록 안 함 \n`);
  console.log(`  schedule.end       : "${config.schedule.end}"`);
  console.log(`                       훅 활성화 종료 시간. Task Scheduler가 이 시간에 일지 생성`);
  console.log(`                       변경 시 setup 재실행 필요 \n`);
  console.log(`  summary.use        : ${config.summary.use}`);
  console.log(`                       false 시 응답 원본을 저장 (false시 claude 서브세션을 사용하지 않음[토큰절약]) \n`);
  console.log(`  summary.prompt     : "${config.summary.prompt.length > 60 ? config.summary.prompt.slice(0, 60)+ "..." : config.summary.prompt}"`);
  console.log(`                       대화 종료마다 응답을 요약할 때 쓰는 프롬프트 \n`);
  console.log(`  journal.output_dir : "${config.journal.output_dir}"`);
  console.log(`                       일지 저장 경로. YYYY-MM-DD/journal.md 형태로 저장됨 \n`);
  console.log(`  journal.prompt     : "${config.journal.prompt.length > 60 ? config.journal.prompt.slice(0, 60)+ "..." : config.journal.prompt}"`);
  console.log(`                       일지 작성 스타일 등을 정하는 프롬프트 \n`);
  console.log(`  cleanup            : ${config.cleanup}`);
  console.log(`                       일지 생성 후 history 파일 삭제 여부 ( 당일 생성된 history는 삭제되지 않음 ) \n`);
  console.log(`  save               : ${config.save}`);
  console.log(`                       prompt를 저장할지 여부 ( false 시 저장이 안됨 ) \n`);
  console.log(`\n  설정 파일 위치: ${userConfigPath}\n`);
}

// ─── logs ──────────────────────────────────────────────────────────────────

function cmdLogs(): void {
  const history = loadRunHistory();
  const entries = Object.values(history).sort((a, b) => b.date.localeCompare(a.date));

  if (entries.length === 0) {
    console.log('실행 기록이 없습니다.');
    return;
  }

  const statusIcon: Record<string, string> = {
    create:   '○',
    success:  '✓',
    failed:   '✗',
    no_data:  '-',
    modified: '~',
  };

  console.log('\n실행 기록:\n');
  for (const entry of entries) {
    const icon = statusIcon[entry.status] ?? '?';
    const detail =
      entry.status === 'success'  ? `${entry.entry_count}개 항목` :
      entry.status === 'modified' ? `${entry.entry_count ?? 0}개 항목 (수정됨)` :
      entry.status === 'failed'   ? `오류: ${entry.error}` :
      entry.status === 'create'   ? '생성 중 (미완료)' :
      '데이터 없음';
    console.log(`  ${icon} ${entry.date}  [${entry.status.padEnd(8)}]  ${detail}`);
  }
  console.log('');

  const total = entries.length;
  const success  = entries.filter(e => e.status === 'success').length;
  const modified = entries.filter(e => e.status === 'modified').length;
  const failed   = entries.filter(e => e.status === 'failed').length;
  const noData   = entries.filter(e => e.status === 'no_data').length;
  console.log(`  총 ${total}일  |  성공 ${success}  수정됨 ${modified}  실패 ${failed}  데이터없음 ${noData}\n`);
}

// ─── retry ─────────────────────────────────────────────────────────────────

function cmdRetry(): void {
  const history = loadRunHistory();
  const failed = Object.values(history)
    .filter(e => e.status === 'failed')
    .sort((a, b) => a.date.localeCompare(b.date));

  if (failed.length === 0) {
    console.log('재생성할 실패 항목이 없습니다.');
    return;
  }

  const config = loadConfig();
  console.log(`\n실패 항목 ${failed.length}건 재생성 시작...\n`);

  for (const entry of failed) {
    console.log(`  ${entry.date}:`);
    writeJournal(entry.date, config);
  }

  console.log('\n완료\n');
}

// ─── help ──────────────────────────────────────────────────────────────────

function cmdHelp(): void {
  console.log('\n사용법: dj <command>\n');
  console.log('  help               이 도움말 표시');
  console.log('  config             현재 설정 및 옵션 확인');
  console.log('  logs               일지 생성 성공/실패 기록 확인');
  console.log('  write-journal      일지 생성 (생성, 실패, 수정된 일자의 일지를 생성)');
  console.log('  retry              실패한 날짜의 일지 재생성');
  console.log('  setup              설정값 적용\n');
}

// ─── router ────────────────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case 'help':
    cmdHelp();
    break;
  case 'config':
    cmdConfig();
    break;
  case 'logs':
    cmdLogs();
    break;
  case 'write-journal':
    try { cmdWriteJournal(); } catch (e) { logError(String(e)); process.exit(1); }
    break;
  case 'retry':
    try { cmdRetry(); } catch (e) { logError(String(e)); process.exit(1); }
    break;
  case 'setup':
    try { setup(); } catch (e) { logError(String(e)); process.exit(1); }
    break;
  default:
    cmdHelp();
    break;
}
