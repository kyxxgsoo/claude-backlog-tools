---
name: orca-pipeline
description: Orca 조율자 파이프라인 — 백로그 항목 하나를 계획(Codex) → 교차 검증(Claude, 최대 3판) → 승인 관문 → 구현(Claude, 새 worktree) → 차이 리뷰(Codex, 최대 2판) → PR·CI(git 서브에이전트) → 머지·릴리스(프로젝트 설정에 따라 서브에이전트 또는 사람) → 배포까지 몰고 간다. 기준 브랜치(trunk의 main / git-flow의 develop)와 머지 주체는 프로젝트 값으로 정한다. 사용자가 「오르카로 진행」「조율자로 백로그 진행」「계획·검증·구현·리뷰 파이프라인」을 요청할 때 쓴다.
---

# Orca 조율자 파이프라인

이 세션(Orca 터미널 안의 Claude Code)이 **조율자**다. 조율자는 코드를 직접 쓰지 않는다. 작업자에게 일을 주고, 작업자 사이의 결정을 내리고, 출시·배포를 맡긴다. 머지를 누가 하는지는 `PROJECT.md` §머지 주체를 따른다.

- **Orca CLI의 문법과 의미는 이 문서가 정본이 아니다.** 정본은 `orca skills get orchestration`(실행 파일과 버전이 맞는 안내서)이다. 둘이 다르면 Orca 안내서를 따른다. 이 문서는 그 위에 얹은 작업 순서·역할·지시서 형식·운영 요령이다.
- **이 문서의 `<기준>`은 `PROJECT.md` §브랜치 전략의 기준 브랜치다.** trunk 프로젝트는 `main`, git-flow 프로젝트는 `develop`이다. 예시 명령의 `origin/<기준>`을 그 값으로 바꿔 쓴다.
- **모델·effort는 `PROJECT.md` §모델을 따른다.** 작업자를 새로 띄울 때마다 역할과 난이도에 맞는 `--model`·`--effort`를 붙인다(§4.11). 금지 모델은 어떤 경우에도 쓰지 않는다.
- **프로젝트마다 다른 값은 `PROJECT.md`에 둔다.** `PROJECT.template.md`를 복사해 채운다. 담는 값: 게이트 명령, 버전·결정 기록 규칙, git 규칙, 배포, 금지 구역, 서명 줄. 이 문서 본문은 특정 프로젝트를 모른다.
- 지시서 원형은 `TEMPLATES.md`에 있다. 보조 스크립트는 `scripts/`에 있다.
- **경로 기준.** 이 스킬이 시작될 때 첫머리에 `Base directory for this skill: <경로>`가 주입된다. 이 문서의 `<키트>`는 그 **절대 경로**다. `TEMPLATES.md`·`PROJECT.template.md`·`scripts/`는 모두 그 아래에 있다(플러그인 캐시 안). 사용자 저장소는 지금 있는 곳(cwd)이고, 프로젝트 값 파일(`PROJECT.md`)은 프로젝트 쪽에 있다.

## 1. 한 장 그림

```
조율자(이 세션) ─ 런 하나(run-create 또는 run-use)
 │
 ├─① 계획        Codex   worktree=current(main 체크아웃)   산출: 계획서 파일 1개
 ├─② 교차 검증   Claude  worktree=current  읽기 전용·지적만      ┐ 최대 3판
 │    └ 조율자 결정 블록 → ③ 계획 수정(같은 Codex 터미널 재사용) ┘ 3판 뒤엔 조율자가 직접 확인
 ├─④ 승인 관문   task-create(구현 Task) → gate-create → gate-resolve   (난이도 확정 → 구현·리뷰 모델 결정)
 ├─⑤ 구현        Claude  worktree=new-top-level(origin/<기준> 기준)
 │                결정 기록 → 먼저 실패하는 테스트 → 구현 → 게이트 → 커밋(푸시 안 함)
 ├─⑥ 차이 리뷰   Codex   worktree=path:<구현 worktree>  읽기 전용      ┐ 최대 2판
 │    └ 조율자 결정 → ⑦ 구현 수정(같은 Claude 터미널 재사용, 새 커밋) ┘
 ├─⑧ 출시        조율자의 git 서브에이전트(Orca 워커 아님)
 │                PR → CI → [머지 주체=서브에이전트] 머지(--match-head-commit) → 태그 → 릴리스
 │                       → [머지 주체=사람] 여기서 멈추고 사람의 머지를 기다린다
 └─⑨ 배포·정리   조율자: 빌드·재시작·헬스 확인 → 터미널 해제 → worktree 제거
```

## 2. 왜 이렇게 나눴나

