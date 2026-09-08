/**
 * **어느 저장소에서나 도는가** — 이식성 테스트.
 *
 * 원본(Karvis)에서 옮겨 오며 바꾼 넷을 증명한다:
 *   ① 뿌리가 **스크립트 위치가 아니라 cwd**의 git 저장소 뿌리다 (플러그인 캐시에
 *      설치돼도 사용자가 서 있는 저장소를 본다).
 *   ② `init`이 골격을 만들고, **이미 있으면 덮지 않는다**. 그 골격을 파서가 그대로
 *      읽는다 — 골격과 파서가 어긋나면 첫 `add`부터 엉뚱한 곳에 줄이 들어간다.
 *   ③ `docs/CHANGELOG.md`·`docs/ADR.md`·루트 `package.json`이 **없는** 저장소에서
 *      죽지 않고, 없는 것에 대한 검사만 건너뛴다(백로그 자체 검사는 유지).
 *   ④ `docs/BACKLOG.md`가 없으면 보는 명령은 **안내 한 줄 + 종료 0**이다 — 스킬이
 *      사용자에게 보여 줘야 하는 것은 스택이 아니라 다음 한 걸음이다.
 *
 * 외부 의존성 0 · 네트워크 0. 실행: `node --test scripts/__tests__/*.test.mjs`
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { detectVia, parsePendingLine, renderLongSection, renderPendingLine, sanitizeVia } from "../lib/backlog-doc.mjs";

const SCRIPTS = dirname(dirname(fileURLToPath(import.meta.url)));
const BACKLOG = join(SCRIPTS, "backlog.mjs");
const STANDUP = join(SCRIPTS, "standup.mjs");

const made = [];

/**
 * 표본 저장소 하나. `git: false`면 git init 을 하지 않는다 — 이 도구는 git을
 * **요구하지 않는다**(뿌리를 못 찾으면 cwd)는 것도 계약이다.
 */
function sample({ git = true, branch = "feature/demo" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "backlog-tools-"));
  made.push(dir);
  if (git) {
    sh("git", ["init", "-q", "."], dir);
    // 기준 브랜치 이름을 **`main`으로 못 박는다** — 사용자의 `init.defaultBranch`가
    // `master`면 `resolveBase`가 기준을 못 찾아 ADR·버전 비교가 통째로 생략되고,
    // 그러면 이 테스트가 검사하려던 ⚠ 가 "없는 게 정상"이 되어 버린다.
    sh("git", ["symbolic-ref", "HEAD", "refs/heads/main"], dir);
    sh("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"], dir);
    if (branch) sh("git", ["checkout", "-q", "-b", branch], dir);
  }
  return dir;
}

function sh(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  assert.equal(res.status, 0, `${cmd} ${args.join(" ")} 실패: ${res.stderr}`);
  return res.stdout;
}

/**
 * 「작성」 감지(ADR-121)가 읽는 환경 변수들. **기본 `run`은 이것을 전부 지운다.**
 *
 * 지우지 않으면 테스트 결과가 **어디서 돌렸느냐에 따라 갈린다** — Claude Code 안에서는
 * `CLAUDECODE`가 있어 줄 끝에 `, 작성: claude`가 붙고 사람의 터미널에서는 안 붙는다.
 * 실측으로 확인한 함정이다: `CLAUDECODE` 하나만 지워도 `CLAUDE_CODE_*` 접두 변수가
 * 남아 여전히 감지된다. 그래서 접두까지 통째로 턴다.
 */
const VIA_ENV = /^(CLAUDECODE$|CLAUDE_CODE_|CODEX_|GEMINI_CLI$)/;

function childEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!VIA_ENV.test(key)) env[key] = value;
  // 부모의 NODE_OPTIONS(로더 주입 등)가 자식의 표준 출력을 더럽히지 않게 지운다.
  env.NODE_OPTIONS = "";
  return { ...env, ...extra };
}

