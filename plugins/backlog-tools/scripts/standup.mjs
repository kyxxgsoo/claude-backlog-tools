#!/usr/bin/env node
/**
 * 스탠드업 — **지금 어디에 서 있나**를 한 화면으로 (ADR-093 ① — 원본은 Karvis
 * 저장소의 `scripts/standup.mjs`).
 *
 * 스탠드업 회의의 세 질문(한 것 / 할 것 / 막힌 것)을 이 레포에 맞춰 넷으로 나눈다:
 *
 *   ## 지금 브랜치   브랜치·`origin` 대비 앞뒤·미커밋·기준 대비 커밋·버전·변경 기록
 *                    맨 위·이 브랜치의 새 ADR, 그리고 ⚠ 셋(새 ADR 없음 / 버전 안 올림 /
 *                    변경 기록 맨 위가 package.json과 다름).
 *   ## 사람 몫       에이전트가 아니라 **사람만 할 수 있는 일**(`backlog.mjs mine`).
 *   ## 앞으로 할 것  백로그 그대로(`backlog.mjs list`의 표와 진행 상황 블록).
 *   ## 완료된 것     변경 기록에서 최근 N일(기본 7)의 릴리즈.
 *
 * **새 데이터는 하나도 만들지 않는다** — 「사람 몫」만 새 정본이고(그것도
 * `docs/BACKLOG.md`의 절 하나) 나머지는 이미 있는 정본을 읽는다: 앞으로 할 것은
 * 백로그(ADR-091·092), 완료된 것은 변경 기록(ADR-085). 같은 사실의 기록이 둘이면
 * 어느 쪽이 맞는지 아무도 모른다.
 *
 * **게이트를 돌리지 않고 네트워크도 쓰지 않는다** — 스탠드업은 1초 안에 떠야 한다.
 * 테스트·lint는 저장소의 명령이 따로 있고, `git fetch`는 부르지 않아 "앞/뒤"는
 * 마지막으로 받아 온 시점 기준이다(`lib/git-status.mjs`).
 *
 * **없는 문서에는 조용하다** — 다른 저장소에는 `docs/CHANGELOG.md`·`docs/ADR.md`·
 * 루트 `package.json`이 없을 수 있다. 없는 것에 대해서는 ⚠를 띄우지 않고 **비교를
 * 하지 않았다**고 말하거나 그 줄을 통째로 뺀다 — "안 썼다"와 "그런 규칙이 없다"는
 * 다르고, 뒤엣것을 경고로 둔갑시키면 ⚠ 전체를 못 믿게 된다.
 *
 * 뿌리는 **`cwd`의 git 저장소 뿌리**다(`--root`가 앞선다).
 *
 * Usage:  node standup.mjs [--json] [--days N] [--no-backlog] [--root <dir>]
 * 의존성 없음.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { collect, missingBacklogNote, renderHonestyLine, renderLongTable, renderMineTable, renderPendingTable, renderProgressBlocks } from "./backlog.mjs";
import { addedAdrNumbers, adrTag } from "./lib/adr-entries.mjs";
import { adrMentions, daysBetween, renderTable, todayInSeoul, truncate } from "./lib/backlog-doc.mjs";
import { CHANGELOG_HEADING, changelogSections } from "./lib/changelog.mjs";
import { SHOWN_PATHS, aheadBehindOrigin, branchSlug, commitsAheadOfBase, currentBranch, git, repoRoot, tagExists, uncommitted } from "./lib/git-status.mjs";
import { ROOT_PACKAGE, baseVersion, resolveBase } from "./lib/version-base.mjs";

const BACKLOG_PATH = join("docs", "BACKLOG.md");
const ADR_PATH = join("docs", "ADR.md");
const CHANGELOG_PATH = join("docs", "CHANGELOG.md");
const MAIN = "main";
const DEFAULT_DAYS = 7;

const USAGE = `사용법:
  node standup.mjs [--json] [--days N] [--no-backlog] [--root <dir>]
    --days N       「완료된 것」이 보는 창(기본 ${DEFAULT_DAYS}일)
    --no-backlog   「앞으로 할 것」을 빼고 브랜치·사람 몫·완료된 것만
    --json         { date, branch, mine, backlog, releases, warnings, warningCount, flaggedCount }`;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { days: DEFAULT_DAYS, backlog: true, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--no-backlog") options.backlog = false;
    else if (arg === "--days") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 0) fail(`--days 는 0 이상의 정수여야 합니다: ${JSON.stringify(argv[i + 1])}\n\n${USAGE}`);
      options.days = value;
      i += 1;
    } else if (arg === "--root") {
      const value = argv[i + 1];
      if (!value) fail(`--root 뒤에 디렉터리가 필요합니다.\n\n${USAGE}`);
      options.root = resolve(value);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else fail(`알 수 없는 옵션: ${arg}\n\n${USAGE}`);
  }
  return options;
}

/** 파일 하나를 읽되 없으면 빈 문자열 — 스탠드업은 문서 하나 때문에 화면 전체를 못 내면 안 된다. */
function readOr(root, path) {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return "";
  }
}

