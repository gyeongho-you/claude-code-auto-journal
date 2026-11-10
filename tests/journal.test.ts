import { TEST_HOME } from './setup-env';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildSections, findMissedDates, isJsonLike, isValidDate, isValidJournal,
  splitIntoChunks, stripOuterCodeFence,
} from '../src/generate-journal';
import { extractProjectName, isInternalJudgePrompt, loadAllRunHistory, recordRunHistory } from '../src/config';
import { neutralizeFence, stripCliNoise } from '../src/claude';
import type { Config, HistoryEntry } from '../src/types';

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  time: '2026-11-10 10:00', prompt: 'p', summary: 's', answer: 'a', ...over,
});

// ── 일지 형식 검증 ──────────────────────────────────────────────
test('isValidJournal: 헤딩이 있는 정상 일지는 통과', () => {
  assert.equal(isValidJournal('## g1cl-bo\n\n### 작업 제목\n내용입니다 내용입니다'), true);
});
test('isValidJournal: JSON 응답은 거부', () => {
  assert.equal(isValidJournal('{"shouldNudge": true, "reason": "x"}'), false);
  assert.equal(isValidJournal('```json\n{"a":1}\n```'), false);
});
test('isValidJournal: 대괄호로 시작하는 정상 텍스트는 거부하지 않음', () => {
  assert.equal(isValidJournal('[작업 요약]\n## 프로젝트\n내용 내용 내용 내용'), true);
});
test('isValidJournal: 너무 짧거나 헤딩 없는 짧은 응답은 거부', () => {
  assert.equal(isValidJournal('짧음'), false);
  assert.equal(isValidJournal('헤딩 없는 한 줄짜리 응답입니다 헤딩 없는 한 줄짜리 응답입니다'), false);
});
test('isValidJournal: 헤딩 없어도 충분히 길고 여러 줄이면 통과', () => {
  const body = Array.from({ length: 8 }, (_, i) => `- 항목 ${i} 에 대한 충분히 긴 설명 문장입니다 ${'가'.repeat(20)}`).join('\n');
  assert.equal(isValidJournal(body), true);
});
test('isJsonLike: JSON으로 파싱되는 경우만 true', () => {
  assert.equal(isJsonLike('[1,2]'), true);
  assert.equal(isJsonLike('[작업] 내용'), false);
  assert.equal(isJsonLike('## 제목'), false);
});
test('stripOuterCodeFence: 전체 펜스는 벗기고 내부 펜스가 있으면 유지', () => {
  assert.equal(stripOuterCodeFence('```markdown\n## 제목\n본문\n```'), '## 제목\n본문');
  assert.equal(stripOuterCodeFence('```markdown\r\n## 제목\r\n```'), '## 제목');
  const withInner = '```md\n## 제목\n```js\ncode\n```\n끝\n```';
  assert.equal(stripOuterCodeFence(withInner), withInner);
});