- **다른 모델이 서로를 검증한다.** 계획·리뷰는 Codex, 검증·구현은 Claude가 맡는다. 같은 모델의 맹점이 단계마다 반복되지 않는다.
- **쓰는 쪽과 보는 쪽이 다르다.** 계획자와 검증자가 다르고, 구현자와 리뷰어가 다르다.
- **판 수에 상한이 있다(검증 3판·리뷰 2판).** 끝없는 핑퐁을 막는다. 남은 지적은 조율자가 결정으로 닫는다.
- **결정은 조율자만 내린다.** 작업자는 선택지와 지적만 낸다. 조율자의 결정은 계획서 맨 위 인용 블록으로 남는다. 그래서 구현자가 근거를 보고 되묻지 않는다.
- **관문은 구현 Task에 건다.** 승인 전에는 구현이 시작될 수 없다. 그 순서가 런 기록에 남는다.
- **수정 판은 같은 터미널이 받는다.** 앞 판 맥락을 가진 같은 에이전트가 고친다. 일관되고 싸다.
- **작업 공간을 나눈다.** 구현은 새 최상위 worktree에서 한다. main 체크아웃은 계획서·배포용으로 깨끗하게 둔다.
- **git은 한곳에서만 한다.** 푸시·머지 권한이 작업자에게 흩어지지 않는다. `--match-head-commit`이 리뷰한 커밋과 머지한 커밋이 같음을 보장한다.
- **판정은 exit code로 한다.** 출력 문구(「N successful」 등)로 판정하지 않는다.
- **상태는 파일로 남긴다.** 핸들 기록·지시서·계획서 백업이 남아 있으면 세션이 압축되거나 바뀌어도 이어 간다.

## 3. 역할과 권한

| 역할 | 에이전트 | 작업 공간 | 쓸 수 있는 것 | 끝 신호 |
|---|---|---|---|---|
| 조율자 | 이 세션(모델은 사용자가 `/model`로 고른 값 — 키트가 바꾸지 않는다) | main 체크아웃 | 지시서·결정 블록, 관문 해결, 배포, 난이도 판정 | — |
| 기획 | codex | `current` | 계획서 1개 | `worker_done --report-path <계획서>` |
| 교차 검증 | claude | `current` | 없음(읽기 전용) | `worker_done` 본문 = 지적 목록 또는 「지적 없음」 |
| 구현 | claude | `new-top-level` | 그 worktree 전부. git은 서브에이전트로만, 푸시 금지 | `worker_done` 본문 = 커밋 해시·게이트 결과 등 |
| 차이 리뷰 | codex | `path:<구현 wt>` | 없음(git은 diff/show/log만) | `worker_done` 본문 = 지적 목록 또는 「지적 없음」 |
| 출시 | 조율자의 git 서브에이전트(Claude Code Agent) | main 체크아웃 + 구현 wt | 브랜치 푸시, PR. 머지·태그·릴리스는 `PROJECT.md` §머지 주체가 「서브에이전트」일 때만 | 서브에이전트 보고 |

- 각 작업자의 모델·effort는 `PROJECT.md` §모델의 「역할 × 난이도」 칸이다. 비어 있으면 그 에이전트의 전역 기본값을 따른다. 출시 서브에이전트의 모델도 같은 표에서 정한다.

## 4. 단계별 절차

아래 `$STATE`는 상태 폴더다(조율자 세션의 스크래치패드). 저장소에 넣지 않는다. `<slug>`는 항목 이름이다.

### 4.0 준비

```sh
orca status --json
orca skills get orchestration                      # 버전 맞는 안내서를 먼저 읽는다
orca orchestration run-create --objective "<목표>" --json   # 이미 있으면 run-use --id <run>
export ORCA_PIPE_STATE=<상태 폴더> ORCA_PIPE_RUN=<run_id>
<키트>/scripts/drain-loop.sh                       # 백그라운드 상주(§5)
```

- 항목마다 **예비 난이도**(낮음/보통/높음)를 `PROJECT.md` §모델의 난이도 기준으로 정해 `$STATE/handles.txt`에 적는다. 기획·교차 검증 작업자는 이 예비 난이도로 띄운다. 구현·리뷰 난이도는 ④에서 확정한다(§4.11).
- 런 하나에 여러 항목을 이어 담아도 된다. 항목 구분은 핸들 기록이 한다.
- `$STATE/handles.txt`에 일마다 한 줄을 남긴다. 형식: `<slug>-<단계>\tdispatch=…\ttask=…\tterm=…`. 상태가 바뀌면 `retained`·`done+released`를 덧붙인다.
- 계획 단계는 여러 항목을 병렬로 돌려도 된다(계획서 파일이 다르면). 구현은 기계 부하와 CI를 보고 한두 개만 돌린다.

### 4.1 계획 (Codex)

```sh
orca orchestration worker-start --spec "$(cat $STATE/spec-plan-<slug>.md)" --task-title "<slug> 계획" \
  --worktree current --agent codex [--model <§모델 기획> --effort <…>] --timeout-ms 180000 --json > $STATE/plan-<slug>-start.json
```

