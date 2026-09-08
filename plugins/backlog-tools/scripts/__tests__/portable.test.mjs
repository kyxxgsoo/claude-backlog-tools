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

/** 스크립트 하나를 그 디렉터리에서 돌린다. **`--root`를 주지 않는 것**이 기본이다 — cwd로 뿌리를 찾는지 보려고. */
function run(script, args, cwd) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    // 부모의 NODE_OPTIONS(로더 주입 등)가 자식의 표준 출력을 더럽히지 않게 지운다.
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  return { status: res.status, out: res.stdout ?? "", err: res.stderr ?? "", all: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

const backlog = (args, cwd) => run(BACKLOG, args, cwd);
const standup = (args, cwd) => run(STANDUP, args, cwd);
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