// ── ① 지금 브랜치 ───────────────────────────────────────────────────────────

/**
 * 브랜치의 상태와 ⚠.
 *
 * ⚠ 둘(`새 ADR 없음`·`버전 안 올림`)은 **`main`이 아니고 변경이 있을 때만** 본다 —
 * `main`에 서 있는 것은 위반이 아니고, 갓 만든 빈 브랜치도 아직 아무것도 안 했을
 * 뿐이다. 브랜치를 만들고 파일 하나를 고치는 순간 둘이 함께 뜨는 것이 의도다:
 * 순서는 **먼저 ADR, 그다음 코드**다(저장소에 그 규칙이 있을 때).
 *
 * **기준 브랜치는 게이트와 같은 것을 쓴다**(`resolveBase` — `origin/main`이 있으면
 * 그것, 없으면 `main`; ADR-093 ⑤). 로컬 `main`에 박아 두면 머지된 것을 아직 받아
 * 오지 않은 트리에서 스탠드업과 저장소의 ADR·버전 게이트가 **다른 답**을
 * 낸다 — 미리 알려 주는 것이 값어치인데 그 값이 틀리면 없느니만 못하다.
 *
 * 기준이 아예 없으면(`main`도 `origin/main`도 없는 저장소) ADR·버전 비교를 **하지
 * 않는다** — 견줄 것이 없는데 ⚠를 띄우면 "안 썼다"가 아니라 "모른다"를 경고로
 * 둔갑시키는 것이다.
 */
