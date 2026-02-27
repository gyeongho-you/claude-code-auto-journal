export interface Config {
  schedule: {
    use: boolean;
    start: string;
    end: string;
  };
  summary: {
    use: boolean;
    defaultPrompt: string;
    stylePrompt: string;
    claudeModel: ClaudeModel;
  };
  journal: {
    defaultPrompt: string;
    stylePrompt: string;
    output_dir: string;
    claudeModel: ClaudeModel;
  };
  cleanup: boolean;
  save: boolean;
  timeZone: string;
}

export interface StdinPayload {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  stop_hook_active: boolean;
  last_assistant_message: string;
}

export interface HistoryEntry {
  time: string;
  prompt: string;
  summary: string;
}

export interface RunHistoryEntry {
  date: string;
  status: 'create' | 'success' | 'failed' | 'no_data' | 'modified';
  timestamp: string;
  error?: string;
}

export interface TranscriptLine {
  type: 'user' | 'assistant' | 'summary';
  message?: {
    role: string;
    content: string | Array<{ type: string; text: string }>;
  };
  timestamp?: string;
}

//default값은 haiku
export const ClaudeModel = {
  haiku : "claude-haiku-4-5-20251001",
  sonnet : "claude-sonnet-4-6",
  opus : "claude-opus-4-6",
  default : "claude-haiku-4-5-20251001"
}

export type ClaudeModel = keyof typeof ClaudeModel