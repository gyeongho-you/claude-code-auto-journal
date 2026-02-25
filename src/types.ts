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
  };
  journal: {
    defaultPrompt: string;
    stylePrompt: string;
    output_dir: string;
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
  timestamp: string;
  session_id: string;
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