function branchStatus(root, pending) {
  const branch = currentBranch(root);
  const onMain = branch === MAIN;
  // 분리된 HEAD는 브랜치가 아니다 — 태그·과거 커밋을 잠깐 들여다보는 상태이고,
  // 거기서 "ADR을 써라·버전을 올려라"는 할 일이 아니다.
  const detached = branch === "HEAD";
  const headSha = detached ? git(["rev-parse", "--short", "HEAD"], root) : undefined;
  const warnings = [];

  const base = resolveBase(undefined, { cwd: root, fail: () => undefined });
  const compares = Boolean(base) && !onMain && !detached;

  // 저장소마다 **있는 규칙이 다르다** — ADR 문서도 변경 기록도 루트 package.json도
  // 없을 수 있다. 없는 것은 비교 대상에서 빼고 화면에서도 뺀다.
  const hasAdrDoc = existsSync(join(root, ADR_PATH));
  const hasChangelog = existsSync(join(root, CHANGELOG_PATH));
  const hasPackage = existsSync(join(root, ROOT_PACKAGE));

  const remote = aheadBehindOrigin(branch, root);
  const changes = uncommitted(root);
  const aheadOfBase = base ? commitsAheadOfBase(branch, root, base) : undefined;

  let headVersion;
  try {
    headVersion = JSON.parse(readOr(root, ROOT_PACKAGE) || "{}").version;
  } catch {
    headVersion = undefined; // 읽을 수 없는 package.json 하나가 화면 전체를 막지 않는다
  }
  let baseVersionText;
  if (compares && hasPackage) {
    try {
      baseVersionText = baseVersion(base, { cwd: root }).version.text;
    } catch {
      baseVersionText = undefined; // 기준 버전을 못 읽어도 나머지 셋은 나와야 한다
    }
  }

  const changelogTop = changelogSections(readOr(root, CHANGELOG_PATH))[0];
  const changelogVersion = changelogTop?.version;

  // 새 ADR은 기준의 문서와 **작업 트리**의 문서를 견준다 — 커밋 전에도 보여야
  // 스탠드업이 "ADR을 아직 안 썼다"를 미리 말할 수 있다(check-adr와 같은 판단).
  const headAdr = readOr(root, ADR_PATH);
  let newAdrs = [];
  if (compares && hasAdrDoc) {
    const baseAdr = git(["show", `${base}:${ADR_PATH.replace(/\\/g, "/")}`], root) ?? "";
    newAdrs = addedAdrNumbers(baseAdr, headAdr);
  }

  // "변경이 있다"는 커밋 안 한 것 **또는** 기준 위에 쌓은 커밋이다. 둘 중 하나면
  // 이 브랜치는 이미 무언가를 주장하고 있고, 그러면 ADR과 버전이 따라와야 한다.
  const hasWork = changes.count > 0 || (aheadOfBase ?? 0) > 0;
  if (compares && hasWork) {
    // ADR 문서가 **없는** 저장소에는 "새 ADR 없음"이 아니라 지킬 규칙이 없다.
    if (hasAdrDoc && newAdrs.length === 0) warnings.push("⚠ 새 ADR 없음 — 매 PR에 새 ADR 한 건 (저장소의 ADR 규칙)");
    if (baseVersionText && headVersion === baseVersionText) warnings.push(`⚠ 버전 안 올림 — ${base}과 같은 v${headVersion} (저장소의 버전 규칙)`);
  }
  // 이 ⚠는 브랜치와 무관하다 — 기준 브랜치에서도 둘이 어긋나면 릴리즈가 틀린 것을 가리킨다.
  if (headVersion && changelogVersion && headVersion !== changelogVersion) {
    warnings.push(`⚠ 변경 기록 맨 위 v${changelogVersion} ≠ ${ROOT_PACKAGE} v${headVersion}`);
  }

  // 이 브랜치에서 들어온 대기 줄 — 맥락(`x 작업 중 들어옴`)에 브랜치 slug가 들어 있는 것.
  const slug = branchSlug(branch);
  const fromThisBranch = slug ? pending.filter((item) => (item.context ?? "").includes(slug)) : [];

  return {
    branch,
    onMain,
    detached,
    compares,
    hasAdrDoc,
    hasChangelog,
    hasPackage,
    headSha,
    base,
    remote,
    uncommitted: changes,
    aheadOfBase,
    version: headVersion,
    baseVersion: baseVersionText,
    changelogVersion,
    newAdrs,
    pending: fromThisBranch,
    warnings,
  };
}

function renderRemote(remote) {
  if (remote === undefined) return "원격 없음";
  if (remote.ahead === 0 && remote.behind === 0) return "origin과 같음";
  const parts = [];
  if (remote.ahead > 0) parts.push(`${remote.ahead}앞`);
  if (remote.behind > 0) parts.push(`${remote.behind}뒤`);
  return `origin보다 ${parts.join(" ")}`;
}

