import * as fs from 'fs';
import * as path from 'path';
import {loadConfig, logError} from './config';
import {HistoryEntry, RunHistoryEntry} from "./types";
import {RUN_HISTORY_PATH} from "./cli";

export function cmdView(): void {
  const config = loadConfig();
  const outputDir = config.journal.output_dir;

  // run-history.json에서 날짜 목록 수집
  let dates: string[] = [];

  // 날짜 내부 project 목록
  let contentList: string[] = [];

  // 기록 목록
  let histories: HistoryEntry[] = [];
  let contentLines: string[][] = []; // 화면 출력용 줄 캐시

  try {
    if (fs.existsSync(RUN_HISTORY_PATH)) {
      const history: Record<string, RunHistoryEntry> = JSON.parse(fs.readFileSync(RUN_HISTORY_PATH, 'utf-8'));
      dates = Object.values(history)
        .filter(e => e.status !== 'no_data')
        .map(e => e.date)
        .sort();
    }
  } catch { /* ignore */ }

  if (dates.length === 0) {
    console.log('표시할 일지가 없습니다.');
    return;
  }

  let dateIdx = dates.length - 1; // 가장 최근 날짜부터
  let dateListOffset = 0;         // dates 목록 뷰포트 시작
  let contentListIdx = 0;
  let contentListOffset = 0;      // contentList 뷰포트 시작
  let historyIdx = 0;
  let scrollOffset = 0;           // 내용 열람 스크롤
  let deepCursor = 0; // 깊이 ( 날짜 = 0, 프로젝트 선택 = 1, 기록 열람 = 2 )
  let showingFileEdits = false;
  let fileEditIdx = 0;
  let fileEditScrollOffset = 0;
  let fileEditContentLines: string[][] = [];

  function getTermSize() {
    return {
      rows: process.stdout.rows || 24,
      cols: process.stdout.columns || 80,
    };
  }

  function loadContentList() {
    const filePath = path.join(outputDir, dates[dateIdx], 'history');
    try {
      contentList = fs.readdirSync(filePath);
    } catch { /* ignore */ }
  }

  // 한글 등 전각 문자는 터미널에서 2칸 차지
  function dispWidth(s: string): number {
    let w = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0) ?? 0;
      if (
        (cp >= 0x1100 && cp <= 0x115F) ||
        (cp >= 0x2E80 && cp <= 0x303E) ||
        (cp >= 0x3040 && cp <= 0x33FF) ||
        (cp >= 0x3400 && cp <= 0x4DBF) ||
        (cp >= 0x4E00 && cp <= 0xA4CF) ||
        (cp >= 0xAC00 && cp <= 0xD7FF) ||
        (cp >= 0xF900 && cp <= 0xFAFF) ||
        (cp >= 0xFF01 && cp <= 0xFF60) ||
        (cp >= 0xFFE0 && cp <= 0xFFE6)
      ) {
        w += 2;
      } else {
        w += 1;
      }
    }
    return w;
  }

  function wrapLine(line: string, cols: number): string[] {
    if (dispWidth(line) <= cols) return [line];
    const result: string[] = [];
    let current = '';
    let currentWidth = 0;
    for (const ch of line) {
      const chw = dispWidth(ch);
      if (currentWidth + chw > cols) {
        result.push(current);
        current = ch;
        currentWidth = chw;
      } else {
        current += ch;
        currentWidth += chw;
      }
    }
    if (current) result.push(current);
    return result;
  }

  function buildFileEditLines(hIdx: number): void {
    const h = histories[hIdx];
    if (!h?.fileEdits || h.fileEdits.length === 0) {
      fileEditContentLines = [];
      return;
    }
    fileEditContentLines = h.fileEdits.map(edit => {
      const lines: string[] = [];
      if (edit.tool === 'Edit') {
        (edit.before ?? '').split('\n').forEach(l => lines.push(`\x1b[31m- ${l}\x1b[0m`));
        (edit.after ?? '').split('\n').forEach(l => lines.push(`\x1b[32m+ ${l}\x1b[0m`));
      } else if (edit.tool === 'Write') {
        if (edit.historyRef && fs.existsSync(edit.historyRef)) {
          fs.readFileSync(edit.historyRef, 'utf-8')
            .split('\n')
            .forEach(l => lines.push(`\x1b[32m+ ${l}\x1b[0m`));
        } else {
          lines.push('  (file-history 참조를 찾을 수 없습니다)');
        }
      }
      return lines;
    });
  }

  function buildContentLines(cols: number): void {
    const innerCols = cols - 2;
    contentLines = histories.map(h => {
      const lines: string[] = [];
      const addText = (text: string) =>
        text.split('\n').forEach(l => wrapLine(l, innerCols).forEach(w => lines.push(`  ${w}`)));

      lines.push(`\x1b[1;36m[ 질문 ]\x1b[0m`);
      addText(h.prompt);
      lines.push(``);
      lines.push(`\x1b[1;32m[ 응답 ]\x1b[0m`);
      addText(h.answer ?? ' - ');
      lines.push(``);
      lines.push(`\x1b[1;33m[ 요약 ]\x1b[0m`);
      addText(h.summary);
      lines.push(``);
      return lines;
    });
  }

  function loadContent() {
    const contentPath = path.join(outputDir, dates[dateIdx], 'history', contentList[contentListIdx]);
    try {
      const lines = fs.readFileSync(contentPath, 'utf-8').split('\n');
      histories = lines.flatMap(l => {
        try {
          return [JSON.parse(l) as HistoryEntry];
        } catch (e) {
          logError("일지 작성중 손상된 history Skip: " + l);
          return [];
        }
      });
      buildContentLines(getTermSize().cols);
    } catch { /* ignore */ }
  }

  // 리스트가 길 때 커서가 뷰포트 안에 오도록 offset 조정
  function clampListOffset(idx: number, offset: number, contentHeight: number): number {
    if (idx < offset) return idx;
    if (idx >= offset + contentHeight) return idx - contentHeight + 1;
    return offset;
  }

  function renderDateList(contentHeight: number): void {
    const visibleDates = dates.slice(dateListOffset, dateListOffset + contentHeight);
    visibleDates.forEach((d, i) => {
      const actualIdx = dateListOffset + i;
      process.stdout.write(`  ${actualIdx === dateIdx ? '▷  ' : '   '}${d}\n`);
    });
    for (let i = visibleDates.length; i < contentHeight; i++) {
      process.stdout.write('\n');
    }
  }

  function renderContentList(contentHeight: number, cols: number): void {
    process.stdout.write('─'.repeat(cols) + '\n');
    if (contentList.length === 0) {
      process.stdout.write('- 저장된 파일이 없습니다.\n');
      for (let i = 1; i < contentHeight; i++) process.stdout.write('\n');
    } else {
      const visibleItems = contentList.slice(contentListOffset, contentListOffset + contentHeight);
      visibleItems.forEach((item, i) => {
        const actualIdx = contentListOffset + i;
        process.stdout.write(`  ${actualIdx === contentListIdx ? '▷  ' : '   '}${item}\n`);
      });
      for (let i = visibleItems.length; i < contentHeight; i++) {
        process.stdout.write('\n');
      }
    }
  }

  function renderFileEdits(contentHeight: number, cols: number): void {
    const h = histories[historyIdx];
    const edits = h?.fileEdits ?? [];

    if (edits.length === 0) {
      process.stdout.write('  수정된 파일이 없습니다.\n');
      for (let i = 1; i < contentHeight + 2; i++) process.stdout.write('\n');
      return;
    }

    const edit = edits[fileEditIdx];
    const toolLabel = edit.tool === 'Write' ? '신규' : '수정';
    process.stdout.write(`  ${edit.file}  \x1b[2m[${toolLabel}]\x1b[0m  (${fileEditIdx + 1} / ${edits.length})\n`);
    process.stdout.write('─'.repeat(cols) + '\n');

    const lines = fileEditContentLines[fileEditIdx] ?? [];
    const maxScroll = Math.max(0, lines.length - contentHeight);
    if (fileEditScrollOffset > maxScroll) fileEditScrollOffset = maxScroll;

    const visible = lines.slice(fileEditScrollOffset, fileEditScrollOffset + contentHeight);
    visible.forEach(line => process.stdout.write(line + '\n'));
    for (let i = visible.length; i < contentHeight; i++) process.stdout.write('\n');
  }

  function renderContent(contentHeight: number, cols: number): void {
    const content = contentList[contentListIdx];
    process.stdout.write(`  ${content}  (${contentListIdx + 1} / ${contentList.length})\n`);
    process.stdout.write('─'.repeat(cols) + '\n');

    const currentHistory = histories[historyIdx];
    const hasFileEdits = currentHistory?.fileEdits && currentHistory.fileEdits.length > 0;

    let fileEditsHint = '';

    if(hasFileEdits){
      let editCount = 0;
      let writeCount = 0;

      currentHistory.fileEdits?.forEach(edit => {
        if(edit.tool === 'Write') writeCount++;
        else editCount++;
      })

      const parts = [
        editCount > 0 ? `수정파일 ${editCount}건` : '',
        writeCount > 0 ? `생성파일 ${writeCount}건` : '',
      ].filter(Boolean);
      fileEditsHint = `  \x1b[33m[${parts.join(' · ')}]\x1b[0m`;
    }
    process.stdout.write(`  history page [${historyIdx + 1} / ${contentLines.length}]${fileEditsHint}\n`);

    const history = contentLines[historyIdx];

    const maxScroll = Math.max(0, history.length - contentHeight);
    if (scrollOffset > maxScroll) scrollOffset = maxScroll;

    const visible = history.slice(scrollOffset, scrollOffset + contentHeight);
    visible.forEach(line => process.stdout.write((line === '\x01' ? '─'.repeat(cols) : line) + '\n'));
    for (let i = visible.length; i < contentHeight; i++) {
      process.stdout.write('\n');
    }
  }

  function render(): void {
    const { rows, cols } = getTermSize();
    const date = dates[dateIdx];

    process.stdout.write('\x1b[H\x1b[2J'); // 화면 클리어 후 커서 맨 위로

    // 헤더
    process.stdout.write(`기록 보기\n`);

    if (deepCursor === 0) {
      // 고정: 헤더1 + 푸터2 = 3
      renderDateList(rows - 3);
    } else {
      const dateStr = `  ${date}  (${dateIdx + 1} / ${dates.length})`;
      process.stdout.write(`\x1b[1m${dateStr}\x1b[0m\n`);

      if (deepCursor === 1) {
        // 고정: 헤더2 + separator1(renderContentList 내부) + 푸터2 = 5
        renderContentList(rows - 5, cols);
      } else {
        if (showingFileEdits) {
          // 고정: 헤더2 + filename1 + separator1 + 푸터2 = 6
          renderFileEdits(rows - 6, cols);
        } else {
          // 고정: 헤더2 + filename1 + historyPage1 + separator1 + 푸터2 = 7
          renderContent(rows - 7, cols);
        }
      }
    }

    // 푸터
    process.stdout.write('─'.repeat(cols) + '\n');
    const hint = deepCursor === 2
      ? (showingFileEdits
          ? `▲▼ 스크롤  /  ◀ ▶ 파일 이동  /  f·esc 대화로 돌아가기  /  q 종료`
          : `▲▼ 스크롤  /  ◀ ▶ history 이동  /  f 수정파일 보기  /  esc 뒤로가기  /  q 종료`)
      : `▲▼ 선택 이동  /  enter 선택  /  esc 뒤로가기  /  q 종료`;
    process.stdout.write(`\x1b[2m${hint}\x1b[0m`);
  }

  function exit(): void {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\x1b[?1049l'); // 원래 화면 복원
  }

  // Alternate screen 진입
  process.stdout.write('\x1b[?1049h');
  render();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf-8');

  // 터미널 크기 변경 시 캐시 재빌드 후 렌더링
  process.stdout.on('resize', () => {
    if (deepCursor === 2) buildContentLines(getTermSize().cols);
    render();
  });

  process.stdin.on('data', (key: string) => {
    const { rows } = getTermSize();
    // deepCursor별 실제 콘텐츠 높이 (render()와 동일 계산)
    const ch0 = rows - 3;
    const ch1 = rows - 5;
    const ch2 = rows - 7;
    const chFile = rows - 6; // renderFileEdits 콘텐츠 높이

    if (key === 'q' || key === '\x03') { // q 또는 Ctrl+C
      exit();
      process.exit(0);
    } else if (key === '\x1b[A') { // 위
      if (deepCursor === 0) {
        if (dateIdx > 0) {
          dateIdx--;
          dateListOffset = clampListOffset(dateIdx, dateListOffset, ch0);
          render();
        }
      } else if (deepCursor === 1) {
        if (contentListIdx > 0) {
          contentListIdx--;
          contentListOffset = clampListOffset(contentListIdx, contentListOffset, ch1);
          render();
        }
      } else if (deepCursor === 2) {
        if (showingFileEdits) {
          if (fileEditScrollOffset > 0) { fileEditScrollOffset--; render(); }
        } else {
          if (scrollOffset > 0) { scrollOffset--; render(); }
        }

      }
    } else if (key === '\x1b[B') { // 아래
      if (deepCursor === 0) {
        if (dateIdx < dates.length - 1) {
          dateIdx++;
          dateListOffset = clampListOffset(dateIdx, dateListOffset, ch0);
          render();
        }
      } else if (deepCursor === 1) {
        if (contentListIdx < contentList.length - 1) {
          contentListIdx++;
          contentListOffset = clampListOffset(contentListIdx, contentListOffset, ch1);
          render();
        }
      } else if (deepCursor === 2) {
        if (showingFileEdits) {
          const maxScroll = Math.max(0, (fileEditContentLines[fileEditIdx]?.length ?? 0) - chFile);
          if (fileEditScrollOffset < maxScroll) { fileEditScrollOffset++; render(); }
        } else {
          const maxScroll = Math.max(0, contentLines[historyIdx].length - ch2);
          if (scrollOffset < maxScroll) { scrollOffset++; render(); }
        }
      }
    } else if (key === '\x1b[C') { // 오른쪽
      if (deepCursor === 2) {
        if (showingFileEdits) {
          const edits = histories[historyIdx]?.fileEdits ?? [];
          if (fileEditIdx < edits.length - 1) { fileEditIdx++; fileEditScrollOffset = 0; render(); }
        } else {
          if (historyIdx < contentLines.length - 1) { historyIdx++; scrollOffset = 0; render(); }
        }
      }
    } else if (key === '\x1b[D') { // 왼쪽
      if (deepCursor === 2) {
        if (showingFileEdits) {
          if (fileEditIdx > 0) { fileEditIdx--; fileEditScrollOffset = 0; render(); }
        } else {
          if (historyIdx > 0) { historyIdx--; scrollOffset = 0; render(); }
        }
      }
    } else if (key === 'f' && deepCursor === 2) {
      if (showingFileEdits) {
        showingFileEdits = false;
      } else {
        buildFileEditLines(historyIdx);
        fileEditIdx = 0;
        fileEditScrollOffset = 0;
        showingFileEdits = true;
      }
      render();
    } else if (key === '\r' || key === '\r\n') { // 선택
      if (deepCursor === 0) {
        loadContentList();
        contentListIdx = 0;
        contentListOffset = 0;
        deepCursor++;
        render();
      } else if (deepCursor === 1) {
        loadContent();
        scrollOffset = 0;
        deepCursor++;
        render();
      }
    } else if (key === '\x1b') { // 뒤로가기
      if (showingFileEdits) {
        showingFileEdits = false;
        render();
      } else if (deepCursor > 0) {
        deepCursor--;
        if (deepCursor === 1) { historyIdx = 0; scrollOffset = 0; }
        if (deepCursor === 0) { contentListIdx = 0; contentListOffset = 0; }
        render();
      }
    }
  });
}
