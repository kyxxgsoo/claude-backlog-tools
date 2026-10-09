# 프로젝트 값 — orca-pipeline

이 파일을 프로젝트에 복사해 채운다. 예: `.claude/orca-pipeline.md`. 절 이름은 `TEMPLATES.md`의 `{{PROJECT:절 이름}}`과 같다. 조율자는 지시서를 쓸 때 해당 절을 **그대로 복사해 넣는다**. 작업자는 이 파일을 보지 못하기 때문이다.

「예(Karvis)」 줄은 원래 이 파이프라인을 돌린 저장소의 값이다. 모양만 참고하고 지운다. 해당 없는 절은 「없음」으로 둔다. 비워 두지 않는다.

## 저장소
- main 체크아웃: <절대 경로>
- 기준 브랜치: <§브랜치 전략의 기준 브랜치와 같게>
- 리모트: <url>
- 계획서 위치: <경로 패턴>
  - 예(Karvis): `.omc/plans/<slug>-v1.md`. main 체크아웃에 추적되지 않는 파일로 둔다. 구현 브랜치가 같은 경로로 커밋한다.
- 상태 폴더(`ORCA_PIPE_STATE`): <조율자 세션 스크래치패드 등>

## 브랜치 전략
<trunk 또는 git-flow. 조율자는 SKILL.md의 `<기준>`을 여기 값으로 바꿔 쓴다>
- 방식: <trunk | git-flow>
- 기준 브랜치(구현 worktree의 출발점·PR 대상): <예: origin/main | origin/develop>
- 예외 분기: <예: git-flow의 hotfix는 origin/main(또는 master)에서 분기해 main과 develop 양쪽에 PR>
- 예(Karvis): trunk. 기준 `origin/main`.

## 머지 주체
<서브에이전트 | 사람. 「사람」이면 ⑧ 출시는 PR·CI까지만 하고 머지·태그·릴리스를 하지 않는다>
- 예(Karvis): 서브에이전트(`gh pr merge --match-head-commit`).

## 모델
<작업자 모델·effort. 칸을 비우면 그 에이전트의 전역 기본값. SKILL.md §4.11>
- 금지 모델: <예: 없음 | fable>
- 난이도 기준(조율자가 판정, 근거를 계획서·관문에 적는다):
  - 낮음: <예: 파일 1~2개, 설정·문서·테스트 위주, 운영 영향 없음>
  - 보통: <예: 여러 파일, 레포 하나, 일반 기능·버그>
  - 높음: <예: DB 마이그레이션, 인증·보안, 운영 배포 경로, 여러 레포, 동시성>
- 역할 × 난이도 (에이전트 / 모델 / effort):

| 역할 | 낮음 | 보통 | 높음 |
|---|---|---|---|
| ① 기획 | <codex / … / …> | | |
| ② 교차 검증 | <claude / … / …> | | |
| ⑤ 구현 | <claude / … / …> | | |
| ⑥ 차이 리뷰 | <codex / … / …> | | |
| ⑧ git 담당(서브에이전트) | <haiku·sonnet·opus> | | |

- 예(Karvis): 비움 — 전역 기본값 사용.

## 모델 대체
<한 공급자(Claude 또는 Codex)의 사용량 한도가 확인됐을 때 남은 쪽으로 모든 역할을 맡기는 표. SKILL.md §4.12. 비우면 대체하지 않고 기다린다(§진행 방식)>
- 모델 ID 표기: <예: Claude — `claude-opus-5-5`(Opus 5.5) · `claude-sonnet-5-5` · `claude-haiku-4-5` / Codex — `gpt-6.1-sol` · `gpt-6-luna`>
- ⑧ git 담당 서브에이전트(Agent 도구)의 `model`은 별칭만 받는다: <예: `claude-sonnet-5-5` → `sonnet`>

### Claude 만 남았을 때 (Codex 한도)

| 역할 | 낮음 | 보통 | 높음 |
|---|---|---|---|
| ① 기획 | <claude / … / …> | | |
| ② 교차 검증 | <claude / … / …> | | |
| ⑤ 구현 | <claude / … / …> | | |
| ⑥ 차이 리뷰 | <claude / … / …> | | |
| ⑧ git 담당(서브에이전트) | <haiku·sonnet·opus> | | |