function renderBranch(status) {
  const name = status.detached ? `분리된 HEAD (${status.headSha ?? "?"})` : (status.branch ?? "(브랜치 모름)");
  const first = [name, renderRemote(status.remote)];
  if (status.uncommitted.count === 0) first.push("미커밋 없음");
  else {
    const shown = status.uncommitted.paths.join(", ");
    const more = status.uncommitted.count > SHOWN_PATHS ? " 외" : "";
    first.push(`미커밋 ${status.uncommitted.count}개(${shown}${more})`);
  }
  if (!status.onMain && status.base && status.aheadOfBase !== undefined) first.push(`${status.base} 대비 ${status.aheadOfBase}커밋`);

  // 둘째 줄은 **있는 문서에 대해서만** 말한다. 루트 package.json도 변경 기록도 ADR
  // 문서도 없는 저장소에서는 줄 자체가 없다 — 빈칸 셋을 "모름"으로 채우면 화면이
  // 규칙 위반처럼 보이는데, 그런 규칙이 애초에 없는 저장소다.
  const second = [];
  if (status.hasPackage) {
    second.push(status.version ? `버전 v${status.version}${status.baseVersion ? ` (${status.base} v${status.baseVersion})` : ""}` : "버전 모름");
  }
  if (status.hasChangelog) second.push(status.changelogVersion ? `변경 기록 맨 위 v${status.changelogVersion}` : "변경 기록 맨 위 없음");
  // 기준이 없으면 "새 ADR 없음"이 아니라 **비교를 안 했다**고 말한다 — 둘은 다르다.
  if (status.hasAdrDoc) {
    second.push(
      // 비교를 했을 때(기준 브랜치 있음·분리된 HEAD 아님)만 "없음"이라 말한다 —
      // 분리된 HEAD는 브랜치가 아니라 비교 자체를 안 했고, 그 둘은 다르다(리뷰 L).
      status.compares || (status.onMain && status.base)
        ? `이 브랜치의 새 ADR: ${status.newAdrs.length > 0 ? status.newAdrs.map(adrTag).join("·") : "없음"}`
        : status.base
          ? "분리된 HEAD — ADR·버전 비교 생략"
          : "기준 브랜치 없음 — ADR·버전 비교 생략",
    );
  }

  const lines = [`## 지금 브랜치`, first.join(" · ")];
  if (second.length > 0) lines.push(second.join(" · "));
  for (const warning of status.warnings) lines.push(warning);
  for (const item of status.pending) {
    lines.push(`이 브랜치에서 들어온 요구: ${item.summary ? `${item.title} — ${item.summary}` : item.title} (${item.date})`);
  }
  return lines.join("\n");
}

// ── ④ 완료된 것 ─────────────────────────────────────────────────────────────

/**
 * `ADR-001~084` 같은 **범위 표기**.
 *
 * 기준선 항목(v1.0.0)은 ADR 84건을 한 줄로 묶었다 — 그것을 낱개로 펼치면 칸이
 * 넘치고, 첫 번호만 쓰면 `ADR-001`이 되어 **거짓말**이 된다("이 릴리즈는 ADR-001
 * 하나였다"). 적힌 그대로 보이는 것이 유일하게 정직하다.
 */
const ADR_RANGE = /ADR-\d{3}\s*[~–—]\s*(?:ADR-)?\d{3}/;

/**
 * 변경 기록에서 최근 `days`일의 릴리즈.
 *
 * 하나도 없으면 **가장 최근 1건**을 꼬리표와 함께 보인다 — 빈 표는 "아무것도 안
 * 했다"로 읽히는데 사실은 "이번 주는 조용했다"이기 때문이다. 로컬에 태그가 없는
 * 버전에는 `(태그 없음)`이 붙는다: 머지됐지만 릴리즈 안 된 상태를 잡는다.
 */
function releases(root, days, today) {
  // 변경 기록이 **없는** 저장소와 있는데 비어 있는 저장소는 다르다 — 앞엣것은
  // "그런 문서를 쓰지 않는다"이고 뒤엣것은 "아직 릴리즈가 없다"이다.
  const hasChangelog = existsSync(join(root, CHANGELOG_PATH));
  if (!hasChangelog) return { hasChangelog, fallback: false, days, items: [] };
  const sections = changelogSections(readOr(root, CHANGELOG_PATH)).filter((s) => CHANGELOG_HEADING.test(s.heading));
  const recent = sections.filter((s) => {
    const age = daysBetween(s.date, today);
    return age !== undefined && age <= days;
  });
  const fallback = recent.length === 0 && sections.length > 0;
  const shown = fallback ? sections.slice(0, 1) : recent;

  return {
    hasChangelog,
    fallback,
    days,
    items: shown.map((section) => ({
      version: section.version,
      date: section.date,
      line: firstLineOf(section.body),
      adrs: adrMentions(section.body),
      adrRange: ADR_RANGE.exec(String(section.body ?? ""))?.[0],
      tagged: tagExists(`v${section.version}`, root),
    })),
  };
}

/** 항목 본문의 첫 문장 — 사용자 언어 한 줄이 그 릴리즈의 이름이다. */
function firstLineOf(body) {
  const line = String(body ?? "")
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .find((l) => l.length > 0);
  return line ?? "";
}

