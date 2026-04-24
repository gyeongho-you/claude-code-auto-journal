import * as fs from 'fs';
import * as path from 'path';
import { PostToolUsePayload, SessionEditsState } from './types';
import { SESSION_EDITS_DIR } from './config';

const FILE_HISTORY_DIR = path.join(require('os').homedir(), '.claude', 'file-history');

function readState(sessionId: string): SessionEditsState {
  const filePath = path.join(SESSION_EDITS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return { edits: [], lastScan: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { edits: [], lastScan: [] };
  }
}

function writeState(sessionId: string, state: SessionEditsState): void {
  fs.mkdirSync(SESSION_EDITS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SESSION_EDITS_DIR, `${sessionId}.json`), JSON.stringify(state), 'utf-8');
}

function scanHistoryDir(sessionId: string): string[] {
  const dir = path.join(FILE_HISTORY_DIR, sessionId);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function findNewestFile(sessionId: string, files: string[]): string | undefined {
  if (files.length === 0) return undefined;
  const dir = path.join(FILE_HISTORY_DIR, sessionId);
  try {
    return files
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0].name;
  } catch {
    return files[files.length - 1];
  }
}

function main(): void {
  const stdinData = fs.readFileSync(0, 'utf-8');
  let payload: PostToolUsePayload;
  try {
    payload = JSON.parse(stdinData);
  } catch {
    return;
  }

  const { session_id, tool_name, tool_input } = payload;
  const filePath = tool_input?.file_path;
  if (!filePath) return;

  const state = readState(session_id);

  if (tool_name === 'Edit') {
    state.edits.push({
      tool: 'Edit',
      file: filePath,
      before: tool_input.old_string ?? '',
      after: tool_input.new_string ?? '',
    });
    state.lastScan = scanHistoryDir(session_id);

  } else if (tool_name === 'Write') {
    const currentScan = scanHistoryDir(session_id);
    const prevSet = new Set(state.lastScan);
    const newFiles = currentScan.filter(f => !prevSet.has(f));

    const newest = findNewestFile(session_id, newFiles);
    const historyRef = newest
      ? path.join(FILE_HISTORY_DIR, session_id, newest)
      : undefined;

    state.edits.push({ tool: 'Write', file: filePath, historyRef });
    state.lastScan = currentScan;
  }

  writeState(session_id, state);
}

try {
  main();
} catch {
  // 조용히 종료
}