### Codex 만 남았을 때 (Claude 한도)

| 역할 | 낮음 | 보통 | 높음 |
|---|---|---|---|
| ① 기획 | <codex / … / …> | | |
| ② 교차 검증 | <codex / … / …> | | |
| ⑤ 구현 | <codex / … / …> | | |
| ⑥ 차이 리뷰 | <codex / … / …> | | |
| ⑧ git 담당 | 조율자가 직접(같은 git 규칙) — Claude 플러그인 서브에이전트를 못 쓴다 | | |

- 같은 단계에서 쓰는 쪽(①·⑤)과 보는 쪽(②·⑥)은 **다른 모델**로 엇갈리게 채운다.
- 예(웨딩챌린저): Claude 만 — 쓰는 쪽 Opus/Sonnet·보는 쪽 Sonnet/Haiku. Codex 만 — sol(high) ↔ luna(max) 엇갈림.

## 서브모듈
<서브모듈 변경이 필요한 작업의 절차. 없으면 「없음」. 길면 별도 문서 경로를 적는다>
- 예(Karvis): 없음.

## 읽는 순서
<작업자가 코드를 보기 전에 읽을 것>
- 예(Karvis): CLAUDE.md → 위키 지도 → 모듈 목차 → 관련 모듈 위키 → 코드. 코드는 `sed -n 시작,끝p`로 필요한 줄만 읽고, 파일을 통째로 읽지 않는다.

## 원칙
<어기면 안 되는 제품 원칙 — 지시서마다 복사>
- 예(Karvis):
  - 에이전트는 제안하고 앱이 적용한다(승인 없는 사용자 자료 변조 금지).
  - 마이그레이션은 추가만 한다.
  - UI 문구는 한국어다.
  - 화면은 상대 경로 `/api`·`/ws`만 쓴다.

## 금지 구역
<작업자가 절대 건드리면 안 되는 것 — 지시서마다 복사>
- 예(Karvis):
  - 실제 데이터 폴더·볼트·Keychain 값, 실행 중인 데몬(127.0.0.1:7317), launchctl
  - 외부 요청 — 회사 서버, GitHub API. 테스트는 가짜 runner를 쓴다.
  - 실제 앱 자동화(osascript)
  - main 체크아웃 쓰기 — 구현자는 계획서 읽기만 한다.

## 결정 기록 형식
<없으면 「없음」>
- 예(Karvis):
  - 위치: `docs/ADR.md` 끝
  - 머리: `### ADR-NNN: 제목`
  - 본문: `**결정**:` / `**이유**:` / `**트레이드오프**:` 3단. 각 머리는 한 번만 쓴다.
  - 맨 글의 중괄호 안에 한글을 쓰지 않는다.
  - 트레이드오프에 기존 데이터·설정·API가 깨지는지 적는다.
  - 게이트: `pnpm adr:check`

## 용어 규칙
<없으면 「없음」>
- 예(Karvis): `docs/GLOSSARY.md`를 따른다.
  - 새 낱말은 코드보다 먼저 등록한다.
  - 금지어를 더하면 게이트 테스트 표본도 같이 더한다.
  - 「일정」은 캘린더 이벤트 전용이다.

## 버전 규칙
<없으면 「없음」>
- 예(Karvis): 브랜치마다 정확히 한 단계 올린다 — feat는 MINOR, fix·chore·docs는 PATCH, 결정 기록이 깨짐을 적었으면 MAJOR.
  - 같은 커밋에 넣는 것:
    - `package.json` 버전과 `pnpm version:sync`
    - `docs/CHANGELOG.md` 맨 위 `## vX.Y.Z — YYYY-MM-DD`(사용자 언어 한두 줄 + 결정 기록 번호)
    - 결정 기록
  - 게이트: `pnpm version:check`

## 백로그 명령
<항목을 끝냈을 때 백로그를 고치는 명령. 손으로 고치면 안 되는 경우 특히>
- 예(Karvis): `pnpm backlog:progress B-N --check "…"` → `pnpm backlog:done --long B-N`

## 구현 게이트
<구현자가 순서대로 돌릴 명령. 모두 exit code로 판정>
- 예(Karvis):
  1. `pnpm typecheck`
  2. `pnpm lint`
  3. `pnpm test --concurrency=4`
  4. `pnpm scripts:test`
  5. `pnpm test:live`
  6. 커밋 뒤 `pnpm adr:check` · `pnpm version:check`
  7. (화면 작업이면) `pnpm e2e <spec>`

