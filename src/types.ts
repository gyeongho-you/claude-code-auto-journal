export type Config = {
  schedule: {
    use: boolean;
    start: string;
    end: string;
    generateAt: string;
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
  focus: {
    use: boolean;
    files: string[];
  };
  cleanup: boolean;
  save: boolean;
  timeZone: string;
};

export type StdinPayload = {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  stop_hook_active: boolean;
  last_assistant_message: string;
};

export type FileEditEntry = {
  tool: 'Edit' | 'Write';
  file: string;
  before?: string;     // Edit: 수정 전
  after?: string;      // Edit: 수정 후
  historyRef?: string; // Write: file-history 경로
};

export type HistoryEntry = {
  time: string;
  prompt: string;
  summary: string;
  answer: string;
  fileEdits?: FileEditEntry[];
};

export type RunHistoryEntry = {
  date: string;
  status: 'create' | 'success' | 'failed' | 'no_data' | 'modified';
  timestamp: string;
  error?: string;
};

export type TranscriptLine = {
  type: 'user' | 'assistant' | 'summary';
  message?: {
    role: string;
    content: string | Array<{ type: string; text: string }>;
  };
  timestamp?: string;
};

export type PostToolUsePayload = {
  session_id: string;
  tool_name: string;
  tool_input: {
    file_path?: string;
    old_string?: string;
    new_string?: string;
    content?: string;
    [key: string]: unknown;
  };
};

export type SessionEditsState = {
  edits: FileEditEntry[];
  lastScan: string[];
};

//default값은 haiku
export const ClaudeModel = {
  haiku : "claude-haiku-4-5-20251001",
  sonnet : "claude-sonnet-4-6",
  opus : "claude-opus-4-6",
  default : "claude-haiku-4-5-20251001"
}

export type ClaudeModel = keyof typeof ClaudeModel
