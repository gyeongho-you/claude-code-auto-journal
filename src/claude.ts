import {spawnSync} from "child_process";
import {SpawnSyncReturns} from "node:child_process";

// claude 서브 세션 호출 메서드
export function callClaude(input: string) : SpawnSyncReturns<string> {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    env.DAILY_JOURNAL_RUNNING = '1'; // stop-hook 재진입 방지

    return  spawnSync('claude', ['--print'], {
        input,
        encoding: 'utf-8',
        timeout: 60000,
        shell: true,
        env
    });

}