- 계획서 절: 목표 / 지금 상태(모든 주장에 파일:줄) / 선택지와 권고 / 바뀌는 파일 / 용어 변경 / 결정 기록 초안(임시 번호) / 버전 단계 / TDD 표(「먼저 실패」와 「회귀 보호」를 나눔) / 사람 몫 / 열린 질문.
- 완료 보고를 받으면 순서대로 한다.
  1. 계획서를 백업한다: `cp <계획서> $STATE/backup-plan-<slug>.md`
  2. 터미널을 붙잡아 둔다(수정 판에 다시 쓴다): `worker-retain --dispatch <ctx>`
  3. 배달을 확인한다: `check --ack`

### 4.2 교차 검증 (Claude, 최대 3판)

```sh
# 1판 — 새 터미널
orca orchestration worker-start --spec "$(cat $STATE/spec-rev-<slug>-1.md)" --task-title "<slug> 교차 검증 1판" \
  --worktree current --agent claude [--model <§모델 교차 검증> --effort <…>] --timeout-ms 180000 --json
# 2·3판 — 같은 검증 터미널 재사용(--terminal과 --agent는 함께 못 쓴다)
orca orchestration worker-start --spec "$(cat $STATE/spec-rev-<slug>-2.md)" --task-title "<slug> 교차 검증 2판" \
  --worktree current --terminal <검증 터미널> --timeout-ms 180000 --json
```

- 지적 형식: 정확히 「지적 없음」이거나, 번호 목록이다. 항목마다 심각도(높음/중간/낮음)·문제·근거 파일:줄·고칠 방향을 적는다.
- 2판부터 지시서에 넣을 것:
  - 앞 판 결과를 「원문 그대로」 붙인다.
  - 「앞 판에서 확인된 것은 다시 보지 않는다」고 적는다.
  - 이번 판에 특히 볼 결정 번호를 적는다.
- 조율자는 지적마다 결정한다. 결정은 결정 블록으로 쓴다(§6).

### 4.3 계획 수정 (같은 Codex 터미널)

```sh
orca orchestration worker-start --spec "$(cat $STATE/spec-fix-<slug>-N.md)" --task-title "<slug> 계획 N판 반영" \
  --worktree current --terminal <기획 터미널> --timeout-ms 180000 --json
```

- 지시서에 넣을 것:
  - 검증 결과 원문
  - 결정 블록 — 「앞 블록 바로 아래에 그대로 넣는다」고 적는다.
  - 고칠 절 목록
  - 계획서 끝에 「교차 검증 반영(N판)」 절을 두라는 지시
- 수정 전후로 계획서를 백업한다: `-fixN-pre.md`, `-fixN.md`.
- 3판 반영 뒤에는 검증이 더 없다. 조율자가 직접 읽고 다음을 확인한다.
  - 결정 블록과 본문이 모순되지 않는다.
  - 열린 질문이 「없음」이다.
  - 구현자가 되묻지 않고 구현할 수 있다.
- 사용자가 중간에 요구를 더하면 「추가 결정(N+1판)」으로 같은 터미널에 한 번 더 보낸다. 이것은 검증 판 수에 세지 않는다.

### 4.4 승인 관문

```sh
TID=$(orca orchestration task-create --spec "$(cat $STATE/spec-impl-<slug>.md)" --task-title "<slug> 구현" --json \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; t=r.get("task",r); print(t.get("id") or t.get("taskId"))')
GATE=$(orca orchestration gate-create --task $TID \
  --question "계획 승인 관문 — <요지>, 계획서 <경로>, <결정 기록 번호·버전>, 교차 검증 <판별 지적 수>" \
  --options '["승인","수정"]' --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["gate"]["id"])')
orca orchestration gate-resolve --id $GATE --resolution "승인 — <누가>. 근거: <결정 블록 번호 범위>" --json
```

- 관문 질문에 **확정 난이도와 그 근거, 구현·차이 리뷰에 쓸 모델·effort**를 넣는다. 사람이 관문에서 난이도를 바꾸면(「이건 높음으로」) 그 값을 따른다.
- 관문은 구현 Task에 건다. 해결 전에는 그 Task를 시작하지 못한다.
- 사람이 자리에 없고(§4.10) 위임 규칙이 있으면(`PROJECT.md` §위임) 조율자가 해결한다. 해결문에는 「위임 결정」과 근거를 적는다.
- 위임 범위 밖의 결정은 해결하지 않고 멈춘다. 예: 되돌릴 수 없는 외부 행동, 계정·권한, 비용.

### 4.5 구현 (Claude, 새 최상위 worktree)

