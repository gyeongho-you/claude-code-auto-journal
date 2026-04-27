import * as fs from 'fs';
import * as path from 'path';
import { PostToolUsePayload, SessionEditsState } from './types';
import { SESSION_EDITS_DIR } from './config';

function readState(sessionId: string): SessionEditsState {
  const filePath = path.join(SESSION_EDITS_DIR, `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return { edits: [] };
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return { edits: [] };
  }
}

function writeState(sessionId: string, state: SessionEditsState): void {
  fs.mkdirSync(SESSION_EDITS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SESSION_EDITS_DIR, `${sessionId}.json`), JSON.stringify(state), 'utf-8');
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
  } else if (tool_name === 'Write') {
    state.edits.push({ tool: 'Write', file: filePath });
  }

  writeState(session_id, state);
}

try {
  main();
} catch {
  // 조용히 종료
}
