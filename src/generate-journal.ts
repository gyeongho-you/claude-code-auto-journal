import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, logError, recordRunHistory, getDateString } from './config';
import {ClaudeModel, Config, HistoryEntry} from './types';
import {callClaude} from "./claude";

// 한글 포함 기준 약 2.5자 = 1토큰
const MAX_DATA_TOKENS = 140_000; // 프롬프트 + 응답 오버헤드 감안해서 여유 있게

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5);
}

function loadHistoryByProject(historyDir: string): Record<string, HistoryEntry[]> {
  const result: Record<string, HistoryEntry[]> = {};
  const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
      const project = file.replace('.jsonl', '');
      const lines = fs.readFileSync(path.join(historyDir, file), 'utf-8')
          .trim().split('\n').filter(Boolean);
      result[project] = lines.flatMap(l => {
        try {
          return [JSON.parse(l) as HistoryEntry];
        } catch (e) {
          logError("일지 작성중 손상된 history Skip: " + l);
          console.error("일지 작성중 손상된 history 존재", e);
          return [];
        }
      });
  }
  return result;
}

function buildPromptData(historyByProject: Record<string, HistoryEntry[]>): string {
  return Object.entries(historyByProject)
    .map(([project, entries]) => {
      const items = entries
        .map(e => `- ${e.prompt}\n  → ${e.summary}`)
        .join('\n');
      return `## ${project}\n${items}`;
    })
    .join('\n\n');
}

// 프로젝트 섹션 경계에서 청크를 분할
function splitIntoChunks(data: string, maxTokens: number): string[] {
  const sections = data.split('\n\n').reduce<string[]>((acc, part) => {
    if (part.startsWith('## ')) {
      acc.push(part);
    } else if (acc.length > 0) {
      acc[acc.length - 1] += '\n\n' + part;
    }
    return acc;
  }, []);

  const chunks: string[] = [];
  let current = '';

  for (const section of sections) {
    const next = current ? current + '\n\n' + section : section;
    if (current && estimateTokens(next) > maxTokens) {
      chunks.push(current);
      current = section;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function summarizeChunk(chunkData: string, chunkIndex: number, totalChunks: number, model: ClaudeModel): string {
  const input = `다음은 대화 기록의 일부. (파트 ${chunkIndex + 1}/${totalChunks}).\n핵심 작업 내용, 해결한 문제, 중요한 결정 사항을 간결하게 정리.\n\n${chunkData}`;
  const result = callClaude(input, model);
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || String(result.error) || 'claude CLI 실패');
  }
  const output = result.stdout.trim();
  if (!output) throw new Error('청크 응답 없음');
  return output;
}

function main(): void {
  const config = loadConfig();
  writeJournal(getDateString(config.timeZone), config);
}

export function writeJournal(date: string, config: Config): void {
  try {
    generateJournalForDate(date, config);
  } catch (e) {
    logError(`generate-journal 오류: ${e}`);
    recordRunHistory({ date: date, status: 'failed', timestamp: new Date().toISOString(), error: String(e) });
  }
}

function generateJournalForDate(date: string, config: Config): void {
  const dateDir = path.join(config.journal.output_dir, date);
  const historyDir = path.join(dateDir, 'history');
  const timestamp = new Date().toISOString();

  if (!fs.existsSync(historyDir)) {
    console.log(`  데이터 없음 (history 디렉토리 없음)`);
    recordRunHistory({ date, status: 'no_data', timestamp });
    return;
  }

  const historyByProject = loadHistoryByProject(historyDir);

  const entryCount = Object.values(historyByProject).reduce((sum, e) => sum + e.length, 0);

  if(entryCount > 0) {
    const data = buildPromptData(historyByProject);

    console.log(`  항목 ${entryCount}개 → 정리중 ...`);

    const journalContent = estimateTokens(data) <= MAX_DATA_TOKENS
        ? generateSingle(date, data, config)
        : generateChunked(date, data, config);

    if (!journalContent) return;

    fs.mkdirSync(dateDir, { recursive: true });
    fs.writeFileSync(path.join(dateDir, 'journal.md'), journalContent, 'utf-8');

    recordRunHistory({ date, status: 'success', timestamp });
    console.log(`  ✓ 완료 → ${path.join(dateDir, 'journal.md')}`);
  }else {
    console.log(`  정리할 항목이 존재하지 않습니다.`);
    recordRunHistory({ date, status: 'no_data', timestamp });
    return;
  }

  if (config.cleanup && date !== getDateString(config.timeZone)) {
    fs.rmSync(historyDir, { recursive: true, force: true });
  }
}

function generateSingle(date: string, data: string, config: Config): string | null {
  const input = `${config.journal.defaultPrompt}\n${config.journal.stylePrompt}\n\n날짜: ${date}\n\n${data}`;
  const result = callClaude(input, config.journal.claudeModel);

  if (result.error || result.status !== 0) {
    const error = result.stderr || String(result.error) || 'claude CLI 실패';
    console.log(`  ✗ claude CLI 실패: ${error}`);
    const timestamp = new Date().toISOString();
    recordRunHistory({ date, status: 'failed', timestamp, error });
    return null;
  }

  const content = result.stdout.trim();
  if (!content) {
    console.log(`  ✗ 응답 없음`);
    const timestamp = new Date().toISOString();
    recordRunHistory({ date, status: 'failed', timestamp, error: 'CLI 응답 없음' });
    return null;
  }

  return content;
}

function generateChunked(date: string, data: string, config: Config): string | null {
  const chunks = splitIntoChunks(data, MAX_DATA_TOKENS);
  console.log(`  컨텍스트 초과 → ${chunks.length}개 청크로 분할 처리`);

  const partialSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  청크 ${i + 1}/${chunks.length} 처리 중...`);
    const summary = summarizeChunk(chunks[i], i, chunks.length, config.journal.claudeModel);
    partialSummaries.push(summary);
  }

  const combined = partialSummaries
    .map((s, i) => `### 파트 ${i + 1}\n${s}`)
    .join('\n\n');

  const finalInput = `${config.journal.defaultPrompt}\n${config.journal.stylePrompt}\n\n날짜: ${date}\n\n아래는 오늘 하루 대화 기록을 여러 파트로 나누어 정리한 내용. 이를 하나의 일관된 일지로 통합.\n\n${combined}`;
  const result = callClaude(finalInput, config.journal.claudeModel);

  if (result.error || result.status !== 0) {
    const error = result.stderr || String(result.error) || 'claude CLI 실패 (최종 통합)';
    console.log(`  ✗ 최종 통합 실패: ${error}`);
    const timestamp = new Date().toISOString();
    recordRunHistory({ date, status: 'failed', timestamp, error });
    return null;
  }

  const content = result.stdout.trim();
  if (!content) {
    console.log(`  ✗ 최종 통합 응답 없음`);
    const timestamp = new Date().toISOString();
    recordRunHistory({ date, status: 'failed', timestamp, error: '최종 통합 응답 없음' });
    return null;
  }

  return content;
}

const isDirectRun = process.argv[1]?.endsWith('generate-journal.js') ||
                    process.argv[1]?.endsWith('generate-journal.ts');
if (isDirectRun) {
  main();
}
