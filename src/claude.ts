import {spawnSync} from "child_process";
import {SpawnSyncReturns} from "node:child_process";
import {ClaudeModel} from "./types";

// claude 서브 세션 호출 메서드
export function callClaude(input: string, model: ClaudeModel) : SpawnSyncReturns<string> {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    env.DAILY_JOURNAL_RUNNING = '1'; // stop-hook 재진입 방지

    const claudeModel = ClaudeModel[model] ?? ClaudeModel.default;

    const result = spawnSync('claude', ['--print', '--model', claudeModel, '--allowedTools', 'none', '--output-format', 'text'], {
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