```sh
orca orchestration worker-start --task $TID --worktree new-top-level --name <slug> --base-branch origin/<기준> \
  --setup run --agent claude [--model <§모델 구현> --effort <…>] --timeout-ms 180000 --json > $STATE/impl-<slug>-start.json
```

- 0단계: 계획서를 worktree의 같은 상대 경로로 복사해 커밋에 넣는다. 계획서는 main 체크아웃에 추적되지 않는 파일로 있다.
- 순서:
  1. 결정 기록
  2. 용어 변경(있으면)
  3. **먼저 실패하는 테스트** — 실제로 실패하는지 확인하고 실패 요지를 기록한다.
  4. 구현
  5. 버전·변경 기록
  6. 게이트 — 전부 exit code로 판정한다.
  7. 커밋 — git 서브에이전트로만 한다. 푸시하지 않는다.
- 게이트가 실패하면 그 파일만 따로 다시 돌려 플레이크인지 가린다.
- 보고에 담을 것: 커밋 해시, 게이트별 결과, 먼저 실패한 테스트와 그 요지, 계획과 달라진 점.

### 4.6 차이 리뷰 (Codex, 최대 2판)

```sh
orca orchestration worker-start --spec "$(cat $STATE/spec-diffrev-<slug>-N.md)" --task-title "<slug> 차이 리뷰 N판" \
  --worktree path:<구현 worktree 절대 경로> --agent codex [--model <§모델 차이 리뷰> --effort <…>] --timeout-ms 180000 --json     # 2판은 --terminal <리뷰 터미널>
```

- 읽기 전용이다. `git diff origin/<기준>...HEAD`, `git show <sha>`, `git log`만 쓴다.
- 테스트·빌드는 돌리지 않는다. 구현자 게이트와 겹치고 부하만 늘기 때문이다.
- 지적이 나오면 조율자가 결정한다. 그 결정은 구현 터미널 재사용으로 보낸다: `--terminal <구현 터미널> --worktree path:<wt>`.
- 수정은 새 커밋으로 한다(amend 금지). 게이트를 다시 돈다.

### 4.7 출시 (조율자의 git 서브에이전트)

- 조율자가 먼저 확인한다.
  - worktree가 깨끗하다.
  - HEAD sha가 리뷰한 커밋과 같다.
  - `origin/<기준>`이 HEAD의 조상이다.
- 그다음 Claude Code의 Agent 도구로 git 담당 서브에이전트를 띄운다. Agent 도구의 `model`은 `PROJECT.md` §모델의 「git 담당」 칸(난이도별)으로 준다. 지시는 `TEMPLATES.md` §8(머지 주체=서브에이전트) 또는 §8b(머지 주체=사람)를 따르고, 서브에이전트가 하는 일은 다음 차례다.
  1. 머지 전 게이트를 다시 돈다.
  2. 브랜치를 푸시한다(강제 푸시 금지).
  3. PR을 만든다.
  4. CI를 끝까지 기다린다. 실패하면 재실행하지 않고 보고한다.
  5. **`PROJECT.md` §머지 주체가 「사람」이면 여기서 끝낸다.** PR 번호, PR 머리 커밋 sha, CI 결과를 보고한다. 머지·태그·릴리스 명령은 실행하지 않는다. 조율자는 사람에게 PR 링크와 「리뷰한 커밋 = PR 머리 sha」 확인 결과를 넘기고, 머지 완료를 알려 줄 때까지 ⑨를 멈춘다. 사람이 머지한 뒤에는 `gh pr view <n> --json mergeCommit,headRefOid`로 머지된 머리 sha가 리뷰한 sha와 같은지 확인한다.
  6. (머지 주체=서브에이전트일 때만) 머지 직전에 다시 fetch해 origin/<기준>이 그대로인지 본다.
  7. (〃) `gh pr merge <n> --merge --match-head-commit <sha>`로 머지한다.
  8. (〃) 기준 브랜치 체크아웃을 `git pull --ff-only`로 맞춘다.
  9. (〃) annotated 태그를 찍고 태그와 함께 푸시한다. 릴리스를 만든다. 태그·릴리스가 별도 단계(예: git-flow의 release 브랜치)인 프로젝트는 `PROJECT.md` §태그 푸시를 따른다.
- 서브에이전트로 빼는 이유: CI 대기가 조율자 맥락을 먹지 않는다. git 권한도 한곳에 모인다.

### 4.8 배포 (조율자)

프로젝트마다 다르다(`PROJECT.md` §배포). 공통 골격:

1. 이번 차이에 잠금 파일·DB 마이그레이션 변경이 있는지 본다.
2. 마이그레이션이 있으면 DB를 먼저 백업하고 무결성 검사를 한다. 백업 파일은 권한을 600으로 둔다.
3. 빌드한다.
4. 서비스를 재시작한다.
5. 헬스를 폴링한다.
6. 기동 로그 한 줄을 확인한다.
7. 진단 도구를 돌린다(있으면).

