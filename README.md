# daily-journal

Claude Code 플러그인 — 대화가 끝날 때마다 자동으로 작업 내용을 기록하고, 하루가 끝나면 개발 일지를 자동 생성합니다.

## 동작 방식

1. Claude Code 세션이 종료될 때마다 마지막 응답을 저장 (`summary.use: true`면 요약본, `false`면 원본 저장)
2. 매일 지정한 시간(기본 18:00)에 그날의 기록으로 일지(Markdown) 자동 생성
3. 하루치 기록이 많아 컨텍스트 한계(약 140k 토큰)를 초과하면 자동으로 청크로 분할해 처리 후 하나의 일지로 통합

## 요구사항

- Windows / macOS / Linux
- Node.js 18 이상
- Claude Code CLI (`claude`) 설치 및 로그인 완료

> 스케줄러: Windows는 Task Scheduler, macOS/Linux는 cron을 사용합니다.

## 설치

```bash
git clone https://github.com/gyeongho-you/claude-code-auto-journal ~/.claude/plugins/daily-journal
node ~/.claude/plugins/daily-journal/dist/setup.js
```

설치 시 자동으로 처리되는 항목:
- 데이터 디렉토리(`~/.claude/daily-journal/`) 생성
- `user-config.json` 기본값으로 생성 (이미 존재하면 건너뜀)
- Claude Code Stop 훅 등록
- 데이터 디렉토리 쓰기 권한 등록 (`~/.claude/settings.json`의 `permissions.allow`에 `Write(~/.claude/daily-journal/**)` 추가)
- Task Scheduler 등록 (매일 `schedule.end` 시간에 일지 생성)
- `dj` CLI 전역 등록

설치 후 `~/.claude/daily-journal/user-config.json`을 열어 설정을 변경할 수 있습니다.

## CLI 명령어

setup 완료 후 어디서든 사용 가능합니다.

```bash
dj                     # 도움말 표시
dj help                # 도움말 표시
dj config              # 현재 설정 확인
dj logs                # 일지 생성 성공/실패 기록 확인
dj write-journal            # 오늘 일지 수동 생성
dj write-journal 2026-02-25 # 특정 날짜 일지 수동 생성
dj retry               # 실패/수정된 날짜의 일지 재생성
dj setup               # 설정값 적용
dj uninstall           # 플러그인 제거 (훅, 스케줄러, CLI 삭제)
```

## 설정 커스터마이징

`~/.claude/daily-journal/user-config.json` 파일을 생성해서 기본값을 덮어쓸 수 있습니다.
지정하지 않은 항목은 `config.json`의 기본값이 사용됩니다.

```json
{
  "schedule": {
    "use": true,
    "start": "09:00",
    "end": "18:00"
  },
  "summary": {
    "use": true,
    "claudeModel": "haiku",
    "stylePrompt": "핵심만 3줄 이내로 요약. 변경된 파일, 사용된 기술, 해결된 문제를 중심으로"
  },
  "journal": {
    "claudeModel": "haiku",
    "stylePrompt": "각 프로젝트별로 마크다운 형식으로 작성",
    "output_dir": ""
  },
  "cleanup": false,
  "save": true,
  "timeZone": "Asia/Seoul"
}
```

> `stylePrompt`는 고정된 지시문에 덧붙이는 스타일 가이드입니다. 형식, 길이, 언어 등 출력 스타일만 지정하면 됩니다.

| 옵션 | 기본값 | 설명                                                                                                                                        |
|------|--------|-------------------------------------------------------------------------------------------------------------------------------------------|
| `schedule.use` | `true` | `false`로 설정하면 스케줄러 등록 안 함. 수동으로 `dj write-journal` 사용. **변경 시 setup 재실행 필요**                                                              |
| `schedule.start` | `"09:00"` | 훅 활성화 시작 시간. 이 시간 이전 대화는 기록 안 함                                                                                                           |
| `schedule.end` | `"18:00"` | 훅 활성화 종료 시간. 스케줄러가 이 시간에 일지 생성. **변경 시 setup 재실행 필요**                                                                                     |
| `summary.use` | `true` | `true` 시 Claude가 응답을 요약해 저장. `stylePrompt`로 SKIP을 반환하도록 설정하면 해당 대화는 저장하지 않음. `false` 시 응답 원본을 그대로 저장 (Claude 호출 없음, 토큰 절약) |
| `summary.claudeModel` | `"haiku"` | 요약에 사용할 모델. `"haiku"` / `"sonnet"` / `"opus"` 중 선택. 알 수 없는 값이면 `"haiku"`로 폴백 |
| `summary.stylePrompt` | 참고 | `summary.use: true`일 때 요약 스타일 지정 (형식, 길이 등)                                                                                               |
| `journal.claudeModel` | `"haiku"` | 일지 생성에 사용할 모델. `"haiku"` / `"sonnet"` / `"opus"` 중 선택. 알 수 없는 값이면 `"haiku"`로 폴백 |
| `journal.stylePrompt` | 참고 | 일지 생성 시 출력 스타일 지정 (형식, 구조 등)                                                                                                              |
| `journal.output_dir` | `""` | 일지 저장 경로. 비워두면 `~/.claude/daily-journal/data` 사용                                                                                          |
| `cleanup` | `false` | 일지 생성 후 히스토리 파일 삭제 여부. `true`로 설정하면 `.jsonl` 파일 삭제 (당일 생성된 history는 삭제 안 됨)                                                               |
| `save` | `true` | 대화 내용 저장 여부. `false`로 설정하면 stop-hook이 아무것도 기록하지 않음                                                                                        |
| `timeZone` | `"Asia/Seoul"` | 날짜/시간 기준 타임존. [IANA 타임존](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) 형식 사용 (예: `"America/New_York"`). 유효하지 않으면 기본값으로 폴백 |

## 데이터 저장 위치

```
~/.claude/daily-journal/
├── data/
│   └── YYYY-MM-DD/
│       ├── history/         # 당일 작업 기록 (.jsonl, cleanup: true면 과거 날짜만 일지 생성 후 삭제)
│       └── journal.md       # 생성된 일지
├── run-history.json         # 일지 생성 성공/실패 기록 (dj logs로 확인)
├── user-config.json         # 사용자 설정 (선택)
└── error.log                # 오류 로그
```

## 제거

```bash
dj uninstall
```

Stop 훅, 스케줄러, 쓰기 권한(`permissions.allow`), `dj` CLI를 제거합니다. 일지 데이터(`~/.claude/daily-journal/`)는 삭제되지 않습니다.
플러그인 폴더까지 완전히 삭제하려면 `~/.claude/plugins/daily-journal`을 직접 삭제하세요.

## 재설치

```bash
node ~/.claude/plugins/daily-journal/dist/setup.js
```

Stop 훅과 Task Scheduler가 재등록됩니다. `user-config.json`은 이미 존재하면 덮어쓰지 않습니다.
