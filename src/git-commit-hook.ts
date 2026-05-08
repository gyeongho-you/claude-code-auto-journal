import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadConfig, getDateStringWithHourMinutes, getTodayDir, logError } from './config';
import { HistoryEntry } from './types';

function main(): void {
  const config = loadConfig();
  if (!config.save || !config.gitCommit.use) return;

  let repoRoot: string;
  try {
    repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    return;
  }

  const projectName = path.basename(repoRoot);

  if (config.focus?.use && !config.focus.files.includes(projectName)) {
    return;
  }

  let commitMessage: string;
  try {
    commitMessage = execSync('git log -1 --format=%B', { encoding: 'utf-8' }).trim();
  } catch {
    logError('git-commit-hook: 커밋 메시지 읽기 실패');
    return;
  }

  let commitHash: string;
  try {
    commitHash = execSync('git log -1 --format=%h', { encoding: 'utf-8' }).trim();
  } catch {
    commitHash = '';
  }

  const todayDir = getTodayDir(config);
  const historyDir = path.join(todayDir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  const entry: HistoryEntry = {
    time: getDateStringWithHourMinutes(config.timeZone),
    prompt: commitMessage,
    summary: '',
    answer: commitHash,
    source: 'git-commit',
    repoPath: repoRoot,
  };

  fs.appendFileSync(
    path.join(historyDir, `${projectName}.jsonl`),
    JSON.stringify(entry) + '\n',
  );
}

try {
  main();
} catch (e) {
  logError(`git-commit-hook 오류: ${e}`);
}
