import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
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
  let gitCommitFileNames: string[] = [];
  let gitShowRawSections: string[] = [];
  let searchMode = false;
  let searchActive = false;
  let searchQuery = '';
  let searchTerm = '';
  let filteredIndices: number[] = [];
  let filteredPos = 0;

  function nk(k: string): string {
    return k.toLowerCase();
  }

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

  // 한글·CJK·이모지 등 전각 문자는 터미널에서 2칸 차지
  function dispWidth(s: string): number {
    let w = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0) ?? 0;
      // 변형 선택자(Variation Selectors)는 너비 0
      if (cp >= 0xFE00 && cp <= 0xFE0F) continue;
      if (cp === 0x200D) continue; // Zero Width Joiner
      if (
        // 한글
        (cp >= 0x1100 && cp <= 0x115F) ||
        (cp >= 0xAC00 && cp <= 0xD7FF) ||
        // CJK
        (cp >= 0x2E80 && cp <= 0x303E) ||
        (cp >= 0x3040 && cp <= 0x33FF) ||
        (cp >= 0x3400 && cp <= 0x4DBF) ||
        (cp >= 0x4E00 && cp <= 0xA4CF) ||
        (cp >= 0xF900 && cp <= 0xFAFF) ||
        (cp >= 0xFF01 && cp <= 0xFF60) ||
        (cp >= 0xFFE0 && cp <= 0xFFE6) ||
        // 이모지 (🔴🎯 등 — 보조 평면 이모지는 확실히 2칸)
        (cp >= 0x1F300 && cp <= 0x1FAFF)
      ) {
        w += 2;
      } else {
        w += 1;
      }
    }
    return w;
  }

  function highlightText(text: string, term: string): string {
    if (!term) return text;
    const lower = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    let result = '';
    let i = 0;
    while (i < text.length) {
      const idx = lower.indexOf(lowerTerm, i);
      if (idx === -1) { result += text.slice(i); break; }
      result += text.slice(i, idx);
      result += `\x1b[43m\x1b[30m${text.slice(idx, idx + term.length)}\x1b[0m`;
      i = idx + term.length;
    }
    return result;
  }

  function truncateLine(text: string, cols: number): string {
    let result = '';
    let w = 0;
    let i = 0;
    while (i < text.length) {
      // ANSI 이스케이프 시퀀스는 너비 0으로 그대로 통과
      if (text[i] === '\x1b' && text[i + 1] === '[') {
        const end = text.indexOf('m', i + 2);
        if (end !== -1) { result += text.slice(i, end + 1); i = end + 1; continue; }
      }
      const cp = text.codePointAt(i) ?? 0;
      const ch = cp > 0xFFFF ? text.slice(i, i + 2) : text[i];
      const chw = dispWidth(ch);
      if (w + chw > cols - 1) return result + '…';
      result += ch;
      w += chw;
      i += ch.length;
    }
    return result;
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

  function formatGitCommitSections(cols: number): void {
    fileEditContentLines = gitShowRawSections.map(section => {
      const lines = section.split('\n');
      return lines.slice(1).flatMap(l => {
        if (l.startsWith('+++') || l.startsWith('---')) return wrapLine(l, cols).map(w => `\x1b[2m${w}\x1b[0m`);
        if (l.startsWith('+')) return wrapLine(l, cols).map(w => `\x1b[32m${w}\x1b[0m`);
        if (l.startsWith('-')) return wrapLine(l, cols).map(w => `\x1b[31m${w}\x1b[0m`);
        if (l.startsWith('@@')) {
          const trimmed = l.replace(/^(@@ .+? @@).*$/, '$1');
          return [``, `\x1b[36m  ${trimmed}\x1b[0m`];
        }
        return wrapLine(`  ${l}`, cols);
      });
    });
  }

  function buildFileEditLines(hIdx: number): void {
    const h = histories[hIdx];

    if (h?.source === 'git-commit') {
      const hash = h.answer || '';
      gitCommitFileNames = [];
      gitShowRawSections = [];
      if (!hash) { fileEditContentLines = []; return; }
      try {
        const cmd = h.repoPath
          ? `git -C "${h.repoPath}" show ${hash}`
          : `git show ${hash}`;
        const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        const parts = output.split(/^diff --git /m);
        const fileSections = parts.slice(1);
        if (fileSections.length === 0) {
          fileEditContentLines = [[`  (변경 파일 없음)`]];
          gitCommitFileNames = ['(no diff)'];
          return;
        }
        gitShowRawSections = fileSections;
        gitCommitFileNames = fileSections.map(section => {
          const fileMatch = section.split('\n')[0].match(/ b\/(.+)$/);
          return fileMatch ? fileMatch[1] : section.split('\n')[0];
        });
        formatGitCommitSections(getTermSize().cols);
      } catch {
        fileEditContentLines = [[`  git show ${hash} 실행 실패`]];
        gitCommitFileNames = ['오류'];
      }
      return;
    }

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
        (edit.after ?? '').split('\n').forEach(l => lines.push(`\x1b[32m+ ${l}\x1b[0m`));
      }
      return lines;
    });
  }

  function applySearch(term: string): void {
    const lower = term.toLowerCase();
    filteredIndices = histories.reduce<number[]>((acc, h, i) => {
      if (
        h.prompt.toLowerCase().includes(lower) ||
        (h.answer ?? '').toLowerCase().includes(lower)
      ) {
        acc.push(i);
      }
      return acc;
    }, []);
    filteredPos = 0;
    if (filteredIndices.length > 0) {
      historyIdx = filteredIndices[0];
      scrollOffset = 0;
    }
    buildContentLines(getTermSize().cols);
  }

  function buildContentLines(cols: number): void {
    const innerCols = cols - 2;
    contentLines = histories.map(h => {
      const lines: string[] = [];
      const applyHl = (w: string) => searchActive && searchTerm ? highlightText(w, searchTerm) : w;
      const addText = (text: string) =>
        text.split('\n').forEach(l => wrapLine(l, innerCols).forEach(w => lines.push(`  ${applyHl(w)}`)));

      if (h.source === 'git-commit') {
        lines.push(`\x1b[1;36m[ 커밋 메시지 ]\x1b[0m`);
        addText(h.prompt);
        lines.push(``);
      } else {
        lines.push(`\x1b[1;36m[ 질문 ]\x1b[0m`);
        addText(h.prompt);
        lines.push(``);
        lines.push(`\x1b[1;32m[ 응답 ]\x1b[0m`);
        addText(h.answer ?? ' - ');
        lines.push(``);
        lines.push(`\x1b[1;33m[ 요약 ]\x1b[0m`);
        addText(h.summary);
        lines.push(``);
      }
      return lines;
    });
  }

  function extractJsonObjects(content: string): HistoryEntry[] {
    const results: HistoryEntry[] = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = -1;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (escaped) { escaped = false; continue; }
      if (inString) {
        if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          try { results.push(JSON.parse(content.slice(start, i + 1)) as HistoryEntry); } catch { /* skip */ }
          start = -1;
        }
      }
    }
    return results;
  }

  function loadContent() {
    const contentPath = path.join(outputDir, dates[dateIdx], 'history', contentList[contentListIdx]);
    try {
      const content = fs.readFileSync(contentPath, 'utf-8');
      histories = extractJsonObjects(content);
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

    if (h?.source === 'git-commit') {
      if (fileEditContentLines.length === 0) {
        process.stdout.write('  (diff를 불러올 수 없습니다)\n');
        for (let i = 1; i < contentHeight + 2; i++) process.stdout.write('\n');
        return;
      }
      const filename = gitCommitFileNames[fileEditIdx] || '';
      process.stdout.write(truncateLine(`  ${filename}  \x1b[2m[${h?.answer || ''}]\x1b[0m  (${fileEditIdx + 1} / ${fileEditContentLines.length})`, cols) + '\n');
      process.stdout.write('─'.repeat(cols) + '\n');
    } else {
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
    }

    const lines = fileEditContentLines[fileEditIdx] ?? [];
    const maxScroll = Math.max(0, lines.length - contentHeight);
    if (fileEditScrollOffset > maxScroll) fileEditScrollOffset = maxScroll;

    const visible = lines.slice(fileEditScrollOffset, fileEditScrollOffset + contentHeight);
    visible.forEach(line => process.stdout.write(line + '\n'));
    for (let i = visible.length; i < contentHeight; i++) process.stdout.write('\n');
  }

  function renderContent(contentHeight: number, cols: number): void {
    // 브레드크럼 헤더
    const date = dates[dateIdx];
    const breadcrumb = `📂 [기록 검색]  ${date} (${dateIdx + 1}/${dates.length}) › ${contentList[contentListIdx]} (${contentListIdx + 1}/${contentList.length})`;
    process.stdout.write(truncateLine(breadcrumb, cols) + '\n');

    // 페이지 정보
    const currentHistory = histories[historyIdx];
    const isGitCommit = currentHistory?.source === 'git-commit';
    const hasFileEdits = !isGitCommit && !!currentHistory?.fileEdits && currentHistory.fileEdits.length > 0;

    let fileEditsHint = '';
    if (isGitCommit && currentHistory.answer) {
      fileEditsHint = `  \x1b[33m(커밋 해시)\x1b[0m`;
    } else if (hasFileEdits) {
      let editCount = 0;
      let writeCount = 0;
      currentHistory.fileEdits?.forEach(edit => {
        if (edit.tool === 'Write') writeCount++;
        else editCount++;
      });
      const parts = [
        editCount > 0 ? `수정파일 ${editCount}건` : '',
        writeCount > 0 ? `생성파일 ${writeCount}건` : '',
      ].filter(Boolean);
      fileEditsHint = `  \x1b[33m(${parts.join(' · ')})\x1b[0m`;
    }

    const pageNum = searchActive ? filteredPos + 1 : historyIdx + 1;
    const pageTotal = searchActive ? filteredIndices.length : contentLines.length;
    const pageStr = (searchActive && filteredIndices.length === 0)
      ? ` ⚙️  [PAGE] -/-`
      : ` ⚙️  [PAGE] ${pageNum}/${pageTotal}${fileEditsHint}`;
    process.stdout.write(truncateLine(pageStr, cols) + '\n');

    // 검색 정보 (검색 중일 때만)
    if (searchActive) {
      const searchStr = ` 🔍 [KEYWORD] 검색어: "${searchTerm}"   결과: ${filteredIndices.length}건`;
      process.stdout.write(truncateLine(searchStr, cols) + '\n');
    }

    // 구분선
    process.stdout.write('━'.repeat(cols) + '\n');

    if (searchActive && filteredIndices.length === 0) {
      for (let i = 0; i < contentHeight; i++) process.stdout.write('\n');
      return;
    }

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

    if (deepCursor === 0) {
      // 고정: 헤더1 + 푸터2 = 3
      process.stdout.write(`📂 [기록 검색]\n`);
      renderDateList(rows - 3);
    } else if (deepCursor === 1) {
      // 고정: 헤더1 + separator1(renderContentList 내부) + 푸터2 = 4
      process.stdout.write(truncateLine(`📂 [기록 검색]  ${date}  (${dateIdx + 1}/${dates.length})`, cols) + '\n');
      renderContentList(rows - 4, cols);
    } else {
      if (showingFileEdits) {
        // 고정: 헤더1 + filename1 + separator1 + 푸터2 = 5
        process.stdout.write(truncateLine(`📂 [기록 검색]  ${date} (${dateIdx + 1}/${dates.length}) › ${contentList[contentListIdx]} (${contentListIdx + 1}/${contentList.length})`, cols) + '\n');
        renderFileEdits(rows - 5, cols);
      } else {
        // 고정: breadcrumb1 + page1 + (search1?) + separator1 + 푸터2 = 5 or 6
        renderContent(rows - (searchActive ? 6 : 5), cols);
      }
    }

    // 푸터
    process.stdout.write('─'.repeat(cols) + '\n');
    const hint = deepCursor === 2
      ? (showingFileEdits
          ? `▲▼ 스크롤  /  ◀ ▶ 파일 이동  /  f·esc 대화로 돌아가기  /  q 종료`
          : searchMode
            ? `검색: ${searchQuery}_`
            : searchActive
              ? `▲▼ 스크롤  /  ◀ ▶ 이동  /  f 수정파일  /  s 재검색  /  esc 검색해제  /  q 종료`
              : `▲▼ 스크롤  /  ◀ ▶ history 이동  /  f 수정파일 보기  /  s 검색  /  esc 뒤로가기  /  q 종료`)
      : `▲▼ 선택 이동  /  enter 선택  /  esc 뒤로가기  /  q 종료`;
    process.stdout.write(`\x1b[2m${truncateLine(hint, cols)}\x1b[0m`);
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
    const { cols } = getTermSize();
    if (deepCursor === 2) buildContentLines(cols);
    if (showingFileEdits && gitShowRawSections.length > 0) formatGitCommitSections(cols);
    render();
  });

  process.stdin.on('data', (key: string) => {
    const { rows } = getTermSize();
    // deepCursor별 실제 콘텐츠 높이 (render()와 동일 계산)
    const ch0 = rows - 3;
    const ch1 = rows - 4;
    const ch2 = rows - (searchActive ? 6 : 5);
    const chFile = rows - 5;

    if (key === '\x03') { // Ctrl+C는 항상 종료
      exit();
      process.exit(0);
    }

    // 검색 입력 모드
    if (searchMode) {
      if (key === '\r' || key === '\r\n') {
        searchTerm = searchQuery;
        searchMode = false;
        searchActive = true;
        applySearch(searchTerm);
        render();
      } else if (key === '\x1b') {
        searchMode = false;
        render();
      } else if (key === '\x7f' || key === '\b') {
        searchQuery = searchQuery.slice(0, -1);
        render();
      } else if (!key.startsWith('\x1b') && key !== '\x03') {
        searchQuery += key;
        render();
      }
      return;
    }

    if (nk(key) === 'q') { // q 종료
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
          if (fileEditIdx < fileEditContentLines.length - 1) { fileEditIdx++; fileEditScrollOffset = 0; render(); }
        } else if (searchActive) {
          if (filteredPos < filteredIndices.length - 1) { filteredPos++; historyIdx = filteredIndices[filteredPos]; scrollOffset = 0; render(); }
        } else {
          if (historyIdx < contentLines.length - 1) { historyIdx++; scrollOffset = 0; render(); }
        }
      }
    } else if (key === '\x1b[D') { // 왼쪽
      if (deepCursor === 2) {
        if (showingFileEdits) {
          if (fileEditIdx > 0) { fileEditIdx--; fileEditScrollOffset = 0; render(); }
        } else if (searchActive) {
          if (filteredPos > 0) { filteredPos--; historyIdx = filteredIndices[filteredPos]; scrollOffset = 0; render(); }
        } else {
          if (historyIdx > 0) { historyIdx--; scrollOffset = 0; render(); }
        }
      }
    } else if (nk(key) === 's' && deepCursor === 2 && !showingFileEdits) {
      searchMode = true;
      searchQuery = '';
      render();
    } else if (nk(key) === 'f' && deepCursor === 2) {
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
        historyIdx = 0;
        searchMode = false;
        searchActive = false;
        deepCursor++;
        render();
      }
    } else if (key === '\x1b') { // 뒤로가기
      if (showingFileEdits) {
        showingFileEdits = false;
        render();
      } else if (searchActive) {
        searchActive = false;
        historyIdx = 0;
        scrollOffset = 0;
        buildContentLines(getTermSize().cols);
        render();
      } else if (deepCursor > 0) {
        deepCursor--;
        if (deepCursor === 1) { historyIdx = 0; scrollOffset = 0; searchMode = false; searchActive = false; }
        if (deepCursor === 0) { contentListIdx = 0; contentListOffset = 0; }
        render();
      }
    }
  });
}