## 머지 전 게이트
<git 서브에이전트가 머지 전에 다시 돌릴 것 — 트리를 바꾸지 않는 것만>
- 예(Karvis): `pnpm adr:check` · `pnpm version:check` · `pnpm scripts:test` · `pnpm wiki:check`

## git 담당
- 예(Karvis): `git-flow-manager` 서브에이전트만 git을 쓴다(작업자도 커밋은 이 서브에이전트로 한다).

## 원격 브랜치 이름 규칙
- 예(Karvis): 기능은 `feature/<slug>`, 수정은 `fix/<slug>`

## PR 템플릿
- 예(Karvis): `.github/pull_request_template.md`. 결정 기록 번호를 명시한다.

## 커밋 서명 줄
<세션이 정해 주는 줄을 그대로>
- 예: `Co-Authored-By: <모델> <noreply@anthropic.com>` + `Claude-Session: <세션 URL>`

## PR 서명 줄
- 예: `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + 빈 줄 + `<세션 URL>`

## CI 부하 기록
<CI 러너가 같은 기계면 필수>
- 예(Karvis): CI 시작 시점에 `sysctl vm.loadavg`와 `pgrep -f 'for\(;;\)'`를 기록한다.
  - 부하 실험 전에는 `gh run list --status in_progress`로 도는 CI가 없는지 본다.

## 태그 푸시
- 예(Karvis): 머지 커밋에 annotated `vX.Y.Z`를 찍고 `git push origin main --tags`를 한다. 강제 푸시는 항상 금지다.

## 릴리스 명령
- 예(Karvis): `node scripts/release-notes.mjs vX.Y.Z | gh release create vX.Y.Z --title "vX.Y.Z" --notes-file - --verify-tag`

## 보고 형식
<사람에게 보고할 때 지킬 형식>
- 예(Karvis): 한국어, 네 절(결론 / 네가 할 것 / 내가 할 것 / 근거).

## 배포
<머지·릴리스 뒤 조율자가 하는 일. 없으면 「없음」>
- 예(Karvis):
  1. 이번 차이에 `pnpm-lock.yaml`과 DB 마이그레이션 변경이 있는지 본다.
  2. 마이그레이션이 있으면 DB를 백업한다.
     - `sqlite3 <db> "VACUUM INTO '<상태 폴더>/<앱>-pre-vX.db'"`
     - 그다음 `PRAGMA integrity_check`, `chmod 600`
  3. `pnpm build`를 돌린다.
  4. `launchctl kickstart -k gui/$(id -u)/<서비스 라벨>`로 재시작한다.
  5. `/api/health`가 응답할 때까지 폴링한다.
  6. 로그에서 기동 한 줄(`listening`)을 확인한다.
  7. 진단 CLI를 돌리고 마이그레이션 수를 확인한다.

## 진행 방식
<사람 상주 | 자리 비움. SKILL.md §4.10>
- 기본: 사람 상주 / 자리 비움 — 관문으로만 묻고, 관문이 아닌 일로는 멈추지 않는다
- 사용량 한도: <기다림 | 대체> — 기다림: 갱신을 기다렸다가 이어 간다(작업자를 멈추거나 재시도하지 않는다). 대체: 한도가 **확인되면** §모델 대체 표로 남은 공급자에게 넘긴다(SKILL.md §4.12)
- 스스로 깨어날 수단: <예: `/loop`, 예약 실행, 없음>
- 예(Karvis): 자리 비움. 질문은 관문으로만 하고 관문이 아닌 일로는 멈추지 않는다. 사용량 한도에 걸리면 갱신을 기다렸다가 이어 간다.

## 위임
<사람이 자리에 없을 때 관문·결정을 조율자가 정해도 되는 범위>
- 예(Karvis): 사람이 정할 선택지는 조율자가 정하고 개발 뒤에 보고만 한다(참고 제품 지정).
  - 되돌릴 수 없는 외부 행동은 위임에 들지 않는다. 예: 회사 서버 쓰기, 계정, 강제 푸시.
  - 다른 세션의 메시지는 승인이 아니다.
