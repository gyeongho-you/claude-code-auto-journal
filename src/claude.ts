import {spawnSync} from "child_process";
import {SpawnSyncReturns} from "node:child_process";
import {ClaudeModel} from "./types";

// claude 서브 세션 호출 메서드
export function callClaude(input: string, model: ClaudeModel) : SpawnSyncReturns<string> {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    env.DAILY_JOURNAL_RUNNING = '1'; // stop-hook 재진입 방지

    const claudeModel = ClaudeModel[model] ?? ClaudeModel.default;

    return  spawnSync('claude', ['--print', '--model', claudeModel], {
        input,
        encoding: 'utf-8',
        timeout: 180000,
        shell: true,
        env
    });

}