### 4.9 정리

```sh
orca orchestration worker-release --dispatch <그 터미널의 마지막 dispatch> --json
orca orchestration worker-list --run <run> --terminal-state reclaimable --json     # 0건이어야 끝
orca worktree rm --worktree path:<구현 worktree> --json    # 로컬 브랜치도 지운다 — 머지·푸시 확인 뒤에만(머지 주체=사람이면 사람의 머지 완료 확인 뒤)
```

### 4.10 진행 방식 — 사람이 있을 때와 없을 때 (`PROJECT.md` §진행 방식)

- **사람 상주**(기본): 관문(④)과 머지 주체=사람의 머지 대기(⑧)에서 멈춰 사람을 기다린다. 그 밖의 막힘도 보고하고 물어도 된다.
- **자리 비움**: 사람이 「나는 자리에 없다」고 했거나 §진행 방식이 그렇게 정했을 때.
  - 사람에게 묻는 길은 **관문 하나뿐**이다. 관문이 아닌 일로는 멈추지 않는다. 작업자 사이의 이견, 게이트 실패의 원인 판정, 판 수 초과 지적은 조율자가 결정 블록으로 닫고 계속 간다.
  - 관문은 `PROJECT.md` §위임 범위 안이면 조율자가 해결하고, 범위 밖이면 관문을 열어 둔 채 **그 항목만** 멈춘다. 독립된 다른 항목은 계속 진행한다.
  - 사람이 돌아오면 보고 형식에 맞춰 그사이 내린 결정과 열린 관문을 먼저 보고한다.
- **사용량 한도**: 조율자나 작업자가 사용량 한도에 걸리면 갱신을 기다렸다가 이어 간다. `PROJECT.md` §진행 방식이 「대체」이고 §모델 대체 표가 있으면 §4.12를 따른다.
  - 한도는 실패가 아니다. 작업자 Dispatch를 멈추거나 버리거나 재시도하지 않는다. 하트비트가 끊겨 liveness가 `unverifiable`이 되는 것은 「확인 불가」일 뿐이다(§5).
  - 이어 갈 근거는 파일이다: `$STATE/handles.txt`, 지시서, 계획서 백업, 받은 out.json. 조율자 세션이 바뀌거나 압축돼도 이 파일들로 다시 선다.
  - 재개 순서: `orca status --json` → `worker-list --run <run> --json`으로 각 작업자 상태 확인 → 밀린 배달을 §5 순서로 처리(검증 → 다음 주인 → ack) → `waitreal.sh`·`drain-loop.sh`가 꺼졌으면 다시 띄운다.
  - 조율자가 스스로 깨어날 수단이 있으면(예: Claude Code `/loop`, 예약 실행) 자리 비움 모드에서 켜 둔다. 없으면 사람이 돌아와 「이어서」라고 할 때 위 순서로 재개한다.

### 4.11 모델·effort 선택 (`PROJECT.md` §모델)

- **난이도 판정.** 조율자가 정한다. 기준은 `PROJECT.md` §모델의 난이도 기준(바뀌는 파일 수, 운영·보안·데이터 영향, 레포 수 등)이다.
  - 기획 전: 요청만 보고 **예비 난이도**를 정한다. 기획(①)·교차 검증(②)은 이 값으로 띄운다.
  - 승인 관문(④): 계획서를 보고 **확정 난이도**를 정해 관문 질문에 적는다. 구현(⑤)·차이 리뷰(⑥)·출시(⑧)는 확정 값으로 띄운다.
- **새 터미널마다 지정한다.** `worker-start --agent <에이전트> --model <id> --effort <level>`. 표의 칸이 비어 있지 않으면 **모델을 반드시 명시한다** — 전역 기본값을 따라가면 사용자가 전역을 바꿀 때(예: 비싼 모델로) 작업자가 함께 바뀐다. `--effort`만 따로 줄 수 없다(`--model` 필요).
- **터미널 재사용(`--terminal`)에는 `--model`·`--effort`를 줄 수 없다.** 수정 판은 처음 띄운 모델을 그대로 쓴다. 판 사이에 난이도가 바뀌어 모델을 바꿔야 하면 새 터미널을 띄우고, 앞 판 결과를 지시서에 원문 그대로 붙여 맥락을 넘긴다.
- **적용 확인.** `worker-start` 응답의 `launch.requested`와 `launch.effective`를 비교하고 `$STATE/handles.txt`에 `model=<effective>/<effort>`로 남긴다. 요청한 값과 다르면 보고한다.
- **금지 모델.** `PROJECT.md` §모델의 금지 목록에 있는 모델은 지정하지 않는다. `launch.effective`(또는 작업자 보고)에서 금지 모델이 확인되면 그 Dispatch를 `worker-stop`으로 멈추고, 올바른 모델로 `--retry-of` 재시작한 뒤 사람에게 보고한다. 서브에이전트(Agent 도구)의 `model`에도 금지 모델을 쓰지 않는다.
- **조율자 자신의 모델**은 사용자가 고른 세션 모델이다. 키트가 바꾸지 않는다. 금지 모델 세션이면 시작 전에 사용자에게 알린다.

