import {spawnSync} from "child_process";
import {SpawnSyncReturns} from "node:child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {ClaudeModel} from "./types";

function getEmptyMcpConfigPath(): string {
    const configPath = path.join(os.tmpdir(), 'daily-journal-empty-mcp.json');
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }), 'utf-8');
    }
    return configPath;
}

// claude 서브 세션 호출 메서드
export function callClaude(input: string, model: ClaudeModel) : SpawnSyncReturns<string> {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    env.DAILY_JOURNAL_RUNNING = '1'; // stop-hook 재진입 방지
    env.CLAUDE_CODE_SKIP_PROMPT_HISTORY = '1';

    const claudeModel = ClaudeModel[model] ?? ClaudeModel.default;

    const claudeCmd = process.platform === 'win32' ? 'chcp 65001 >nul 2>&1 && claude' : 'claude';

    const result = spawnSync(claudeCmd, ['--print', '--model', claudeModel, '--allowedTools', 'none', '--output-format', 'text', '--mcp-config', getEmptyMcpConfigPath(), '--strict-mcp-config'], {
        input,
        encoding: 'utf-8',
        timeout: 180000,
        shell: true,
        env
    });

    // Claude Code 2.x: --output-format text 응답이 stderr로 출력됨
    const stdout = (result.stdout || '').trim()
        ? result.stdout
        : result.stderr;

    return { ...result, stdout };
}