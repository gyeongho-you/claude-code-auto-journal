#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import {DATA_DIR, loadConfig, logError, getDateString} from './config';
import {RunHistoryEntry} from './types';
import {writeJournal} from "./generate-journal";
import {setup, uninstall} from "./setup";

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
  const today = getDateString(config.timeZone);
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
  console.log(`  schedule.use         : ${config.schedule.use}`);
  console.log(`                           - false 시 스케쥴러 등록 안 함. 수동으로 dj write-journal 사용 ( 변경 시 setup 필요 )\n`);
  console.log(`  schedule.start       : "${config.schedule.start}"`);
  console.log(`                           - 훅 활성화 시작 시간. 이 시간 이전 대화는 기록 안 함 \n`);
  console.log(`  schedule.end         : "${config.schedule.end}"`);
  console.log(`                           - 훅 활성화 종료 시간. 스케쥴러가 이 시간에 일지 생성`);
  console.log(`                           - 변경 시 setup 재실행 필요 \n`);
  console.log(`  summary.use          : ${config.summary.use}`);
  console.log(`                           - true 시 Claude가 응답을 요약해 저장. \`stylePrompt\`로 SKIP을 반환하도록 설정하면 해당 대화는 저장하지 않음.`);
  console.log(`                           - false 시 응답 원본을 그대로 저장 (Claude 호출 없음, 토큰 절약) \n`);
  console.log(`  summary.stylePrompt  : "${config.summary.stylePrompt.length > 60 ? config.summary.stylePrompt.slice(0, 60)+ "..." : config.summary.stylePrompt}"`);
  console.log(`                           - 대화 종료마다 응답을 요약할 때 쓰는 프롬프트 \n`);
  console.log(`  journal.output_dir   : "${config.journal.output_dir}"`);
  console.log(`                           - 일지 저장 경로. YYYY-MM-DD/journal.md 형태로 저장됨 \n`);
  console.log(`  journal.stylePrompt  : "${config.journal.stylePrompt.length > 60 ? config.journal.stylePrompt.slice(0, 60)+ "..." : config.journal.stylePrompt}"`);
  console.log(`                           - 일지 작성 스타일 등을 정하는 프롬프트 \n`);
  console.log(`  cleanup              : ${config.cleanup}`);
  console.log(`                           - 일지 생성 후 history 파일 삭제 여부 ( 당일 생성된 history는 삭제되지 않음 ) \n`);
  console.log(`  save                 : ${config.save}`);
  console.log(`                           - prompt를 저장할지 여부 ( false 시 저장이 안됨 ) \n`);
  console.log(`  timeZone             : ${config.timeZone}`);
  console.log(`                           - 원하는 timeZone 설정 ( 미설정 또는 유효하지 않을 시 기본 Asia/Seoul로 설정됨 ) \n`);
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

  console.log('\n실행 기록:\n');
  entries.forEach(entry => {
    switch (entry.status) {
      case 'success': console.log(entry.date + ' : success'); break;
      case 'failed':  console.log(entry.date + ' : failed / error : ' + entry.error); break;
      case 'modified': console.log(entry.date + ' : modified'); break;
      case 'no_data': console.log(entry.date + ' : no_data'); break;
      case 'create': console.log(entry.date + ' : create'); break;
    }
  })

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
    .filter(e => ( e.status === 'failed' || e.status === 'modified'))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (failed.length === 0) {
    console.log('재생성할 항목이 없습니다.');
    return;
  }

  const config = loadConfig();
  console.log(`\n실패/수정 항목 ${failed.length}건 재생성 시작...\n`);

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
  console.log('  write-journal      오늘 일지 수동 생성');
  console.log('  retry              일지 생성에 실패한 날짜 들의 일지 재생성');
  console.log('  setup              설정값 적용');
  console.log('  uninstall          설치 삭제\n');
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
  case 'uninstall':
    try { uninstall(); } catch (e) { logError(String(e)); process.exit(1); }
    break;
  default:
    cmdHelp();
    break;
}