### 4.12 모델 대체 — 한 공급자 한도 소진 시 (`PROJECT.md` §모델 대체)

Claude·Codex 중 한쪽 한도가 다 되면 남은 쪽이 모든 역할을 맡는다. §모델 대체 표가 비어 있으면 대체하지 않고 §4.10대로 기다린다.

- **근거가 있을 때만 바꾼다.** 근거: 작업자 화면·보고의 사용량 한도 문구, 또는 새 작업자 기동 실패 receipt(`failedStage`)의 한도 사유. 하트비트 끊김·liveness `unverifiable`·느린 응답은 근거가 아니다(§5).
- **기록.** 바꾸기 전에 결정 블록에 「모델 대체(<날짜>, <공급자> 한도, 근거: <한 줄>)」를 남긴다.
- **진행 중인 판.** 한도로 멈춘 것이 확인된 Dispatch만 `worker-stop` → `worker-start --retry-of <dispatch> --agent <남은 쪽> --model <표> [--effort <표>]`. 확인 안 된 작업자는 그대로 둔다.
- **새 터미널로만 바꾼다.** `--terminal` 재사용으로는 모델을 못 바꾼다(§4.11). 앞 판 결과·결정 블록·지시서를 **원문 그대로** 새 지시서에 붙인다.
- **쓰는 쪽과 보는 쪽을 다른 모델로.** 같은 공급자 안에서도 ①·⑤(쓰기)와 ②·⑥(보기)가 같은 모델이 되지 않게 표를 따른다.
- **Codex 만 남으면 ⑧ git 담당은 조율자가 직접** 한다(Claude Code 플러그인 서브에이전트를 못 쓴다). 같은 규칙: 이슈·브랜치·커밋 형식·서명 줄, 기준·main 직접 푸시·강제 푸시 금지, 머지 주체 준수.
- **적용 확인.** `launch.effective`가 표와 같은지 보고 `handles.txt`에 `model=<effective>/<effort>(대체)`로 남긴다.
- **복귀.** 한도가 풀리면 다음 **새** 작업자부터 §모델 표로 돌아간다. 진행 중인 판은 대체 모델로 끝낸다.

**조율자 자신이 한도에 걸렸을 때.** 작업자는 계속 돌지만 결정·ack가 멈춘다. 사람이 다른 공급자(또는 한도가 풀린) 세션을 열고 `TEMPLATES.md` §9 인계 프롬프트를 붙여 넣는다. 새 조율자는 §4.10 재개 순서를 따르고, 앞 조율자의 루프가 살아 있으면 `touch $STATE/drain.stop`으로 먼저 끈다. 인계 프롬프트는 항목을 시작할 때 `$STATE/handoff.md`로 미리 채워 두고 판마다 갱신한다(조율자가 멈춘 뒤에는 쓸 수 없다).

## 5. 메시지 루프 — 조율자가 기다리는 법

- 런의 받은 편지함은 **FIFO 배달** 단위다. 한 배달에 최대 50통이 묶인다. ack 전까지 **같은 묶음을 되돌려 준다.** 타입 필터는 「언제 깨울지」만 정한다. 앞의 묶음을 건너뛰게 해 주지 않는다.
- 문제: 작업자가 하트비트를 계속 보낸다. 하트비트만 든 배달이 앞을 막아 완료 보고가 뒤에 갇힌다.
- 해법은 스크립트 둘이다(`<키트>/scripts/`, 둘 다 백그라운드로 띄운다).
  - `drain-loop.sh`(상주): 45초마다 맨 앞 배달을 본다.
    - 하트비트만 들었으면 ack한다.
    - 진짜 메시지가 들었으면 손대지 않는다(`STOP` 로그).
    - `$STATE/drain.stop` 파일이 생기면 끝난다.
  - `waitreal.sh <out.json>`(일 하나에 한 번): `check --wait --types worker_done,escalation,question`으로 기다린다.
    - 하트비트 묶음은 ack하고 계속 기다린다.
    - 진짜 메시지가 오면 파일에 남기고 끝난다. ack는 하지 않는다.
    - 끝나면 Claude Code가 조율자를 깨운다.
    - `TIMEOUT`은 실패가 아니라 체크포인트다. 다시 띄운다.
