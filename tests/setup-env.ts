// 테스트가 실제 ~/.claude/daily-journal 을 건드리지 않도록 홈 디렉터리를 임시 폴더로 바꾼다.
// config.ts 가 모듈 로드 시점에 os.homedir() 로 경로를 고정하므로, 반드시 다른 import 보다 먼저 로드해야 한다.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-test-home-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
fs.mkdirSync(path.join(TEST_HOME, '.claude', 'daily-journal'), { recursive: true });