function renderReleases(result) {
  if (!result.hasChangelog) return `## 완료된 것\n\n변경 기록 없음 (${CHANGELOG_PATH})`;
  if (result.items.length === 0) return "## 완료된 것\n\n(변경 기록에 항목이 없습니다)";
  const rows = result.items.map((item) => [
    `v${item.version}${item.tagged ? "" : " (태그 없음)"}`,
    item.date ?? "?",
    truncate(item.line, 64),
    item.adrRange ?? item.adrs.map(adrTag).join("·"),
  ]);
  const head = result.fallback ? `## 완료된 것 (${result.days}일 안 릴리즈 없음)` : "## 완료된 것";
  return `${head}\n\n${renderTable(["버전", "날짜", "한 줄", "ADR"], rows)}`;
}

// ── 엮기 ────────────────────────────────────────────────────────────────────

function run(options) {
  const root = options.root ?? repoRoot();
  const today = todayInSeoul();

  // 백로그 문서가 없어도 브랜치와 릴리즈는 나와야 한다 — 스탠드업은 진단이 아니라 현황이다.
  const hasBacklog = existsSync(join(root, BACKLOG_PATH));
  const backlogNote = hasBacklog ? undefined : missingBacklogNote(join(root, BACKLOG_PATH));
  const { pending, mine, longTerm } = hasBacklog ? collect(root) : { pending: [], mine: [], longTerm: [] };

  const branch = branchStatus(root, pending);
  const release = releases(root, options.days, today);

  // 정직성 점검의 건수는 **줄 하나에 ⚠가 둘이어도 한 건**으로 센다(`/backlog`와
  // 같은 규칙) — 사람이 세는 것은 "손봐야 할 자리"의 수이기 때문이다. 브랜치 ⚠만
  // 줄이 아니라 ⚠ 자체이므로 그대로 더한다.
  const backlogItems = options.backlog ? [...pending, ...longTerm] : [];
  const flagged = branch.warnings.length + [...mine, ...backlogItems].filter((item) => item.warnings.length > 0).length;
  // `--json`이 쓰는 것은 **문구 전부**다 — 수만 주면 무엇이 걸렸는지 다시 파싱해야 한다.
  const warnings = [...branch.warnings, ...mine.flatMap((item) => item.warnings), ...backlogItems.flatMap((item) => item.warnings)];

  return { root, today, hasBacklog, backlogNote, pending, mine, longTerm, branch, release, flagged, warnings };
}

function renderText(state, options) {
  const blocks = [`# 스탠드업 — ${state.today} (Asia/Seoul)`, renderBranch(state.branch), renderMineTable(state.mine)];

  if (options.backlog && !state.hasBacklog) {
    // 문서가 없는 것은 오류가 아니다 — 다음 한 걸음을 한 줄로 말하고 넘어간다.
    blocks.push(`## 앞으로 할 것\n\n${state.backlogNote}`);
  } else if (options.backlog) {
    const done = state.longTerm.reduce((sum, s) => sum + s.progress.filter((p) => p.done).length, 0);
    const total = state.longTerm.reduce((sum, s) => sum + s.progress.length, 0);
    blocks.push(
      `## 앞으로 할 것\n\n대기 ${state.pending.length}건 · 장기 ${state.longTerm.length}건(진행 ${done}/${total})`,
      renderPendingTable(state.pending),
      renderLongTable(state.longTerm),
      renderProgressBlocks(state.longTerm),
    );
  }

  blocks.push(renderReleases(state.release));
  blocks.push(renderHonestyLine(state.flagged, "브랜치 ⚠는 머지 전에 고치고, 백로그·사람 몫의 삭제는 사람이 정한다"));
  return blocks.join("\n\n");
}

function main(argv) {
  const options = parseArgs(argv);
  const state = run(options);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          date: state.today,
          branch: state.branch,
          mine: state.mine,
          backlog: options.backlog ? { pending: state.pending, longTerm: state.longTerm, note: state.backlogNote } : undefined,
          releases: state.release,
          warnings: state.warnings,
          warningCount: state.warnings.length,
          // 화면의 `정직성 점검: ⚠ N건`과 같은 수 — 줄 단위(⚠ 둘인 줄도 한 건).
          flaggedCount: state.flagged,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(renderText(state, options));
}

main(process.argv.slice(2));