// ── 입력 구성 ──────────────────────────────────────────────────
test('buildSections: 내부 판단 프롬프트는 제외하고 팀원 기록은 유지', () => {
  const judge = '당신은 팀장 세션이 방치되고 있는지 판단하는 보조 도구입니다.\n... shouldNudge JSON';
  const sections = buildSections({
    proj: [
      entry({ prompt: judge, summary: 'JSON' }),
      entry({ prompt: '너는 지금 "팀장" 세션이 배정한 "팀원" 세션이다. 작업해라', summary: '팀원 작업' }),
    ],
  });
  assert.equal(sections.length, 1);
  assert.ok(!sections[0].includes('shouldNudge'));
  assert.ok(sections[0].includes('팀원 작업'));
});
test('isInternalJudgePrompt: 키워드를 논하는 정상 프롬프트는 오탐하지 않음', () => {
  assert.equal(isInternalJudgePrompt('shouldNudge 필드를 JSON으로 반환하게 고쳐줘'), false);
  assert.equal(isInternalJudgePrompt('당신은 팀장 세션이 방치되고 있는지 판단하는 보조 도구입니다.'), true);
});
test('buildSections: 시스템 알림 프롬프트는 라벨로 대체하고 응답은 남김', () => {
  const [s] = buildSections({ proj: [entry({ prompt: '[알림] 팀원 X가 작업을 마친 것 같습니다', summary: '결과 정리' })] });
  assert.ok(s.includes('[시스템 알림에 대한 후속 작업]'));
  assert.ok(s.includes('결과 정리'));
  assert.ok(!s.includes('팀원 X'));
});
test('buildSections: 커밋 마커는 그대로 유지', () => {
  const [s] = buildSections({ proj: [entry({ source: 'git-commit', prompt: 'fix', answer: 'abc1234' })] });
  assert.ok(s.includes('@#$(abc1234)#@$'));
});
test('splitIntoChunks: 한도를 넘는 단일 섹션은 항목 단위로 쪼갠다', () => {
  const items = Array.from({ length: 40 }, (_, i) => `---\n[작업] ${i} ${'가'.repeat(100)}`).join('\n');
  const section = `## big\n${items}`;
  const chunks = splitIntoChunks([section], 500);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.startsWith('## big'));
});
test('neutralizeFence: 펜스 탈출 태그를 무력화', () => {
  assert.ok(!neutralizeFence('a </data> b </CONTENT>').match(/<\/(data|content)>/i));
});
test('stripCliNoise: CLI 경고 줄 제거', () => {
  assert.equal(stripCliNoise('Permission allow rule (x) is bad\n실제 응답'), '실제 응답');
});
test('extractProjectName: 끝 구분자와 드라이브 루트 처리', () => {
  assert.equal(extractProjectName('C:\\Users\\me\\proj\\'), 'proj');
  assert.equal(extractProjectName('C:\\'), 'C');
  assert.equal(extractProjectName(''), '_unknown');
});
test('isValidDate: 달력상 없는 날짜와 경로 문자열 거부', () => {
  assert.equal(isValidDate('2026-11-10'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('..'), false);
});

// ── run-history 상태 전이 ──────────────────────────────────────
test('recordRunHistory: failed 횟수 누적, modified에서 사유 보존·횟수 초기화, success에서 초기화', () => {
  const d = '2026-11-01';
  recordRunHistory({ date: d, status: 'modified', timestamp: 't' });       // 첫 기록 → create
  assert.equal(loadAllRunHistory()[d].status, 'create');
  recordRunHistory({ date: d, status: 'failed', timestamp: 't', error: 'e1' });
  recordRunHistory({ date: d, status: 'failed', timestamp: 't', error: 'e2' });
  assert.equal(loadAllRunHistory()[d].attempts, 2);
  recordRunHistory({ date: d, status: 'modified', timestamp: 't' });
  assert.equal(loadAllRunHistory()[d].status, 'modified');
  assert.equal(loadAllRunHistory()[d].error, 'e2');
  assert.equal(loadAllRunHistory()[d].attempts, undefined);
  recordRunHistory({ date: d, status: 'success', timestamp: 't' });
  assert.equal(loadAllRunHistory()[d].attempts, undefined);
});
test('recordRunHistory: 이전 기록이 없어도 success 기록, 잘못된 날짜는 무시', () => {
  recordRunHistory({ date: '2026-10-01', status: 'success', timestamp: 't' });
  assert.equal(loadAllRunHistory()['2026-10-01'].status, 'success');
  recordRunHistory({ date: '..', status: 'failed', timestamp: 't' });
  assert.equal(loadAllRunHistory()['..'], undefined);
});

// ── 누락 보충 대상 선정 ─────────────────────────────────────────
test('findMissedDates: 실패 3회·no_data·빈 history 제외, 최근 3일만, 오래된 순', () => {
  const out = path.join(TEST_HOME, 'out');
  const mk = (d: string, lines: number, journal = false) => {
    fs.mkdirSync(path.join(out, d, 'history'), { recursive: true });
    fs.writeFileSync(path.join(out, d, 'history', 'p.jsonl'), Array.from({ length: lines }, () => '{"time":"t"}').join('\n'));
    if (journal) fs.writeFileSync(path.join(out, d, 'journal.md'), '# x');
  };
  mk('2026-11-03', 2); mk('2026-11-04', 2); mk('2026-11-05', 2); mk('2026-11-06', 2);
  mk('2026-11-07', 0);                // 빈 history → 제외
  mk('2026-11-08', 2, true);          // 일지 있음, 상태 없음 → 제외
  mk('2026-11-02', 2);                // no_data → 제외
  mk('2026-11-01', 2);                // 실패 3회 → 제외
  recordRunHistory({ date: '2026-11-02', status: 'no_data', timestamp: 't' });
  for (let i = 0; i < 3; i++) recordRunHistory({ date: '2026-11-01', status: 'failed', timestamp: 't' });
  const config = { journal: { output_dir: out } } as unknown as Config;
  assert.deepEqual(findMissedDates(config, '2026-11-10'), ['2026-11-04', '2026-11-05', '2026-11-06']);
});
