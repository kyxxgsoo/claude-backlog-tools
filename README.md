# backlog-tools

백로그와 스탠드업 — **`docs/BACKLOG.md`를 손으로 고치지 않게** 하는 Claude Code
스킬 셋. 끼어든 요구·사람만 할 수 있는 일·장기 방향을 한 문서에 모으고, 적고
지우는 것은 전부 명령이 한다.

## 설치

```bash
claude plugin marketplace add kyxxgsoo/claude-backlog-tools
claude plugin install backlog-tools
```

## 스킬 셋

| 스킬 | 하는 일 |
|------|---------|
| `/backlog` | 표 셋(대기 중인 요구 · 사람 몫 · 장기 방향) + 진행 체크리스트 + 정직성 점검 ⚠. **읽기 전용** |
| `/backlog-add` | 적고 지우는 모든 것 — 한 줄 추가, 장기 방향 절, 진행 갱신, 사람 몫, 삭제, `init` |
| `/standup` | 지금 어디에 서 있나 한 화면 — 지금 브랜치 · 사람 몫 · 앞으로 할 것 · 완료된 것 |

세 스킬 모두 `plugins/backlog-tools/scripts/`의 node 스크립트를 부르는 얇은
껍질이다. **외부 의존성 0** — node 코어 모듈만 쓰고 네트워크를 쓰지 않는다.

## 전제 — `docs/BACKLOG.md`

문서 하나가 정본이다. 없으면 어느 명령이든 한 줄로 알려 주고, 만드는 것은
`init`이다(스킬이 **묻고 나서** 부른다):

```bash
node <플러그인>/scripts/backlog.mjs init
```

골격은 절 둘과 자리표시자뿐이다. 장기 방향(`## B-N.`) 절은 첫 `add --long`이
만든다.

```markdown
## 대기 중인 요구 (구현되면 즉시 삭제)
- (없음)

## 사람 몫 (에이전트가 아니라 사람이 하는 것 — 끝나면 즉시 삭제)
- (없음)
```

문서를 찾는 뿌리는 **지금 있는 곳(cwd)의 git 저장소 뿌리**이고, git 저장소가
아니면 cwd다. `--root <dir>`가 언제나 그보다 앞선다.

### 세 절의 형식

- **대기 중인 요구** — `- **제목** — 요약. (YYYY-MM-DD, 맥락)`. 날짜는
  `Asia/Seoul`의 오늘이 기본값이고 맥락은 브랜치 이름에서 온다
  (`feature/x` → `x 작업 중 들어옴`). 구현이 머지되면 `done`으로 **지운다**.
- **사람 몫** — 같은 문법에 맥락 자리가 **출처**다(`--source` 필수). 에이전트가
  대신 못 하는 일(연동 켜기·첫 승인·개발 서버 띄우기)을 여기 남긴다.
- **장기 방향** — `## B-N. 제목 (날짜)` + 현 상태 / 잔여 방향 / 미결 질문 세 칸,
  그리고 선택인 **작성**·**진행**. 절을 지워도 **번호는 다시 매기지 않는다** —
  다른 문서가 그 번호를 이름으로 가리킨다.

### 「작성」 — 어느 도구가 적었나

줄을 적으면 그 줄을 **어느 도구가 적었는지**가 함께 남는다. 환경 변수로 짐작하고
(Claude Code는 `claude`, Codex CLI는 `codex`, Gemini CLI는 `gemini`), `--via <이름>`이
언제나 그 짐작을 이긴다. 아무 도구도 감지되지 않으면 **아무것도 적지 않는다** —
사람이 터미널에서 직접 친 것이고, 모르는 것을 「사람」이라 적으면 그것도 짐작이다.

적히는 자리는 줄 꼬리(`(2026-09-08, 맥락, 작성: claude)`)와 장기 절의 칸 하나
(`- **작성**: claude`)이고, 표 셋에 「작성」 열로 보인다. 이 기능 이전의 옛 줄은
빈 칸으로 남는다 — 소급해서 채우지 않는다.

`--via` 값에 괄호나 쉼표가 들면 **거절한다**. 그 글자들이 꼬리 괄호의 구분을 깨뜨려
다음에 읽을 때 날짜와 맥락까지 요약으로 흡수되기 때문이고, 사람이 친 값을 말없이
다듬으면 문서에 무엇이 적혔는지 모르게 되므로 고쳐 주지 않고 멈춘다.

### 정직성 점검 ⚠

목록이 "끝난 것"으로 차오르지 않게 세 가지를 짚는다: 항목이 가리킨 `ADR-NNN`이
**그 항목을 적은 뒤에** 나왔으면 머지된 듯(날짜는 `docs/CHANGELOG.md`가 말한다),
대기 줄이 30일을 넘겼을 때, 진행이 전부 완료일 때. ⚠는 **힌트일 뿐 아무것도
지우지 않는다** — 삭제는 사람이 정한다.

`docs/ADR.md`·`docs/CHANGELOG.md`·루트 `package.json`이 없는 저장소에서는 그
검사와 그 화면 줄이 **아예 나오지 않는다**. 견줄 것이 없는 것이지 위반이 아니다.

## 원본