- 진짜 메시지는 이 순서로 처리한다(Orca 안내서 「Completion accounting」).
  1. 읽는다: `python3 <키트>/scripts/showcheck.py out.json 1500`
  2. 메시지 종류에 따라 처리한다.
     - `worker_done`: 기대한 dispatch/task인지 대조한다. outcome과 filesModified를 확인하고, 산출물 파일을 직접 연다.
     - `question`: `reply --id <msg> --body "…"`로 답한다.
     - `escalation`: 판단해 처리한다.
  3. 그 터미널의 다음 주인을 정한다. 셋 중 하나다.
     - 같은 터미널로 다음 일을 보낸다.
     - `worker-retain` — 곧 다시 쓴다.
     - `worker-release` — 끝났다.
  4. 그다음에만 `check --ack <delivery>`를 한다.
- 빈 대기가 세 번 이어지면 `worker-list --json`의 `projection.liveness`·`nextAction`을 본다.
  - 하트비트나 화면 활동은 「살아 있음」일 뿐, 「끝남」이 아니다.
  - `unverifiable`은 확인할 수 없다는 뜻일 뿐이다. 멈추기·재시도·해제의 근거가 아니다.
- **ack는 조율자 하나만 한다.** 다른 세션이 같은 런을 소비하면 배달을 두고 경쟁한다. 런을 옮길 때는 이전 세션의 루프부터 끈다: `touch $STATE/drain.stop`, waitreal 중지.

## 6. 결정 블록 — 조율자가 쓰는 것

- 검증 판마다 조율자가 지적에 대한 결정을 인용 블록으로 쓴다. 기획자는 그 블록을 계획서 맨 위에 그대로 넣는다.
- 블록 머리
  - 첫 판: `> **사람의 결정 (YYYY-MM-DD, <누가·위임 여부>)**`
  - 이후 판: `> **추가 결정(N판, YYYY-MM-DD, <누가>)**`
- 번호는 원문자(①…㊿)로 **판을 넘어 이어 매긴다.** 그래야 「⑮가 ④를 대체」처럼 이름으로 가리킬 수 있다. 「결정끼리 다르면 뒤 판이 이긴다」를 지시서에 적는다.
- 결정 하나의 모양: 굵은 제목(어느 지적인지) + 정한 것(목록) + 고른 이유 한 줄. 검증자 방향을 그대로 따른 결정은 「검증자 방향을 따른다」 한 줄로 묶어도 된다.
- 앞 블록은 고치지 않는다. 기록이기 때문이다.
- 구현 지시서에 「블록과 본문이 모순되면 시작하지 말고 ask로 묻는다」를 넣는다.

## 7. 지시서 형식 (모든 역할 공통)

- 절 순서: `[역할]` `[대상]` `[읽는 순서]` `[볼 것]`·`[할 일]` `[제약]` `[수락]`. 원형은 `TEMPLATES.md`에 있다.
- Orca 안내서의 Task-spec 계약을 채운다: 대상·변경·제약·소유·관찰 가능한 수락.
- **자기완결로 쓴다.** 작업자는 조율자의 대화를 보지 못한다. 앞 판 결과는 「원문 그대로」 붙인다. 사용자 요구도 원문을 인용한다.
- 수락에 끝 신호까지 적는다: `worker_done --outcome succeeded --report-path <파일>` 또는 「본문에 담아」.
- 금지 구역(`PROJECT.md` §금지 구역)은 지시서마다 다시 적는다. 작업자는 이 문서를 보지 못한다.
- 셸로 넘길 때는 **파일로 쓰고 `--spec "$(cat FILE)"`**로 넘긴다. 따옴표 없는 heredoc이나 큰따옴표 문자열 안의 백틱은 명령 치환으로 터진다.

## 8. 운영 교훈 (실제로 부딪힌 것)