/** 스크립트 하나를 그 디렉터리에서 돌린다. **`--root`를 주지 않는 것**이 기본이다 — cwd로 뿌리를 찾는지 보려고. */
function run(script, args, cwd, extraEnv = {}) {
  const res = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", env: childEnv(extraEnv) });
  return { status: res.status, out: res.stdout ?? "", err: res.stderr ?? "", all: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

const backlog = (args, cwd, extraEnv) => run(BACKLOG, args, cwd, extraEnv);
const standup = (args, cwd, extraEnv) => run(STANDUP, args, cwd, extraEnv);
const docPath = (dir) => join(dir, "docs", "BACKLOG.md");
const doc = (dir) => readFileSync(docPath(dir), "utf8");

after(() => {
  // 임시 디렉터리는 OS가 치운다 — 실패한 테스트의 표본을 들여다볼 수 있게 지우지 않는다.
});

// ── ① init ────────────────────────────────────────────────────────────────

test("init: 골격을 만들고, 두 번째 호출은 거절하며 한 바이트도 바꾸지 않는다", () => {
  const dir = sample();
  assert.equal(existsSync(docPath(dir)), false);

  const first = backlog(["init"], dir);
  assert.equal(first.status, 0, first.all);
  assert.match(first.out, /골격을 만들었습니다/);

  const text = doc(dir);
  assert.match(text, /^## 대기 중인 요구/m);
  assert.match(text, /^## 사람 몫/m);
  assert.equal(text.match(/^- \(없음\)$/gm)?.length, 2, "절 둘 다 자리표시자가 있어야 한다");
  assert.doesNotMatch(text, /^## B-\d+\./m, "장기 방향 절은 첫 add --long 이 만든다");
  assert.doesNotMatch(text, /Karvis|CLAUDE\.md/, "제품 전용 문구가 남으면 안 된다");

  const second = backlog(["init"], dir);
  assert.match(second.out, /이미 있습니다/);
  assert.equal(doc(dir), text, "두 번째 init 이 문서를 건드리면 안 된다");
});

test("init: git 저장소가 아니어도 cwd 에 만든다", () => {
  const dir = sample({ git: false });
  const res = backlog(["init"], dir);
  assert.equal(res.status, 0, res.all);
  assert.equal(existsSync(docPath(dir)), true);
});

test("뿌리는 스크립트 위치가 아니라 cwd 의 저장소 뿌리다 — 하위 폴더에서 불러도 같은 문서", () => {
  const dir = sample();
  backlog(["init"], dir);

  const nested = join(dir, "packages", "web", "src");
  mkdirSync(nested, { recursive: true });
  const res = backlog(["add", "하위 폴더에서 적기 — 뿌리를 올라가 찾는다"], nested);
  assert.equal(res.status, 0, res.all);

  // 하위 폴더에 두 번째 문서가 생기지 않고, 저장소 뿌리의 문서에 줄이 들어간다.
  assert.equal(existsSync(join(nested, "docs", "BACKLOG.md")), false);
  assert.match(doc(dir), /하위 폴더에서 적기/);
  // 맥락은 브랜치에서 온다(feature/demo → demo 작업 중 들어옴).
  assert.match(doc(dir), /demo 작업 중 들어옴/);
});

// ── ② 골격 위에서 도는 전체 흐름 ──────────────────────────────────────────

test("init 골격에 add → list 에 나온다 (파서가 골격을 그대로 읽는다)", () => {
  const dir = sample();
  backlog(["init"], dir);

  const added = backlog(["add", "다크 모드 — 야간에 눈이 아프다"], dir);
  assert.equal(added.status, 0, added.all);

  const listed = backlog(["list", "--section", "대기"], dir);
  assert.equal(listed.status, 0, listed.all);
  assert.match(listed.out, /다크 모드/);

  // 자리표시자는 줄이 들어오면 사라진다 — 골격의 `- (없음)` 을 파서가 찾았다는 증거다.
  const pendingBlock = doc(dir).split(/^## 사람 몫/m)[0];
  assert.doesNotMatch(pendingBlock, /^- \(없음\)$/m);

  const json = JSON.parse(backlog(["list", "--json", "--section", "대기"], dir).out);
  assert.equal(json.pending.length, 1);
  assert.equal(json.pending[0].title, "다크 모드");
  assert.equal(json.pending[0].summary, "야간에 눈이 아프다");
  assert.equal(json.pending[0].context, "demo 작업 중 들어옴");
});

test("mine add/done · done <n> — 골격의 「사람 몫」 절을 새로 만들지 않고 그대로 쓴다", () => {
  const dir = sample();
  backlog(["init"], dir);

  const mine = backlog(["mine", "add", "인증서 발급 — 개발자 계정에서", "--source", "2026-09-08 대화"], dir);
  assert.equal(mine.status, 0, mine.all);
  assert.doesNotMatch(mine.out, /절을 새로 만들었습니다/, "골격에 이미 있는 절을 다시 만들면 안 된다");
  assert.equal(doc(dir).match(/^## 사람 몫/gm).length, 1, "「사람 몫」 절이 둘이 되면 안 된다");

  const listed = JSON.parse(backlog(["mine", "list", "--json"], dir).out);
  assert.equal(listed.mine.length, 1);
  assert.equal(listed.mine[0].source, "2026-09-08 대화");

  // 지우면 자리표시자가 되살아난다.
  const done = backlog(["mine", "done", "1"], dir);
  assert.equal(done.status, 0, done.all);
  assert.match(done.out, /지웠습니다/);
  assert.equal(JSON.parse(backlog(["mine", "list", "--json"], dir).out).mine.length, 0);
  assert.match(doc(dir).split(/^<!--/m)[0], /^- \(없음\)$/m);

  // 대기 줄도 같은 규칙으로 지운다(번호 1부터).
  backlog(["add", "지울 줄 — 곧 머지된다"], dir);
  const donePending = backlog(["done", "1"], dir);
  assert.equal(donePending.status, 0, donePending.all);
  assert.equal(JSON.parse(backlog(["list", "--json", "--section", "대기"], dir).out).pending.length, 0);
});

test("add --long + progress + done --long — 장기 절은 첫 --long 이 만들고 번호는 1부터", () => {
  const dir = sample();
  backlog(["init"], dir);

  const long = backlog(
    ["add", "--long", "배포 패키징", "--state", "아직 없음.", "--next", "① 서명 ② 자동 업데이트", "--open", "코드 서명 인증서", "--done", "① 서명", "--todo", "② 자동 업데이트"],
    dir,
  );
  assert.equal(long.status, 0, long.all);
  assert.match(long.out, /B-1/);
  assert.match(doc(dir), /^## B-1\. 배포 패키징 \(\d{4}-\d{2}-\d{2}\)$/m);

  let section = JSON.parse(backlog(["list", "--json", "--section", "장기"], dir).out).longTerm[0];
  assert.equal(section.number, 1);
  assert.deepEqual(
    section.progress.map((p) => [p.done, p.text]),
    [
      [true, "① 서명"],
      [false, "② 자동 업데이트"],
    ],
    "친 순서 그대로 심어야 한다",
  );

  // --check 는 본문 일부로 고른다.
  const checked = backlog(["progress", "B-1", "--check", "② 자동"], dir);
  assert.equal(checked.status, 0, checked.all);
  section = JSON.parse(backlog(["list", "--json", "--section", "장기"], dir).out).longTerm[0];
  assert.equal(section.progress.every((p) => p.done), true);
  // 전부 완료면 ⚠ 가 붙는다 — ADR 문서가 없어도 이 검사는 산다.
  assert.ok(section.warnings.some((w) => w.includes("진행 전부 완료")), section.warnings.join(" / "));

  // 항목 더하기 + 없는 번호 거절.
  backlog(["progress", "B-1", "--todo", "③ 공증"], dir);
  section = JSON.parse(backlog(["list", "--json", "--section", "장기"], dir).out).longTerm[0];
  assert.equal(section.progress.length, 3);

  // 진행이 전부 완료가 아니면 절 삭제를 거절한다.
  const refused = backlog(["done", "--long", "B-1"], dir);
  assert.notEqual(refused.status, 0);
  assert.match(refused.all, /3개 중 2개만 완료/);
  assert.match(doc(dir), /^## B-1\./m, "거절했으면 문서는 그대로여야 한다");

  backlog(["progress", "B-1", "--check", "③ 공증"], dir);
  const removed = backlog(["done", "--long", "B-1"], dir);
  assert.equal(removed.status, 0, removed.all);
  assert.doesNotMatch(doc(dir), /^## B-1\./m);
  assert.match(removed.out, /다시 매기지 않습니다/);
});

// ── ③ 없는 문서 — CHANGELOG · ADR · package.json ──────────────────────────

test("CHANGELOG·ADR 이 없는 저장소: list 가 죽지 않고 ADR 검사만 건너뛴다", () => {
  const dir = sample();
  backlog(["init"], dir);
  assert.equal(existsSync(join(dir, "docs", "ADR.md")), false);
  assert.equal(existsSync(join(dir, "docs", "CHANGELOG.md")), false);

  // ADR 을 가리키는 줄과, 30일을 넘긴 줄.
  backlog(["add", "결정을 바꾼다 — ADR-001 을 뒤집는다", "--context", "테스트"], dir);
  backlog(["add", "묵은 줄 — 오래 밀렸다", "--date", "2020-01-01", "--context", "테스트"], dir);

  const res = backlog(["list", "--json", "--section", "대기"], dir);
  assert.equal(res.status, 0, res.all);
  const [citing, stale] = JSON.parse(res.out).pending;

  // ADR 문서가 없으면 그 번호는 "있는 ADR"이 아니다 — ⚠ 를 지어내지 않는다.
  assert.deepEqual(citing.adrs, [1], "인용 자체는 읽는다");
  assert.deepEqual(citing.warnings, [], "ADR 문서가 없으면 ADR ⚠ 는 뜨지 않는다");

  // 백로그 자체 검사(30일 초과)는 그대로 산다.
  assert.ok(stale.warnings.some((w) => w.includes("30일 초과")), stale.warnings.join(" / "));

  // 표 출력도 죽지 않는다.
  const text = backlog(["list"], dir);
  assert.equal(text.status, 0, text.all);
  assert.match(text.out, /정직성 점검/);
});

test("ADR 문서가 있으면 같은 인용에 ⚠ 가 붙는다 — 건너뛰는 것이 '검사 없음'이 아님을 못 박는다", () => {
  const dir = sample();
  backlog(["init"], dir);
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "ADR.md"), "# ADR\n\n### ADR-001: 첫 결정\n결정 / 이유 / 트레이드오프\n");

  backlog(["add", "결정을 바꾼다 — ADR-001 을 뒤집는다", "--context", "테스트"], dir);
  const [item] = JSON.parse(backlog(["list", "--json", "--section", "대기"], dir).out).pending;
  // 변경 기록이 없어 그 ADR 이 언제 나왔는지 알 수 없다 → "확인" ⚠.
  assert.ok(item.warnings.some((w) => w.includes("변경 기록에 없음")), item.warnings.join(" / "));
});

test("standup: package.json 도 CHANGELOG 도 ADR 도 없는 저장소에서 죽지 않는다", () => {
  const dir = sample();
  backlog(["init"], dir);
  backlog(["add", "무언가 — 밀린 것"], dir);
  writeFileSync(join(dir, "note.txt"), "미커밋 변경 하나\n"); // hasWork = true

  const res = standup([], dir);
  assert.equal(res.status, 0, res.all);
  assert.match(res.out, /^# 스탠드업 — \d{4}-\d{2}-\d{2}/m);
  assert.match(res.out, /## 지금 브랜치/);
  assert.match(res.out, /## 앞으로 할 것/);
  assert.match(res.out, /무언가/);

  // 없는 규칙을 ⚠ 로 둔갑시키지 않는다.
  assert.doesNotMatch(res.out, /새 ADR 없음/);
  assert.doesNotMatch(res.out, /버전 안 올림/);
  assert.doesNotMatch(res.out, /버전 모름/);
  assert.doesNotMatch(res.out, /변경 기록 맨 위 없음/);
  // 변경 기록이 없다는 사실은 한 줄로 말한다.
  assert.match(res.out, /## 완료된 것\n\n변경 기록 없음/);

  const json = JSON.parse(standup(["--json"], dir).out);
  assert.equal(json.branch.hasPackage, false);
  assert.equal(json.branch.hasChangelog, false);
  assert.equal(json.branch.hasAdrDoc, false);
  assert.deepEqual(json.branch.warnings, []);
});

test("standup: 규칙 문서가 있으면 ⚠ 가 살아난다", () => {
  const dir = sample();
  backlog(["init"], dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "s", version: "1.0.0" }, null, 2));
  writeFileSync(join(dir, "docs", "ADR.md"), "# ADR\n\n### ADR-001: 첫 결정\n");
  writeFileSync(join(dir, "docs", "CHANGELOG.md"), "# 변경 기록\n\n## v0.9.0 — 2026-01-01\n- 옛 릴리즈 (ADR-001)\n");

  const res = standup([], dir);
  assert.equal(res.status, 0, res.all);
  assert.match(res.out, /버전 v1\.0\.0/);
  assert.match(res.out, /변경 기록 맨 위 v0\.9\.0/);
  assert.match(res.out, /이 브랜치의 새 ADR/);
  assert.match(res.out, /⚠ 변경 기록 맨 위 v0\.9\.0 ≠ package\.json v1\.0\.0/);
});

// ── ④ BACKLOG.md 가 없는 저장소 ───────────────────────────────────────────

test("BACKLOG.md 가 없으면 list 는 안내 한 줄 + 종료 0", () => {
  for (const git of [true, false]) {
    const dir = sample({ git });
    const res = backlog(["list"], dir);
    assert.equal(res.status, 0, `git=${git}: ${res.all}`);
    assert.match(res.out, /docs\/BACKLOG\.md가 없습니다/);
    assert.match(res.out, /init/);
    assert.equal(res.out.trim().split("\n").length, 1, "안내는 한 줄이다");

    const json = JSON.parse(backlog(["list", "--json"], dir).out);
    assert.deepEqual(json.pending, []);
    assert.match(json.note, /없습니다/);
  }
});

test("BACKLOG.md 가 없으면 standup 은 그 블록만 안내 한 줄이고 나머지는 나온다 + 종료 0", () => {
  const dir = sample();
  const res = standup([], dir);
  assert.equal(res.status, 0, res.all);
  assert.match(res.out, /## 앞으로 할 것\n\n.*docs\/BACKLOG\.md가 없습니다/);
  // 진단이 아니라 현황이다 — 브랜치와 완료된 것은 그대로 나온다.
  assert.match(res.out, /## 지금 브랜치/);
  assert.match(res.out, /## 완료된 것/);
  assert.match(res.out, /정직성 점검/);
});

test("적는 명령은 문서가 없으면 실패하되 init 을 가리킨다", () => {
  const dir = sample();
  const res = backlog(["add", "적을 곳이 없다 — 실패해야 한다"], dir);
  assert.notEqual(res.status, 0, "적을 곳이 없는데 성공하면 안 된다");
  assert.match(res.all, /docs\/BACKLOG\.md가 없습니다/);
  assert.match(res.all, /init/);
});

// ── 공통 손잡이 ───────────────────────────────────────────────────────────

test("--root 는 cwd 보다 앞선다", () => {
  const target = sample();
  backlog(["init"], target);
  const elsewhere = sample({ git: true, branch: "feature/other" });

  const res = backlog(["add", "다른 곳에서 — --root 로 넘긴다", "--root", target, "--context", "테스트"], elsewhere);
  assert.equal(res.status, 0, res.all);
  assert.match(doc(target), /다른 곳에서/);
  assert.equal(existsSync(docPath(elsewhere)), false, "cwd 쪽 저장소는 건드리지 않는다");
});

test("--help 는 스크립트 자신의 절대 경로를 알려 준다 (pnpm 별칭이 아니라)", () => {
  const dir = sample();
  const res = backlog(["--help"], dir);
  assert.equal(res.status, 0, res.all);
  assert.match(res.out, /backlog\.mjs" init/);
  assert.doesNotMatch(res.out, /pnpm/);

  const usage = standup(["--help"], dir);
  assert.equal(usage.status, 0, usage.all);
  assert.doesNotMatch(usage.out, /pnpm/);
});

// ── 「작성」 — 어느 도구가 적었나 (ADR-121) ────────────────────────────────

/**
 * 감지 규칙의 표. `detectVia(env, explicit)`는 **순수 함수**라 여기서 곧장 부른다 —
 * 프로세스를 띄우지 않으므로 이 기계에 없는 도구(codex·gemini)의 갈래도 검사할 수 있다.
 *
 * `CODEX_*`·`GEMINI_CLI` 갈래는 **실측으로 확인하지 못했다** — 알려진 접두사를 따랐을
 * 뿐이다. 그래서 `--via`가 언제나 위에 있고, 이 표는 "우리가 무엇을 짐작하기로
 * 했는가"의 기록이지 "그 도구가 반드시 이 변수를 심는다"의 증거가 아니다.
 */
const VIA_CASES = [
  ["CLAUDECODE 하나면 claude", { CLAUDECODE: "1" }, undefined, "claude"],
  ["CLAUDE_CODE_* 접두만 있어도 claude", { CLAUDE_CODE_ENTRYPOINT: "cli" }, undefined, "claude"],
  ["CODEX_* 접두면 codex (미검증 갈래)", { CODEX_SANDBOX: "1" }, undefined, "codex"],
  ["GEMINI_CLI면 gemini", { GEMINI_CLI: "1" }, undefined, "gemini"],
  ["아무것도 없으면 기록하지 않는다", {}, undefined, undefined],
  ["관계없는 변수는 짐작에 쓰이지 않는다", { PATH: "/usr/bin", TERM: "xterm" }, undefined, undefined],
  ["빈 값은 없는 것으로 본다", { CLAUDECODE: "" }, undefined, undefined],
  ["--via가 claude 감지를 이긴다", { CLAUDECODE: "1" }, "codex", "codex"],
  ["--via가 아무 감지도 없을 때도 쓰인다", {}, "사람", "사람"],
  ["--via는 소문자로 눕힌다 — 표의 값이 갈리지 않게", {}, "Codex", "codex"],
  ["claude가 codex보다 먼저다 — 둘 다 있으면 claude", { CLAUDECODE: "1", CODEX_SANDBOX: "1" }, undefined, "claude"],
];

for (const [name, env, explicit, expected] of VIA_CASES) {
  test(`detectVia: ${name}`, () => {
    assert.equal(detectVia(env, explicit), expected);
  });
}

test("add: 감지한 도구를 꼬리에 `작성: claude`로 남긴다", () => {
  const dir = sample();
  backlog(["init"], dir);
  const res = backlog(["add", "다크 모드 — 밤에 눈이 아프다", "--date", "2026-09-08"], dir, { CLAUDECODE: "1" });
  assert.equal(res.status, 0, res.all);
  assert.match(doc(dir), /^- \*\*다크 모드\*\* — 밤에 눈이 아프다\. \(2026-09-08, demo 작업 중 들어옴, 작성: claude\)$/m);
});

test("add: 감지할 것이 없으면 꼬리에 작성을 적지 않는다 — 빈 칸이 정직하다", () => {
  const dir = sample();
  backlog(["init"], dir);
  assert.equal(backlog(["add", "다크 모드", "--date", "2026-09-08"], dir).status, 0);
  assert.match(doc(dir), /^- \*\*다크 모드\*\* \(2026-09-08, demo 작업 중 들어옴\)$/m);
  assert.doesNotMatch(doc(dir), /작성:/);
});

test("mine add·add --long 도 작성을 남긴다 — 장기는 미결 질문 뒤·진행 앞", () => {
  const dir = sample();
  backlog(["init"], dir);

  // 출처에 쉼표가 들어도 작성만 뒤에서 떼어낸다.
  const mine = backlog(["mine", "add", "Lego 켜기 — 첫 승인", "--source", "ADR-082, 2026-09-02 대화", "--date", "2026-09-08"], dir, { CODEX_SANDBOX: "1" });
  assert.equal(mine.status, 0, mine.all);
  assert.match(doc(dir), /^- \*\*Lego 켜기\*\* — 첫 승인\. \(2026-09-08, ADR-082, 2026-09-02 대화, 작성: codex\)$/m);

  const long = backlog(["add", "--long", "새 방향", "--state", "하나", "--next", "둘", "--open", "셋", "--todo", "첫 갈래", "--date", "2026-09-08"], dir, { CLAUDECODE: "1" });
  assert.equal(long.status, 0, long.all);
  assert.match(doc(dir), /- \*\*미결 질문\*\*: 셋\n- \*\*작성\*\*: claude\n- \*\*진행\*\*:\n {2}- \[ \] 첫 갈래/);

  // 감지가 없으면 칸 자체가 없다.
  const bare = backlog(["add", "--long", "빈 방향", "--state", "하나", "--next", "둘", "--open", "셋"], dir);
  assert.equal(bare.status, 0, bare.all);
  const bareSection = doc(dir).split(/^## B-2\./m)[1];
  assert.doesNotMatch(bareSection, /- \*\*작성\*\*/);
});

test("progress·done 은 작성 기록을 건드리지 않는다", () => {
  const dir = sample();
  backlog(["init"], dir);
  backlog(["add", "--long", "새 방향", "--state", "하나", "--next", "둘", "--open", "셋", "--todo", "첫 갈래"], dir, { CLAUDECODE: "1" });
  backlog(["add", "남을 것", "--date", "2026-09-08"], dir, { CODEX_SANDBOX: "1" });
  backlog(["add", "지울 것", "--date", "2026-09-08"], dir, { CLAUDECODE: "1" });

  // 진행을 갱신해도 작성 칸은 제자리다 — 줄을 **처음 적은** 도구가 남는다.
  assert.equal(backlog(["progress", "B-1", "--check", "첫 갈래"], dir).status, 0);
  assert.match(doc(dir), /- \*\*작성\*\*: claude\n- \*\*진행\*\*:\n {2}- \[x\] 첫 갈래/);

  // 옆 줄을 지워도 남는 줄의 작성은 그대로다.
  assert.equal(backlog(["done", "지울 것"], dir).status, 0);
  assert.match(doc(dir), /- \*\*남을 것\*\* \(2026-09-08, demo 작업 중 들어옴, 작성: codex\)/);
});

test("표 셋에 「작성」 열이 생기고 --json 에도 via 가 실린다", () => {
  const dir = sample();
  backlog(["init"], dir);
  backlog(["add", "대기 줄"], dir, { CLAUDECODE: "1" });
  backlog(["mine", "add", "사람 줄", "--source", "대화"], dir, { CODEX_SANDBOX: "1" });
  backlog(["add", "--long", "장기 절", "--state", "하나", "--next", "둘", "--open", "셋"], dir, { GEMINI_CLI: "1" });
  // 작성이 없는 옛 절 하나 — 빈 칸이 정상이자 다수다.
  backlog(["add", "--long", "옛 절", "--state", "하나", "--next", "둘", "--open", "셋"], dir);

  const { out, status } = backlog(["list"], dir);
  assert.equal(status, 0, out);
  assert.match(out, /\| # \| 제목 .*\| 맥락 +\| 작성 +\| 경과일 \| ⚠ +\|/);
  assert.match(out, /\| # \| 할 것 .*\| 출처 *\| 작성 +\| 경과일 \| ⚠ +\|/);
  assert.match(out, /\| 번호 \| 제목 .*\| 의존 +\| 작성 +\| 관련 ADR \| ⚠ +\|/);

  const json = JSON.parse(backlog(["list", "--json"], dir).out);
  assert.equal(json.pending.at(-1).via, "claude");
  assert.equal(json.mine.at(-1).via, "codex");
  assert.equal(json.longTerm[0].via, "gemini");
  assert.equal(json.longTerm[1].via, undefined, "작성 칸이 없는 절은 undefined 여야 한다");

  // 스탠드업도 같은 렌더러를 쓴다 — 열이 따라온다.
  const s = standup([], dir);
  assert.equal(s.status, 0, s.all);
  assert.match(s.out, /\| 작성 +\|/);
});

// ── --via 는 꼬리를 깨뜨릴 수 없다 ────────────────────────────────────────

const DIRTY_VIA = ["claude), 작성: pwned", "clau,de", "claude(x)", "(claude)"];

for (const value of DIRTY_VIA) {
  test(`--via ${JSON.stringify(value)}: 거절하고 문서를 한 바이트도 바꾸지 않는다`, () => {
    const dir = sample();
    backlog(["init"], dir);
    const before = doc(dir);
    const res = backlog(["add", "다크 모드", "--date", "2026-09-08", "--via", value], dir);
    assert.equal(res.status, 1, res.all);
    assert.match(res.err, /--via 값에는 괄호와 쉼표를 쓸 수 없습니다/);
    assert.equal(doc(dir), before, "실패한 명령이 문서를 바꿨다");
  });
}

test("mine add·add --long 의 --via 도 같은 규칙으로 거절한다", () => {
  const dir = sample();
  backlog(["init"], dir);
  const before = doc(dir);
  assert.equal(backlog(["mine", "add", "Lego 켜기", "--source", "대화", "--via", "claude), 작성: pwned"], dir).status, 1);
  assert.equal(backlog(["add", "--long", "새 방향", "--state", "하나", "--next", "둘", "--open", "셋", "--via", "a,b"], dir).status, 1);
  assert.equal(doc(dir), before, "실패한 명령이 문서를 바꿨다");
});

/**
 * CLI를 거치지 않고 렌더러를 직접 부르는 길이 남아 있으므로 **마지막 방어선**도
 * 잠근다 — 더러운 via 가 들어와도 나온 줄은 다시 파싱 가능해야 한다.
 */
test("렌더러에 더러운 via 를 직접 넣어도 파스 가능한 한 줄이 나온다", () => {
  const line = renderPendingLine({ title: "할 것", date: "2026-09-08", context: "맥락", via: "claude), 작성: pwned" });
  const parsed = parsePendingLine(line);
  assert.equal(parsed.date, "2026-09-08");
  assert.equal(parsed.context, "맥락");
  assert.equal(parsed.via, "claude 작성: pwned");
  assert.equal(renderPendingLine(parsed), line, "다시 그려도 같은 줄이어야 한다");
});

test("장기 절의 작성 칸도 더러운 via 를 정리해 한 줄로 적는다", () => {
  const section = renderLongSection({ number: 9, title: "방향", date: "2026-09-08", state: "하나", next: "둘", open: "셋", via: "codex\n- **진행**:" });
  const viaLines = section.split("\n").filter((line) => line.startsWith("- **작성**"));
  assert.equal(viaLines.length, 1);
  assert.equal(viaLines[0], "- **작성**: codex - 진행:", "굵은 글씨 표시까지 떨어져 칸이 하나로 남아야 한다");
});

test("sanitizeVia: 괄호·쉼표를 떼고 빈 값은 undefined", () => {
  assert.equal(sanitizeVia("claude"), "claude");
  assert.equal(sanitizeVia("claude), 작성: pwned"), "claude 작성: pwned");
  assert.equal(sanitizeVia("(,)"), undefined);
  assert.equal(sanitizeVia(undefined), undefined);
});

// ── 꼬리 괄호: 맥락 안의 괄호와 옛 줄 ─────────────────────────────────────

/**
 * 맥락에 괄호가 든 줄. 한국어에서 조금도 드물지 않은데(`회의(주간) 중 들어옴`,
 * `실측(-42dB)`), 괄호를 하나도 허용하지 않던 옛 정규식은 매치가 통째로 실패해
 * 날짜·맥락·작성이 **에러 없이 영구히** 요약으로 흡수됐다.
 */
const NESTED_PAREN_LINES = [
  ["맥락에 괄호 + 작성", "- **할 것** — 설명. (2026-09-08, 회의(주간) 중 들어옴, 작성: claude)", "2026-09-08", "회의(주간) 중 들어옴", "claude"],
  ["맥락에 괄호, 작성 없음", "- **할 것** — 설명. (2026-09-08, 회의(주간) 중 들어옴)", "2026-09-08", "회의(주간) 중 들어옴", undefined],
  ["맥락이 괄호로 끝나고 작성이 붙는다", "- **할 것** (2026-09-08, 실측(-42dB), 작성: codex)", "2026-09-08", "실측(-42dB)", "codex"],
  ["맥락에 쉼표 + 작성 — 작성만 뒤에서 뗀다", "- **할 것** — 설명. (2026-09-08, ADR-082·083, 2026-09-02 대화, 작성: claude)", "2026-09-08", "ADR-082·083, 2026-09-02 대화", "claude"],
  ["맥락 없이 작성만", "- **할 것** (2026-09-08, 작성: codex)", "2026-09-08", undefined, "codex"],
];

for (const [name, line, date, context, via] of NESTED_PAREN_LINES) {
  test(`꼬리 괄호: ${name} — 라운드트립에서 셋이 그대로다`, () => {
    const parsed = parsePendingLine(line);
    assert.equal(parsed.date, date);
    assert.equal(parsed.context, context);
    assert.equal(parsed.via, via);
    assert.equal(renderPendingLine(parsed), line, "다시 그려도 같은 줄이어야 한다");
  });
}

test("요약이 괄호로 끝나거나 날짜 괄호를 품어도 진짜 꼬리가 이긴다", () => {
  // 날짜로 시작하지 않는 꼬리 괄호는 요약의 일부다.
  const plain = parsePendingLine("- **할 것** — 게인 보정(웹오디오) 검토.");
  assert.equal(plain.date, undefined);
  assert.equal(plain.via, undefined);
  assert.match(plain.summary, /웹오디오/);

  // 요약이 날짜 괄호를 품어도 **가장 오른쪽**이 진짜 꼬리다.
  const tricky = parsePendingLine("- **할 것** — (2026-01-01 회고) 후속. (2026-09-08, 맥락, 작성: claude)");
  assert.equal(tricky.date, "2026-09-08");
  assert.equal(tricky.context, "맥락");
  assert.equal(tricky.via, "claude");
  assert.match(tricky.summary, /2026-01-01 회고/);
});

test("옛 줄(작성 없음)이 무수정으로 읽히고 왕복해도 손상되지 않는다", () => {
  const dir = sample();
  backlog(["init"], dir);
  // 이 기능이 생기기 전 모양 그대로 손으로 심는다.
  const old = [
    "- **녹음 전사** — 정지 후 백그라운드 전사. (2026-09-07, recording-sheet 작업 중 들어옴)",
    "- **맥락 없는 옛 줄** (2026-08-01)",
    "- **꼬리가 아예 없는 줄** — 형식 이전의 것",
  ];
  const text = doc(dir).replace(/^- \(없음\)$/m, old.join("\n"));
  writeFileSync(docPath(dir), text);

  const json = JSON.parse(backlog(["list", "--json", "--section", "대기"], dir).out);
  assert.equal(json.pending.length, 3);
  for (const item of json.pending) assert.equal(item.via, undefined, `옛 줄에 작성이 있을 수 없다: ${item.title}`);
  assert.equal(json.pending[0].date, "2026-09-07");
  assert.equal(json.pending[0].context, "recording-sheet 작업 중 들어옴");
  assert.equal(json.pending[1].date, "2026-08-01");
  assert.equal(json.pending[1].context, undefined);
  assert.equal(json.pending[2].date, undefined);

  // 옛 줄 옆에 새 줄을 더해도 옛 줄은 한 글자도 바뀌지 않는다.
  assert.equal(backlog(["add", "새 줄"], dir, { CLAUDECODE: "1" }).status, 0);
  for (const line of old) assert.ok(doc(dir).includes(line), `옛 줄이 바뀌었다: ${line}`);
});

test("괄호가 든 맥락으로 적어도 다시 읽힌다 — add 왕복", () => {
  const dir = sample();
  backlog(["init"], dir);
  const res = backlog(["add", "실측 확인", "--context", "회의(주간) 중 들어옴", "--date", "2026-09-08"], dir, { CLAUDECODE: "1" });
  assert.equal(res.status, 0, res.all);

  const json = JSON.parse(backlog(["list", "--json", "--section", "대기"], dir).out);
  assert.equal(json.pending[0].context, "회의(주간) 중 들어옴");
  assert.equal(json.pending[0].date, "2026-09-08");
  assert.equal(json.pending[0].via, "claude");
});