[Karvis](https://github.com/kyxxgsoo/Karvis)의 `scripts/backlog.mjs`·
`scripts/standup.mjs`와 스킬 셋에서 추출했다. 설계 판단은 그 저장소의
ADR-091(형식은 스크립트가 쥔다)·ADR-092(진행 체크리스트)·ADR-093(사람 몫·삭제
명령·스탠드업)·ADR-109(ADR 날짜 기준 ⚠, 번호 재사용 금지)에 남아 있고, 코드
주석이 그 번호를 그대로 인용한다.

어느 저장소에서나 돌게 바꾼 것은 넷이다: 뿌리를 스크립트 위치가 아니라 cwd로,
`init` 명령 추가, 없는 문서에 대한 우아한 축소, 제품 전용 문구 정리.

## 테스트

```bash
node --test plugins/backlog-tools/scripts/__tests__/*.test.mjs
```

## 라이선스

MIT

---

# orca-pipeline

Orca 조율자 파이프라인 — **현재 세션이 조율자**가 된다. Codex에서 시작하면 Codex,
Claude Code에서 시작하면 Claude가 맡는다. 공통 프로젝트 설정을 읽고
Orca 워커로 **계획(Codex) → 교차 검증(Claude, 최대 3판) → 승인 관문 → 구현(Claude,
새 worktree) → 차이 리뷰(Codex, 최대 2판) → 출시(git 서브에이전트) → 배포**를 돈다.
서로 다른 모델이 서로를 검증하고, 결정은 조율자만 내린다.

## 설치

```bash
claude plugin marketplace add kyxxgsoo/claude-backlog-tools
claude plugin install orca-pipeline@kyxxgsoo-tools
claude plugin install git-flow@kyxxgsoo-git-flow   # 출시 단계의 git 담당
```

전제: Orca 앱과 CLI, 작업자로 사용할 Codex·Claude CLI의 로그인, **현재 세션의
Orca 발신자 연결**. Claude 플러그인 설치와 발신자 연결은 별개다. Codex도 같은
`plugins/orca-pipeline/skills/orca-pipeline/` 스킬을 읽는다. Codex에 이미 플러그인이
노출되어 있으면 중복 설치하지 않는다. 없으면 Codex의 스킬 설치 경로에 그 폴더
전체를 설치한다(HOSTS·TEMPLATES·scripts도 함께 필요하다).

Orca 밖의 채팅에서 `no_active_sender_terminal`이 나오면 설정 준비까지만 가능하다.
같은 공급자의 Orca 세션에서 실행하거나 지원되는 자기 세션 연결을 먼저 해야 한다.
다른 터미널 핸들을 빌려 실행하지 않는다. 상세: [HOSTS.md](plugins/orca-pipeline/skills/orca-pipeline/HOSTS.md).

## 프로젝트마다 한 번

스킬 폴더의 `PROJECT.template.md`를 프로젝트에 복사해 채운다(예:
`.claude/orca-pipeline.md`). 게이트·git·**브랜치 전략**(trunk `main` / git-flow
`develop`)·**머지 주체**(서브에이전트 / 사람)·배포·금지 구역이 비어 있으면 출발하지
않는다. `.claude/`라는 이름이어도 두 호스트가 이 파일 하나를 공유한다. 조율자를
프로젝트마다 고정하지 않는다. 그다음 어느 호스트에서든 이렇게 말한다:

> orca-pipeline 스킬로 <항목>을 진행해. 프로젝트 값은 .claude/orca-pipeline.md.

## 구성

| 파일 | 내용 |
|------|------|
| `SKILL.md` | 구조, 역할 표, 단계별 명령, 메시지 루프, 결정 블록, 운영 교훈 |
| `HOSTS.md` | Codex·Claude 도구 차이, 자기 Orca 발신자 확인, 기존 Run 인계 |
| `TEMPLATES.md` | 지시서 원형 — 계획 · 교차 검증 · 계획 수정 · 관문 · 구현 · 차이 리뷰 · 구현 수정 · 출시(§8 서브에이전트 머지 / §8b 사람 머지) |
| `PROJECT.template.md` | 프로젝트마다 채울 값 |
| `scripts/` | `classify.py` · `drain.sh` · `drain-loop.sh` · `waitreal.sh` · `showcheck.py` — 하트비트가 받은편지함을 막지 않게 하는 메시지 루프 보조. `limitwatch.sh` · `limitmatch.py` — 작업자 화면의 사용량 한도 문구를 잡아 조율자를 깨운다(모델 대체, `scripts/test/limitwatch-test.sh`로 확인). 경로와 런 id는 환경 변수(`ORCA_PIPE_STATE`·`ORCA_PIPE_RUN`)로 받는다 |


## orca-pipeline 변경 기록

- **0.6.0** — 현재 Codex/Claude 세션이 메인 조율자를 맡는다. 출시 도구와 대기 방법을 호스트별로 구분하고, 공유 프로젝트 설정·기존 Run 인계·발신자 확인 절차를 추가했다. Codex에서 git을 직접 하도록 하던 예외를 없앴다. Orca 밖의 미등록 채팅은 실행 완료로 보고하지 않는다.
