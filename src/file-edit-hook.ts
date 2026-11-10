import * as fs from 'fs';
import * as path from 'path';
import { PostToolUsePayload, SessionEditsState } from './types';
import { SESSION_EDITS_DIR, getStableProjectName, loadConfig, shouldTrackProject } from './config';

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

  // 기록하지 않는 프로젝트(제외/비포커스, save=false)의 파일 내용은 디스크에 남기지 않는다
  const config = loadConfig();
  if (!config.save) return;
  if (payload.cwd) { // cwd가 없으면 프로젝트명을 확정할 수 없으므로(캐시 오염 방지) 필터하지 않는다
    const projectName = getStableProjectName(session_id, payload.cwd);
    if (!shouldTrackProject(config, projectName)) return;
  }

  const state = readState(session_id);

  if (tool_name === 'Edit') {
    state.edits.push({
      tool: 'Edit',
      file: filePath,
      before: clip(tool_input.old_string ?? ''),
      after: clip(tool_input.new_string ?? ''),
    });
  } else if (tool_name === 'Write') {
    state.edits.push({ tool: 'Write', file: filePath, after: clip(tool_input.content ?? '') });
  }

  writeState(session_id, state);
}

// 파일 전체 내용(Write)이 무한히 커지지 않도록 상한을 둔다
const MAX_EDIT_CHARS = 20_000;
function clip(text: string): string {
  return text.length > MAX_EDIT_CHARS ? text.slice(0, MAX_EDIT_CHARS) + '\n...(생략)' : text;
}

try {
  main();
} catch {
  // 조용히 종료
}