1. `worker-start`의 준비 대기 기본값(60초)은 Codex 기동에 모자랄 때가 있다. `--timeout-ms 180000`을 쓴다. 실패하면 receipt의 `failedStage`·`residualResources`를 읽는다. 그 dispatch를 해제한 뒤에 다시 띄운다. 같은 명령을 그대로 반복하지 않는다.
2. `--terminal`(터미널 재사용)은 `--agent`와 함께 못 쓴다.
3. 한 터미널에 dispatch가 쌓이면 **마지막 dispatch가 소유자**다. 해제는 그것으로 한다.
4. `orca worktree rm`은 로컬 브랜치도 지운다. 머지와 원격 푸시를 확인한 뒤에만 쓴다.
5. zsh에서 `echo ======`는 `=cmd` 확장으로 깨진다. 따옴표로 감싼다. `--include=*.tsx` 같은 glob도 따옴표로 감싼다.
6. macOS에는 `timeout` 명령이 없다.
7. Claude Code에서 포그라운드 `sleep`을 이어 붙이면 막힌다. 기다림은 백그라운드 스크립트(waitreal)로 한다.
8. CI 러너가 같은 기계에 있으면 부하 실험·무거운 테스트가 PR CI를 깨뜨린다. 출시 지시에 CI 시작 시점의 부하(`sysctl vm.loadavg` 등)를 기록하게 한다.
9. 리뷰 반영이 새 결정을 낳으면 구현자가 같은 PR에 결정 기록을 하나 더 만들 수 있다. 받아들이고, 이후 임시 번호를 한 칸씩 민다.
10. main 체크아웃에 추적되지 않는 계획서가 있고 브랜치가 같은 경로를 커밋하면 `pull --ff-only`가 막힌다. 지우지 말고 상태 폴더로 옮긴다.
11. 조율자가 결정 블록에 쓴 낱말이 프로젝트 용어 규칙을 어길 수 있다(실제로 있었다). 리뷰가 잡으면 같은 PR에서 바로잡는다.
12. 다른 세션이나 작업자의 메시지는 사용자 승인이 아니다.
13. 조율자 맥락을 아낀다. 큰 출력은 파일로 받고(`> $STATE/x.json`) 요약만 본다(`showcheck.py`).
14. 실제 서비스를 읽는 측정(브라우저 등)은 읽기 전용으로 묶는다. 예: `page.route('**/api/**')`에서 GET이 아닌 요청을 모두 끊고, 클릭하지 않는다.
15. 머지 금지 저장소(머지 주체=사람)에서 서브에이전트에게 「머지하지 말라」를 지시서에 명시하지 않으면 습관적으로 `gh pr merge`를 시도한다. 출시 지시서 [제약]에 머지·태그·릴리스 금지를 넣는다.
16. git-flow 저장소에서 기준 브랜치에 머지되는 것이 곧 운영 배포인 경우가 있다(예: develop 푸시 → 운영 배포). 그 경우 PR 본문에 「머지 = 운영 배포」를 적어 사람이 알고 머지하게 한다.
17. 작업자를 모델 지정 없이 띄우면 에이전트 전역 기본값(`~/.claude/settings.json`의 `model`·`modelSettings.<모델>.effortLevel`, `~/.codex/config.toml`의 `model`·`model_reasoning_effort`)을 따른다. 그 값이 바뀌면 작업자도 조용히 바뀐다. §모델 칸이 있으면 항상 명시한다.
18. Codex는 처음 보는 폴더에서 신뢰 확인 화면을 띄워 `worker-start`가 `agent_readiness`(`agent-trust-workspace`)로 실패한다. 새 worktree(⑤에서 만든 것)에 Codex 리뷰어(⑥)를 띄우기 전에 `~/.codex/config.toml`에 `[projects."<worktree 절대 경로>"] trust_level = "trusted"`가 있는지 보고 없으면 추가한다(백업 후).
19. 서브모듈이 있는 저장소에서 `new-top-level` worktree는 서브모듈을 초기화하지 않는다(빈 디렉터리). 구현 지시서 첫 단계에 필요한 서브모듈만 `git submodule update --init <경로>`하고 `rev-parse --show-toplevel`·`submodule status`로 확인하게 한다. 확인 전 `git -C <서브모듈>` 명령은 상위 저장소에 대고 실행될 수 있다.
20. `worker-start --spec <파일 이름>`은 파일을 읽지 않고 **이름 문자열만** 작업자에게 보낸다. 작업자는 그 파일을 찾지 못해 되묻거나(실제로 있었다), 이름만 보고 짐작해 일한다. 항상 `--spec "$(cat <파일>)"`로 본문을 넘긴다. 잘못 보냈으면 `reply`로 본문 전체를 보내고, 그 판의 결과는 다음 판에서 전체를 다시 보게 한다.

## 9. 새 프로젝트로 옮기는 순서

1. 플러그인을 설치한다(기기마다 한 번): `/plugin marketplace add kyxxgsoo/claude-backlog-tools` → `/plugin install orca-pipeline@kyxxgsoo-tools`. git 담당으로 `git-flow@kyxxgsoo-git-flow`도 설치한다. 손으로 복사한 `~/.claude/skills/orca-pipeline/`이 있으면 지운다(같은 이름의 스킬이 둘 뜬다).
2. `PROJECT.template.md`를 프로젝트에 복사해 채운다. 예: `.claude/orca-pipeline.md`. 게이트·git·브랜치 전략·머지 주체·진행 방식·모델·배포·금지 구역이 비어 있으면 출발하지 않는다(§모델은 「전역 기본값 사용」도 값이다).
3. 새 세션(Orca 터미널 안의 Claude Code)에 지시한다: 「orca-pipeline 스킬로 <항목>을 진행해. 프로젝트 값은 <경로>.」
4. 첫 실행 점검
   - `orca status --json`과 `orca skills get orchestration`을 돌린다.
   - 런을 만든다.
   - `ORCA_PIPE_STATE`·`ORCA_PIPE_RUN`을 정한다.
   - drain-loop를 백그라운드로 띄운다.
