#!/usr/bin/env node
/**
 * 백로그 도구 (ADR-091 — 원본은 Karvis 저장소의 `scripts/backlog.mjs`).
 *
 * `docs/BACKLOG.md`를 **손으로 고치지 않게** 한다 — 형식은 이 스크립트가 쥐고,
 * 스킬(`/backlog-add`·`/backlog`)은 이것을 부르는 얇은 껍질이다.
 *
 *   init [--root <dir>]
 *        `docs/BACKLOG.md`가 없으면 절 골격을 만든다. 이미 있으면 거절한다 —
 *        덮어쓰기는 이 도구가 하지 않는 일이다(백로그는 사람의 약속 목록이다).
 *   add  "<제목 [— 요약]>" [--date YYYY-MM-DD] [--context "…"]
 *        「대기 중인 요구」 끝에 한 줄을 더한다. 날짜 기본값은 `Asia/Seoul`의 오늘,
 *        맥락 기본값은 지금 브랜치 이름(`feature/x` → `x 작업 중 들어옴`).
 *   add --long "<제목>" --state "…" --next "…" --open "…" [--todo "…"]… [--done "…"]…
 *        다음 `## B-N.` 번호로 장기 방향 절을 만든다. 세 칸 중 하나라도 비면 실패.
 *        `--todo`(미완)·`--done`(완료)을 여러 번 주면 진행 체크리스트를 처음부터
 *        친 순서대로 심는다(선택 — ADR-092).
 *   progress B-N [--todo "…"]… [--done "…"]… [--check <n|본문>]… [--uncheck <n|본문>]…
 *        장기 절의 **진행 체크리스트**를 갱신한다(ADR-092 ①). `--todo`는 미완
 *        항목을, `--done`은 완료 항목을 더한다 — 그 본문이 **이미 있으면 상태를
 *        맞춘다**(있는 미완에 `--done`을 주면 체크, 있는 완료에 `--todo`를 주면
 *        해제). `--check`/`--uncheck`는 있는 항목만 토글한다 — 번호(1부터)나 본문
 *        일부로 고르며, 본문이 둘 이상과 맞으면 **조용히 잘못 체크하지 않고** 멈춰
 *        번호를 요구한다. 바뀐 것이 없으면 문서를 쓰지 않는다.
 *   mine add "<할 것 [— 설명]>" --source "…" [--date YYYY-MM-DD]
 *        **사람 몫** — 에이전트가 아니라 사람만 할 수 있는 일(연동 켜기·첫 승인·
 *        개발 서버를 직접 띄우기)을 「사람 몫」 절에 한 줄로 적는다(ADR-093 ②). 절이
 *        없으면 대기 절 뒤·첫 `## B-` 앞에 만든다. `--source`는 **필수**다 — 그 일을
 *        남긴 ADR·브랜치·대화를 모르면 나중에 왜 해야 하는지도 모른다.
 *   mine done <n|본문> · done <n|본문>
 *        줄을 **지운다**(체크가 아니다 — 끝난 것은 지운다는 백로그 규칙 그대로).
 *        `done`은 「대기 중인 요구」, `mine done`은 「사람 몫」이고, 고르는 규칙은
 *        `progress --check`와 같다(번호 1부터 또는 본문 일부, 둘 이상 맞으면 멈춤).
 *        절이 비면 `- (없음)` 자리표시자를 되살린다.
 *   done --long B-N [--force]
 *        **장기 방향 절 하나를 통째로** 지운다(머리 줄부터 다음 `## ` 앞까지 —
 *        진행 블록도 함께). 나머지 번호는 **다시 매기지 않는다** — B-N은 ADR·계획
 *        문서가 이름으로 가리키는 번호라, 하나를 지웠다고 밀면 옛 문서의 참조가
 *        전부 어긋난다. 진행 체크리스트가 **전부 완료**가 아니면 거절하고, 그래도
 *        지우려면 `--force`다(체크리스트가 아예 없을 때도 같다).
 *   mine list
 *        `list --section 사람`과 같다.
 *   list [--json] [--section 대기|사람|장기]
 *        표 셋으로 보여 준다 + 장기 표 아래 「진행 상황」 블록 + **정직성 점검**:
 *        항목이 가리키는 `ADR-NNN`이 그 **항목을 적은 뒤에** 나왔으면 ⚠(머지된 듯 —
 *        삭제 검토), 대기 항목이 30일을 넘기면 ⚠, 진행이 **전부 완료**면 ⚠. ADR이
 *        나온 날은 `docs/CHANGELOG.md`가 말한다(ADR-109) — 적을 때 이미 있던 ADR은
 *        그 항목이 구현됐다는 증거가 아니라 **바꾸겠다고 가리킨 결정**이다. 변경
 *        기록에 없어 시점을 모르는 번호는 「확인」 ⚠로 남는다. 장기 항목의 ADR ⚠는
 *        **잔여 방향·미결 질문**이 가리키는 것만 본다 — 현 상태의 ADR은 "여기까지
 *        됐다"는 근거다.
 *
 * ⚠는 힌트일 뿐 **아무것도 지우지 않는다** — 백로그는 사람의 약속 목록이고
 * 삭제는 사람이 한다(ADR-091 트레이드오프).
 *
 * 뿌리는 **`cwd`의 git 저장소 뿌리**다(git이 아니면 `cwd`) — 플러그인으로 설치되면
 * 스크립트는 캐시 안에 살기 때문에 스크립트 위치를 기준으로 삼을 수 없다.
 * 공통 옵션 `--root <dir>`는 언제나 그보다 앞선다(테스트가 표본 레포를 넘기는 손잡이).
 *
 * 의존성 없음 · 네트워크 없음.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adrEntries, adrTag } from "./lib/adr-entries.mjs";
import { repoRoot } from "./lib/git-status.mjs";
import {
  MINE_HEADING_LINE,
  PLACEHOLDER,
  VIA_FORBIDDEN,
  adrMentions,
  adrReleaseDates,
  daysBetween,
  detectVia,
  firstSentence,
  flatten,
  mineSectionInsertAt,
  parseLongTerm,
  parseMine,
  parsePending,
  progressInsertAt,
  renderLongSection,
  renderPendingLine,
  renderProgressBlock,
  renderProgressItem,
  renderTable,
  todayInSeoul,
  truncate,
} from "./lib/backlog-doc.mjs";

/**
 * 이 스크립트를 부르는 표기. 플러그인 캐시 안에 살아서 **절대 경로가 유일하게 붙여
 * 넣을 수 있는 것**이다 — 사용법과 오류 메시지가 같은 글자를 쓰게 여기 하나만 둔다.
 */
const SELF = `node ${JSON.stringify(fileURLToPath(import.meta.url))}`;

const BACKLOG_PATH = join("docs", "BACKLOG.md");
const ADR_PATH = join("docs", "ADR.md");
const CHANGELOG_PATH = join("docs", "CHANGELOG.md");
const STALE_DAYS = 30;

const USAGE = `사용법:
  ${SELF} init [--root <dir>]
    docs/BACKLOG.md 골격을 만든다. 이미 있으면 아무것도 하지 않는다.
  ${SELF} add "<제목 [— 요약]>" [--date YYYY-MM-DD] [--context "…"] [--via <도구>] [--root <dir>]
  ${SELF} add --long "<제목>" --state "…" --next "…" --open "…" [--todo "…"]… [--done "…"]… [--date YYYY-MM-DD] [--via <도구>] [--root <dir>]
  ${SELF} progress B-N [--todo "…"]… [--done "…"]… [--check <n|본문>]… [--uncheck <n|본문>]… [--root <dir>]
    --todo/--done: 없으면 더하고, 이미 있으면 그 상태로 맞춘다. --check/--uncheck: 번호(1부터)나 본문 일부로 골라 토글한다.
  ${SELF} mine add "<할 것 [— 설명]>" --source "…" [--date YYYY-MM-DD] [--via <도구>] [--root <dir>]
    --via: 그 줄을 적은 도구를 직접 적는다. 없으면 환경 변수로 짐작하고(claude·codex·gemini), 그것도 없으면 빈 칸이다.
  ${SELF} mine done <n|본문> [--root <dir>]
  ${SELF} mine list [--json] [--root <dir>]
  ${SELF} done <n|본문> [--root <dir>]
    done/mine done: 줄을 지운다(체크가 아니다). 번호(1부터)나 본문 일부로 고르며, 둘 이상 맞으면 멈춘다.
  ${SELF} done --long B-N [--force] [--root <dir>]
    장기 방향 절을 통째로 지운다(진행 블록 포함). 진행이 전부 완료가 아니면 거절한다 — --force로 넘긴다. 나머지 번호는 그대로다.
  ${SELF} list [--json] [--section 대기|사람|장기] [--root <dir>]

  뿌리는 지금 있는 곳(cwd)의 git 저장소 뿌리다. --root <dir>로 직접 넘길 수 있다.`;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/** 값을 받는 옵션과 받지 않는 옵션. 모르는 `--옵션`은 조용히 넘기지 않고 멈춘다. */
const VALUE_FLAGS = new Set(["--date", "--context", "--source", "--root", "--state", "--next", "--open", "--section", "--via"]);
const BOOL_FLAGS = new Set(["--json", "--force"]);
/** 여러 번 올 수 있는 옵션 — 값이 덮이지 않고 배열로 쌓인다(진행 항목은 한 번에 여럿이다). */
const ARRAY_FLAGS = new Set(["--todo", "--done", "--check", "--uncheck"]);

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      // 감싸는 명령(`npm run … -- "제목"`)이 그대로 통과시키는 구분자. 삼키고 넘어간다.
      continue;
    }
    if (arg === "--long") {
      // `--long`은 제목을 값으로 받아도 되고(`--long "제목"`) 따로 둬도 된다.
      const nextArg = argv[i + 1];
      options.long = nextArg && !nextArg.startsWith("--") ? (i += 1, nextArg) : true;
    } else if (VALUE_FLAGS.has(arg) || ARRAY_FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined) fail(`${arg} 뒤에 값이 필요합니다.\n\n${USAGE}`);
      const key = arg.slice(2);
      if (ARRAY_FLAGS.has(arg)) {
        (options[key] ??= []).push(value);
        // 더하는 항목은 **친 순서 그대로** 문서에 들어가야 한다 — 완료와 미완을
        // 섞어 치는 것이 보통이라 배열 둘로만 두면 순서가 뒤집힌다.
        if (key === "todo" || key === "done") (options.additions ??= []).push({ done: key === "done", text: value });
      } else options[key] = value;
      i += 1;
    } else if (BOOL_FLAGS.has(arg)) {
      options[arg.slice(2)] = true;
    } else if (arg.startsWith("--")) {
      fail(`알 수 없는 옵션: ${arg}\n\n${USAGE}`);
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

function backlogRoot(options) {
  return options.root ? resolve(options.root) : repoRoot();
}

/**
 * 문서가 없을 때의 **안내 한 줄**. 적는 명령은 이것을 오류로 내고(적을 곳이 없으니
 * 실패가 맞다), 보는 명령(`list`)은 이것을 찍고 **0으로 끝낸다** — 스킬이 사용자에게
 * 보여 줘야 할 것은 스택이 아니라 다음 한 걸음이다.
 */
export function missingBacklogNote(path) {
  return `${path}가 없습니다 — /backlog-add로 만들거나 \`${SELF} init\`으로 골격을 만드세요.`;
}

function readBacklog(root) {
  const path = join(root, BACKLOG_PATH);
  try {
    return { path, text: readFileSync(path, "utf8") };
  } catch {
    return fail(`${missingBacklogNote(path)}\n  다른 저장소의 문서를 쓰려면 --root <dir>를 넘기세요.`);
  }
}

/** 기존 ADR 번호들. 문서가 없으면 빈 집합 — 정직성 점검이 없을 뿐 목록은 나온다. */
function existingAdrNumbers(root) {
  try {
    return new Set(adrEntries(readFileSync(join(root, ADR_PATH), "utf8")).keys());
  } catch {
    return new Set();
  }
}

/**
 * ADR이 **나온 날** 표 (ADR-109). 변경 기록이 없으면 빈 표 — 모든 번호가 "모르는
 * 것"이 되어 ⚠가 「변경 기록에 없음」 쪽으로 붙는다. 조용히 통과시키지 않는 쪽이
 * 이 점검의 자세다(`existingAdrNumbers`가 문서 없음을 다루는 방식과 같은 판단).
 */
function adrReleaseDatesOf(root) {
  try {
    return adrReleaseDates(readFileSync(join(root, CHANGELOG_PATH), "utf8"));
  } catch {
    return new Map();
  }
}

/**
 * `init`이 만드는 **골격** — 원본(Karvis `docs/BACKLOG.md`)의 절 구조와 자리표시자
 * 그대로다. 제품 이름과 저장소 규칙 문서 이름만 뺐다.
 *
 * 장기 방향(`## B-N.`)은 **절을 만들지 않는다** — `parseLongTerm`이 절이 하나도
 * 없는 문서를 빈 배열로 읽고 `add --long`이 문서 끝에 B-1을 붙이므로, 빈 절을 미리
 * 두면 "여기 뭔가 있어야 한다"는 인상만 남는다(「사람 몫」 절을 미리 만들지 않는
 * 것과 같은 판단). 대신 주석 한 줄이 어디로 가는지 말해 준다.
 */
const SKELETON = `# 백로그

> 끼어든 요구·사람 몫·장기 방향을 한 문서에 모은다. **손으로 고치지 않는다** —
> 형식은 backlog.mjs가 쥐고, 적고 지우는 것은 \`/backlog-add\`, 보는 것은 \`/backlog\`다.

## 대기 중인 요구 (구현되면 즉시 삭제)
${PLACEHOLDER}

${MINE_HEADING_LINE}
${PLACEHOLDER}

<!-- 장기 방향(## B-N.) 절은 \`add --long\`이 이 아래에 만든다. -->
`;

/**
 * 빈 저장소에 문서를 세운다.
 *
 * **있으면 덮지 않고 거절한다.** 덮어쓰기는 이 도구가 하지 않는 일이다 — 백로그는
 * 사람의 약속 목록이고, 한 번의 오타로 그것을 통째로 잃는 명령을 두지 않는다.
 */
function commandInit(options) {
  const root = backlogRoot(options);
  const path = join(root, BACKLOG_PATH);
  if (existsSync(path)) {
    console.log(`이미 있습니다 — ${path}를 그대로 둡니다.`);
    process.exit(0);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, SKELETON);
  console.log(`✔ ${BACKLOG_PATH} 골격을 만들었습니다 (${path})\n${SKELETON.split("\n").map((l) => `  ${l}`).join("\n")}`);
}

function checkDate(value, where) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${where}의 날짜가 YYYY-MM-DD 형식이 아닙니다: ${JSON.stringify(value)}`);
  return value;
}

/**
 * 이 줄을 적은 도구 (ADR-121). `--via`가 이기고, 없으면 환경 변수로 짐작하며,
 * 그것도 없으면 기록하지 않는다(사람이 직접 친 것이라 빈 칸이 정직하다).
 *
 * **괄호와 쉼표가 든 `--via`는 조용히 고치지 않고 거절한다** (리뷰 H1 ②). 그 글자들이
 * 줄에 들어가면 꼬리 괄호의 구분이 깨져 다음에 읽을 때 날짜와 맥락까지 요약으로
 * 흡수된다 — 에러 없이, 영구히. 사람이 친 값을 말없이 다듬으면 문서에 무엇이 적혔는지
 * 모르게 되므로, 여기서는 멈추고 알린다(렌더러의 `sanitizeVia`는 그 뒤의 마지막
 * 방어선이지 이 검사의 대체가 아니다).
 */
function resolveVia(options) {
  const explicit = options.via;
  if (explicit !== undefined && VIA_FORBIDDEN.test(explicit)) {
    fail(
      `--via 값에는 괄호와 쉼표를 쓸 수 없습니다: ${JSON.stringify(explicit)}\n` +
        `  그 글자들은 줄 꼬리 \`(날짜, 맥락, 작성: 도구)\`의 구분을 깨뜨립니다.\n` +
        `  도구 이름 하나만 넘기세요 (예: --via codex). 아무것도 안 하고 멈췄습니다.`,
    );
  }
  return detectVia(process.env, explicit);
}

/**
 * 맥락은 브랜치 이름에서만 유추한다 — `feature/x`는 "x 작업 중", `hotfix/x`는
 * "x 수정 중". 그 밖(main·release·분리된 HEAD)에서는 **추측하지 않고 묻는다**:
 * 틀린 맥락이 적힌 줄은 맥락이 없는 줄보다 나쁘다(ADR-091 트레이드오프).
 */
function deriveContext(root) {
  let branch = "";
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    branch = "";
  }
  const feature = /^feature\/(.+)$/.exec(branch);
  if (feature) return `${feature[1]} 작업 중 들어옴`;
  const hotfix = /^hotfix\/(.+)$/.exec(branch);
  if (hotfix) return `${hotfix[1]} 수정 중 들어옴`;
  return fail(
    `맥락을 알 수 없습니다 — 지금 브랜치는 ${branch ? `"${branch}"입니다` : "확인되지 않습니다"}.\n` +
      `  --context "…"로 어떤 일 도중에 들어온 요구인지 직접 적으세요.\n` +
      `  브랜치에서 맥락을 유추하는 것은 feature/… 와 hotfix/… 둘뿐입니다 (ADR-091).`,
  );
}

/** 입력 `"제목 — 요약"`을 가른다. em dash가 없으면 제목만 있는 것이다. */
function splitTitle(input) {
  const idx = input.indexOf("—");
  if (idx < 0) return { title: input.trim(), summary: undefined };
  return { title: input.slice(0, idx).trim(), summary: input.slice(idx + 1).trim() || undefined };
}

function commandAddPending(options, positional) {
  // 따옴표 없이 넘어온 제목("다크 모드 — …")은 셸이 이미 낱말로 쪼개 놓았다.
  // 다시 붙여 준다 — 사람이 스킬에 친 한 줄과 같은 것이 되게.
  const input = positional.join(" ");
  if (!input.trim()) fail(`추가할 제목이 없습니다.\n\n${USAGE}`);

  const root = backlogRoot(options);
  const { path, text } = readBacklog(root);
  const pending = parsePending(text);
  if (pending.headingLine < 0) fail(`${path}에 「대기 중인 요구」 절이 없습니다 — 절 머리를 먼저 만드세요.`);

  const { title, summary } = splitTitle(input);
  if (!title) fail(`제목이 비었습니다 — "제목 — 요약" 꼴로 넘기세요.\n\n${USAGE}`);

  // 같은 제목이 이미 있으면 **더하지 않고 알린다**. 백로그 규칙이 "즉시 적는다"라서
  // 같은 요구가 두 번 들어오기 쉬운데, 그때 필요한 것은 줄 하나가 아니라 그 사실이다.
  const duplicate = pending.items.find((item) => item.title === title);
  if (duplicate) {
    console.log(`이미 있습니다 — 「대기 중인 요구」에 같은 제목이 있어 더하지 않았습니다.\n  ${duplicate.raw.trim()}`);
    process.exit(0);
  }

  const date = options.date ? checkDate(options.date, "--date") : todayInSeoul();
  const context = options.context?.trim() || deriveContext(root);
  const via = resolveVia(options);
  const line = renderPendingLine({ title, summary, date, context, via });

  const lines = text.split("\n");
  lines.splice(pending.insertAt, 0, line);
  // 자리표시자는 새 줄이 들어온 **뒤에** 지운다 — 먼저 지우면 끼워 넣을 자리가 밀린다.
  if (pending.placeholderLine >= 0) lines.splice(pending.placeholderLine < pending.insertAt ? pending.placeholderLine : pending.placeholderLine + 1, 1);
  writeFileSync(path, lines.join("\n"));

  console.log(`✔ 「대기 중인 요구」에 더했습니다 (${BACKLOG_PATH})\n  ${line}`);
}

function commandAddLong(options, positional) {
  const title = flatten(typeof options.long === "string" ? [options.long, ...positional].join(" ") : positional.join(" "));
  const missing = [];
  if (!title) missing.push("제목");
  for (const [flag, label] of [["state", "--state (현 상태)"], ["next", "--next (잔여 방향)"], ["open", "--open (미결 질문)"]]) {
    if (!options[flag] || !String(options[flag]).trim()) missing.push(label);
  }
  if (missing.length > 0) {
    fail(
      `장기 방향 항목에는 세 칸이 모두 필요합니다 — 빈 칸: ${missing.join(", ")}\n` +
        `  아무것도 쓰지 않았습니다. 세 칸을 채워 다시 부르세요.\n\n${USAGE}`,
    );
  }

  const root = backlogRoot(options);
  const { path, text } = readBacklog(root);
  const sections = parseLongTerm(text);

  const duplicate = sections.find((section) => section.title === title);
  if (duplicate) {
    console.log(`이미 있습니다 — B-${duplicate.number}이(가) 같은 제목입니다. 더하지 않았습니다.`);
    process.exit(0);
  }

  const number = sections.reduce((max, section) => Math.max(max, section.number), 0) + 1;
  const date = options.date ? checkDate(options.date, "--date") : todayInSeoul();
  // 진행은 선택이다(ADR-092 ①) — `--todo`(미완)와 `--done`(완료)을 **친 순서대로**
  // 심는다. 절을 새로 쓸 때도 "여기까지는 됐다"를 함께 적을 수 있어야 한다.
  const seeded = (options.additions ?? []).map((item) => ({ done: item.done, text: flatten(item.text) })).filter((item) => item.text);
  const section = renderLongSection({
    number,
    title,
    date,
    state: flatten(options.state),
    next: flatten(options.next),
    open: flatten(options.open),
    via: resolveVia(options),
    progress: seeded,
  });

  const body = text.replace(/\n+$/, "");
  writeFileSync(path, `${body}\n\n${section}\n`);

  console.log(`✔ 장기 방향에 B-${number}을(를) 더했습니다 (${BACKLOG_PATH})\n${section.split("\n").map((l) => `  ${l}`).join("\n")}`);
}

// ── 사람 몫 (ADR-093 ②) · 줄 지우기 (ADR-093 ③) ─────────────────────────────

/**
 * 「사람 몫」 절이 있는 문서를 **머릿속에서** 만든다 — 없으면 절을 끼워 넣은
 * 사본을 돌려주되 **파일에는 쓰지 않는다**.
 *
 * 절을 미리 만들어 두지 않는 이유: 문서에 빈 절이 늘어나면 「대기 중인 요구」의
 * 자리표시자처럼 "여기 뭔가 있어야 한다"는 인상만 남는다. 첫 줄이 들어올 때
 * 생기고, 마지막 줄이 지워지면 자리표시자로 남는다.
 *
 * **여기서 쓰지 않는 이유**: 절을 만들고 나서 뒤따르는 검사(같은 할 것이 이미 있다
 * 등)에 걸리면 "아무것도 안 했다"고 말해 놓고 파일에는 빈 절이 남는다. 쓰기는
 * 부르는 쪽에서 **마지막에 한 번**이다 — 실패한 명령은 문서를 한 바이트도 바꾸지
 * 않는다.
 */
function withMineSection(text) {
  const found = parseMine(text);
  if (found.headingLine >= 0) return { text, mine: found };

  const lines = text.split("\n");
  const { at, lines: inserted } = mineSectionInsertAt(lines);
  lines.splice(at, 0, ...inserted);
  const next = lines.join("\n");
  return { text: next, mine: parseMine(next), created: true };
}

/** 줄 목록을 사람이 고를 수 있게 번호와 함께. 실패 메시지에 붙는다. */
function listLines(items) {
  return items.map((item, idx) => `    ${idx + 1}. ${flatten(item.raw.replace(/^-\s+/, ""))}`).join("\n");
}

/**
 * 지울 줄 하나를 고른다 — `progress --check`와 **같은 규칙**이다.
 *
 * 번호면 1부터의 자리, 아니면 제목+요약에 대한 대소문자 무시 부분 문자열. 0건이면
 * 멈추고 2건 이상이어도 멈춘다 — 지우는 것은 되돌릴 수 없으니 조용히 잘못 고르는
 * 것보다 번호를 요구하는 편이 낫다.
 */
function resolveListItem(items, target, where) {
  if (items.length === 0) fail(`「${where}」에 지울 줄이 없습니다.`);

  const trimmed = String(target ?? "").trim();
  if (!trimmed) fail(`무엇을 지울지 알려 주세요 — 번호(1부터)나 본문 일부를 넘기세요.\n${listLines(items)}`);

  if (/^\d+$/.test(trimmed)) {
    const idx = Number(trimmed);
    if (idx < 1 || idx > items.length) fail(`${trimmed}: 「${where}」의 줄은 ${items.length}개입니다.\n${listLines(items)}`);
    return items[idx - 1];
  }

  const needle = flatten(trimmed).toLowerCase();
  const hits = items.filter((item) => `${item.title} ${item.summary ?? ""}`.toLowerCase().includes(needle));
  if (hits.length === 0) fail(`${JSON.stringify(trimmed)}: 「${where}」에 맞는 줄이 없습니다.\n${listLines(items)}`);
  if (hits.length > 1) {
    fail(
      `${JSON.stringify(trimmed)}: 「${where}」의 줄 ${hits.length}개와 맞습니다 — 번호로 고르세요.\n` +
        `${listLines(items)}\n  아무것도 지우지 않았습니다.`,
    );
  }
  return hits[0];
}

/** 줄 하나를 지우고, 절이 비면 자리표시자를 되살린다. */
function deleteItem({ path, text, section, target, where }) {
  const item = resolveListItem(section.items, target, where);
  const lines = text.split("\n");
  lines.splice(item.line, 1);
  // 마지막 줄이었으면 절이 비어 버린다 — `- (없음)`이 "여기는 지금 비었다"를 말한다.
  if (section.items.length === 1) lines.splice(item.line, 0, PLACEHOLDER);
  writeFileSync(path, lines.join("\n"));

  const tail = section.items.length === 1 ? `\n  절이 비어 ${PLACEHOLDER}으로 되돌렸습니다.` : "";
  console.log(`✔ 「${where}」에서 지웠습니다 (${BACKLOG_PATH})\n  ${item.raw.trim()}${tail}`);
}

function commandMineAdd(options, positional) {
  const input = positional.join(" ");
  if (!input.trim()) fail(`무엇이 사람 몫인지 적어 주세요.\n\n${USAGE}`);

  // 출처는 필수다 — 어디서 온 일인지 모르는 줄은 며칠 뒤 "이걸 왜 해야 하지"가 되고,
  // 그러면 지울 수도 할 수도 없는 채로 남는다(대기 줄의 맥락과 같은 자리).
  const source = options.source?.trim();
  if (!source) {
    fail(
      `출처를 적어라 — 사람 몫에는 --source가 필요합니다.\n` +
        `  그 일을 남긴 근거를 한 구로 적으세요(예: --source "ADR-082, 2026-09-02 대화").\n\n${USAGE}`,
    );
  }

  const root = backlogRoot(options);
  const { path, text: original } = readBacklog(root);
  const { title, summary } = splitTitle(input);
  if (!title) fail(`할 것이 비었습니다 — "할 것 — 설명" 꼴로 넘기세요.\n\n${USAGE}`);
  const date = options.date ? checkDate(options.date, "--date") : todayInSeoul();

  const { text, mine, created } = withMineSection(original);

  const duplicate = mine.items.find((item) => item.title === title);
  if (duplicate) {
    console.log(`이미 있습니다 — 「사람 몫」에 같은 할 것이 있어 더하지 않았습니다.\n  ${duplicate.raw.trim()}`);
    process.exit(0);
  }

  const line = renderPendingLine({ title, summary, date, context: source, via: resolveVia(options) });
  const lines = text.split("\n");
  lines.splice(mine.insertAt, 0, line);
  // 자리표시자는 새 줄이 들어온 **뒤에** 지운다 — 먼저 지우면 끼워 넣을 자리가 밀린다.
  if (mine.placeholderLine >= 0) lines.splice(mine.placeholderLine < mine.insertAt ? mine.placeholderLine : mine.placeholderLine + 1, 1);
  writeFileSync(path, lines.join("\n"));

  const note = created ? "\n  (「사람 몫」 절을 새로 만들었습니다.)" : "";
  console.log(`✔ 「사람 몫」에 더했습니다 (${BACKLOG_PATH})\n  ${line}${note}`);
}

function commandMineDone(options, positional) {
  const root = backlogRoot(options);
  const { path, text } = readBacklog(root);
  const section = parseMine(text);
  if (section.headingLine < 0) fail(`${path}에 「사람 몫」 절이 없습니다 — 아직 적은 것이 없습니다.`);
  deleteItem({ path, text, section, target: positional.join(" "), where: "사람 몫" });
}

function commandDonePending(options, positional) {
  const root = backlogRoot(options);
  const { path, text } = readBacklog(root);
  const section = parsePending(text);
  if (section.headingLine < 0) fail(`${path}에 「대기 중인 요구」 절이 없습니다.`);
  deleteItem({ path, text, section, target: positional.join(" "), where: "대기 중인 요구" });
}

/**
 * 장기 방향 절 하나를 **통째로** 지운다 (ADR-109).
 *
 * 대기 줄·사람 몫과 같은 규칙("구현되면 즉시 삭제")이 장기 항목에도 있는데
 * 지우는 명령만 없어 그동안 손으로 고쳤다 — 백로그를 손으로 고치지 않는다는
 * 규칙 자체가 깨지던 자리다(ADR-091 ①, ADR-093 ③과 같은 판단).
 *
 * 지우는 범위는 `## B-N.` 머리 줄부터 **다음 `## ` 앞까지**다(`parseLongTerm`의
 * `endLine`) — 진행 블록도 절 안이라 함께 간다. 절 뒤의 빈 줄은 다음 머리의
 * 것이 아니라 이 절의 꼬리이므로 같이 지워야 빈 줄이 겹치지 않고, 문서 끝
 * 절이면 마지막 빈 줄 하나가 남아 파일 끝 줄바꿈이 지켜진다.
 *
 * **번호는 다시 매기지 않는다.** B-N은 ADR·계획·대화가 이름으로 가리키는
 * 번호다 — 하나를 지웠다고 뒤를 당기면 "B-8 ③"이라 적힌 옛 문서가 전부 다른
 * 것을 가리키게 된다. 빈 번호는 그 자리에 무엇이 있었는지를 ADR이 말해 준다.
 */
function commandDoneLong(options, positional) {
  // `done --long B-2`는 `--long`이 값을 삼키고, `done --long --force B-2`는
  // 자리 인자로 온다(`parseArgs`의 `--long` 규칙). 둘 다 받는다.
  const raw = typeof options.long === "string" ? options.long : positional.join(" ").trim();
  if (!raw) fail(`어느 장기 방향을 지울지 알려 주세요 — B-N을 넘기세요.\n\n${USAGE}`);
  const number = parseSectionNumber(raw);
  if (number === undefined) fail(`장기 방향 번호를 B-N 꼴로 넘기세요: ${JSON.stringify(raw)}\n\n${USAGE}`);

  const root = backlogRoot(options);
  const { path, text } = readBacklog(root);
  const sections = parseLongTerm(text);
  const section = sections.find((s) => s.number === number);
  if (!section) {
    const known = sections.length > 0 ? sections.map((s) => `B-${s.number}`).join(" · ") : "(없음)";
    fail(`B-${number}: 장기 방향에 없습니다.\n  있는 번호: ${known}`);
  }

  const done = section.progress.filter((item) => item.done).length;
  if (!options.force) {
    if (section.progress.length === 0) {
      fail(
        `B-${number}에 진행 체크리스트가 없어 다 됐는지 알 수 없습니다 — 지우지 않았습니다.\n` +
          `  코드와 대조해 \`${SELF} progress B-${number} --todo "…" / --done "…"\`로 채우거나,\n` +
          `  이미 끝난 것이 확실하면 --force를 붙이세요.`,
      );
    }
    if (done < section.progress.length) {
      fail(
        `B-${number}의 진행은 ${section.progress.length}개 중 ${done}개만 완료입니다 — 지우지 않았습니다.\n` +
          `${listProgress(section.progress)}\n` +
          `  남은 것이 정말 끝났으면 먼저 \`progress B-${number} --check …\`로 체크하고, 그래도 지우려면 --force를 붙이세요.`,
      );
    }
  }

  const lines = text.split("\n");
  const removed = lines.splice(section.headingLine, section.endLine - section.headingLine);
  writeFileSync(path, lines.join("\n"));

  const forced = options.force && done < section.progress.length ? ` (--force — 남은 항목 ${section.progress.length - done}개)` : "";
  console.log(
    `✔ 장기 방향 B-${number}을(를) 지웠습니다 (${BACKLOG_PATH})${forced}\n` +
      `  ## B-${number}. ${section.title}\n` +
      `  ${removed.filter((line) => line.trim()).length}줄 · 진행 ${done}/${section.progress.length}\n` +
      `  나머지 번호는 그대로입니다 — 다시 매기지 않습니다.`,
  );
}

// ── progress (진행 체크리스트, ADR-092) ─────────────────────────────────────

/** `B-3`·`b-3`·`3` 모두 3으로 읽는다 — 사람이 표에서 본 그대로 치게. */
function parseSectionNumber(raw) {
  const m = /^(?:B-?)?(\d+)$/i.exec(raw.trim());
  return m ? Number(m[1]) : undefined;
}

function findSection(text, number) {
  return parseLongTerm(text).find((section) => section.number === number);
}

/** 진행 항목 목록을 사람이 고를 수 있게 번호와 함께. 실패 메시지에 붙는다. */
function listProgress(items) {
  return items.map((item, idx) => `    ${idx + 1}. [${item.done ? "x" : " "}] ${item.text}`).join("\n");
}

/**
 * `--check`/`--uncheck`가 가리키는 항목 하나.
 *
 * 번호면 1부터의 자리, 아니면 **대소문자 무시 부분 문자열**이다. 0건이면 멈추고,
 * 2건 이상이어도 멈춘다 — 조용히 잘못 체크하는 것보다 번호를 요구하는 편이 낫다
 * (ADR-092 트레이드오프).
 */
function resolveProgressItem(section, target, flag) {
  const items = section.progress;
  const where = `B-${section.number}`;
  if (items.length === 0) fail(`${where}에 진행 항목이 없습니다 — 먼저 --todo/--done 으로 더하세요.`);

  const trimmed = String(target).trim();
  if (/^\d+$/.test(trimmed)) {
    const idx = Number(trimmed);
    if (idx < 1 || idx > items.length) {
      fail(`${flag} ${trimmed}: ${where}의 진행 항목은 ${items.length}개입니다.\n${listProgress(items)}`);
    }
    return items[idx - 1];
  }

  const needle = flatten(trimmed).toLowerCase();
  const hits = items.filter((item) => item.text.toLowerCase().includes(needle));
  if (hits.length === 0) fail(`${flag} ${JSON.stringify(trimmed)}: ${where}에 맞는 진행 항목이 없습니다.\n${listProgress(items)}`);
  if (hits.length > 1) {
    fail(
      `${flag} ${JSON.stringify(trimmed)}: ${where}의 진행 항목 ${hits.length}개와 맞습니다 — 번호로 고르세요.\n` +
        `${listProgress(items)}\n  아무것도 바꾸지 않았습니다.`,
    );
  }
  return hits[0];
}

/**
 * 진행 체크리스트 갱신. **문서는 마지막에 한 번만** 쓴다 — 중간에 실패하면(모호한
 * 본문, 없는 번호) 아무것도 바뀌지 않아야 한다.
 */
function commandProgress(options, positional) {
  const raw = positional.join(" ").trim();
  if (!raw) fail(`어느 장기 방향인지 알려 주세요 — B-N을 넘기세요.\n\n${USAGE}`);
  const number = parseSectionNumber(raw);
  if (number === undefined) fail(`장기 방향 번호를 B-N 꼴로 넘기세요: ${JSON.stringify(raw)}\n\n${USAGE}`);

  const todos = options.todo ?? [];
  const dones = options.done ?? [];
  const checks = options.check ?? [];
  const unchecks = options.uncheck ?? [];
  if (todos.length + dones.length + checks.length + unchecks.length === 0) {
    fail(`할 일이 없습니다 — --todo / --done / --check / --uncheck 중 하나는 있어야 합니다.\n\n${USAGE}`);
  }

  const root = backlogRoot(options);
  const { path, text } = readBacklog(root);
  const sections = parseLongTerm(text);
  if (sections.length === 0) fail(`${path}에 장기 방향 절(## B-N.)이 없습니다.`);
  if (!sections.some((section) => section.number === number)) {
    fail(`B-${number} 절이 없습니다 — 지금 있는 것: ${sections.map((s) => `B-${s.number}`).join(", ")}`);
  }

  const lines = text.split("\n");
  const notes = [];

  const additions = (options.additions ?? []).map((item) => ({ done: item.done, text: flatten(item.text) }));
  if (additions.some((item) => !item.text)) fail("빈 진행 항목은 더할 수 없습니다.");
  if (additions.length > 0) {
    const section = findSection(lines.join("\n"), number);
    const existing = new Map(section.progress.map((item) => [item.text, item]));
    const fresh = [];
    for (const item of additions) {
      // 같은 본문이 두 번 오는 것은 흔하다(코드 대조를 다시 돌린 때). 그때 필요한
      // 것은 줄 하나가 아니라 **상태**다: `--done`이 이미 있는 미완 항목을 가리키면
      // 그것은 "또 적어라"가 아니라 "됐다"는 뜻이므로 토글한다. 상태까지 같으면
      // 알리기만 한다(`add`의 중복 처리와 같다).
      const already = existing.get(item.text);
      if (already) {
        if (already.done === item.done) {
          notes.push(`이미 있습니다 — ${item.text}`);
          continue;
        }
        already.done = item.done;
        // 아직 문서에 없는 항목(이번에 더한 것)은 줄 번호가 없다 — 렌더가 그 값을
        // 그대로 읽으므로 여기서 고쳐 두면 된다.
        if (already.line !== undefined) lines[already.line] = renderProgressItem(already);
        notes.push(`상태를 바꿨습니다 — [${item.done ? "x" : " "}] ${item.text}`);
        continue;
      }
      const item_ = { done: item.done, text: item.text };
      existing.set(item.text, item_);
      fresh.push(item_);
    }
    if (fresh.length > 0) {
      // 끼워 넣는 자리는 이미 있는 항목들 **뒤**라, 위에서 고친 줄 번호는 그대로 맞다.
      const { at, needsHeader } = progressInsertAt(lines, section);
      const block = needsHeader ? renderProgressBlock(fresh) : fresh.map(renderProgressItem).join("\n");
      lines.splice(at, 0, ...block.split("\n"));
    }
  }

  // 토글은 항목을 더한 **뒤의** 목록을 본다 — 번호도 그 목록 기준이다.
  for (const [wanted, targets, flag] of [
    [true, checks, "--check"],
    [false, unchecks, "--uncheck"],
  ]) {
    for (const target of targets) {
      const section = findSection(lines.join("\n"), number);
      const item = resolveProgressItem(section, target, flag);
      if (item.done === wanted) {
        notes.push(`이미 ${wanted ? "완료" : "미완"}입니다 — ${item.text}`);
        continue;
      }
      lines[item.line] = renderProgressItem({ done: wanted, text: item.text });
    }
  }

  // 바뀐 것이 없으면 **쓰지 않는다** — 손대지 않은 파일의 수정 시각이 움직이면
  // 그 자체가 거짓말이고, ✔는 무엇이 됐다는 뜻이어야 한다.
  const next = lines.join("\n");
  const changed = next !== text;
  if (changed) writeFileSync(path, next);

  const updated = findSection(next, number);
  const done = updated.progress.filter((item) => item.done).length;
  const head = changed
    ? `✔ B-${number} 「${updated.title}」의 진행을 갱신했습니다 — ${done}/${updated.progress.length} (${BACKLOG_PATH})`
    : `바뀐 것이 없습니다 — B-${number} 「${updated.title}」 ${done}/${updated.progress.length} (${BACKLOG_PATH})`;
  console.log([head, ...notes.map((note) => `  ${note}`), renderProgressBlock(updated.progress)].join("\n"));
}

/**
 * 항목 하나의 ⚠ 목록. 지우지 않고 **알리기만** 한다.
 *
 * `adrs`는 "이 항목이 **아직 안 된 일**을 말하며 가리킨 ADR"이다 — 대기 줄은 줄
 * 전체가 그렇고, 장기 절은 **잔여 방향·미결 질문**만 그렇다. 현 상태가 가리키는
 * ADR은 "여기까지 됐다"는 근거지 "이 항목이 끝났다"가 아니어서 여기 오지 않는다.
 *
 * ADR 인용은 **적은 날과 견준다**(ADR-109). 항목을 적을 때 **이미 있던** ADR은 그
 * 항목이 구현됐다는 증거가 될 수 없다 — 백로그 항목은 "이 결정(ADR-NNN)을 이렇게
 * 바꾸겠다"라고 적히는 일이 흔하고, 그 인용까지 "머지된 듯"으로 읽으면 갓 적은
 * 항목이 적자마자 삭제 후보가 된다(B-9가 ADR-056·072를, 대기 3이 ADR-082를 그렇게
 * 가리켰다). 그래서 ⚠는 **항목의 날짜 이후에 나온** ADR에만 붙는다.
 *
 * 나온 날을 모르는 ADR(변경 기록에 없는 번호)은 **조용히 넘기지 않는다** — 다만
 * "머지된 듯"이라 단정하지도 않는다. 모른다는 사실 자체가 확인할 거리다.
 */
function warningsFor({ adrs, ageDays, progress, date }, existingAdrs, adrReleases = new Map()) {
  const warnings = [];
  const cited = (adrs ?? []).filter((n) => existingAdrs.has(n));
  const merged = [];
  const unknown = [];
  for (const n of cited) {
    const releasedAt = adrReleases.get(n);
    if (releasedAt === undefined) unknown.push(n);
    // 날짜가 없는 항목(옛 줄·머리에 날짜가 없는 장기 절)은 견줄 기준이 없다 —
    // 모르는 쪽으로 둔다. 조용히 지나가는 것보다 확인하라고 말하는 편이 낫다.
    else if (date === undefined || releasedAt >= date) merged.push(n);
  }
  if (merged.length > 0) warnings.push(`⚠ ${merged.map(adrTag).join("·")} 나중에 나옴 — 머지된 듯, 삭제 검토`);
  if (unknown.length > 0) warnings.push(`⚠ ${unknown.map(adrTag).join("·")} 변경 기록에 없음 — 나왔는지 알 수 없음, 확인`);
  if (ageDays !== undefined && ageDays > STALE_DAYS) warnings.push(`⚠ ${STALE_DAYS}일 초과`);
  // 체크리스트가 전부 `[x]`면 ADR 인용이 없어도 "끝난 것이 남아 있다"가 보인다(ADR-092 ③).
  if (progress?.length > 0 && progress.every((item) => item.done)) warnings.push("⚠ 진행 전부 완료 — 삭제 검토");
  return warnings;
}

export function collect(root) {
  const { text } = readBacklog(root);
  const existingAdrs = existingAdrNumbers(root);
  const adrReleases = adrReleaseDatesOf(root);
  const today = todayInSeoul();

  const pending = parsePending(text).items.map((item, idx) => {
    const ageDays = daysBetween(item.date, today);
    const adrs = adrMentions(item.raw);
    return {
      number: idx + 1,
      title: item.title,
      summary: item.summary,
      date: item.date,
      context: item.context,
      via: item.via,
      ageDays,
      adrs,
      warnings: warningsFor({ adrs, ageDays, date: item.date }, existingAdrs, adrReleases),
    };
  });

  // 사람 몫의 ⚠는 **30일 초과** 하나다. 대기 줄처럼 ADR로 "머지된 듯"을 묻지 않는
  // 이유: 사람 몫이 끝났다는 근거는 코드가 아니라 사람의 말이고(연동을 켰는지 스크립트는
  // 모른다), ADR이 생겼다고 그 일이 됐다는 뜻은 아니기 때문이다.
  const mine = parseMine(text).items.map((item, idx) => {
    const ageDays = daysBetween(item.date, today);
    return {
      number: idx + 1,
      title: item.title,
      summary: item.summary,
      date: item.date,
      source: item.context,
      via: item.via,
      ageDays,
      warnings: warningsFor({ ageDays }, existingAdrs, adrReleases),
    };
  });

  const longTerm = parseLongTerm(text).map((section) => {
    // 「관련 ADR」 칸은 절 전체가 가리키는 것을 다 보여 주고(맥락이니까), ⚠는
    // **앞으로 할 일**이 가리키는 것만 본다. 현 상태의 ADR로 ⚠를 띄우면 B-1처럼
    // 부분 진척을 성실히 적어 둔 절이 전부 걸려 ⚠ 자체가 안 보이게 된다.
    const futureAdrs = adrMentions(`${section.next ?? ""}\n${section.open ?? ""}`);
    // `line`은 문서 안의 자리라 목록에는 싣지 않는다 — 밖에서 쓸 것은 상태와 본문뿐이다.
    const progress = section.progress.map((item) => ({ done: item.done, text: item.text }));
    return {
      number: section.number,
      title: section.title,
      date: section.date,
      state: section.state,
      stateFirstSentence: section.state ? firstSentence(section.state) : undefined,
      next: section.next,
      open: section.open,
      progress,
      depends: section.depends,
      via: section.via,
      adrs: section.adrs,
      futureAdrs,
      // 장기 절의 "적은 날"은 머리의 `(YYYY-MM-DD)`다. 없는 절(B-1~B-7 같은 옛
      // 절)은 견줄 기준이 없어 예전처럼 인용을 전부 ⚠로 본다 — 날짜를 지어내
      // 조용히 넘기는 것보다 낫다.
      warnings: warningsFor({ adrs: futureAdrs, progress, date: section.date }, existingAdrs, adrReleases),
    };
  });

  return { pending, mine, longTerm };
}

export function renderPendingTable(pending) {
  if (pending.length === 0) return "## 대기 중인 요구\n\n(없음)";
  const rows = pending.map((item) => [
    String(item.number),
    truncate(item.summary ? `${item.title} — ${item.summary}` : item.title, 52),
    item.date ?? "?",
    truncate(item.context ?? "?", 28),
    item.via ?? "",
    item.ageDays === undefined ? "?" : `${item.ageDays}일`,
    item.warnings.join("; "),
  ]);
  return `## 대기 중인 요구\n\n${renderTable(["#", "제목", "들어온 날", "맥락", "작성", "경과일", "⚠"], rows)}`;
}

/**
 * 「사람 몫」 표 — 대기 표와 같은 칸에 「맥락」이 「출처」로 바뀐 것뿐이다(ADR-093 ②).
 *
 * 절이 아직 없는 문서와 절이 비어 있는 문서를 가르지 않는다 — 둘 다 "사람이 할 일이
 * 없다"이고, 만드는 것은 `mine add`가 한다.
 */
export function renderMineTable(mine) {
  if (mine.length === 0) return "## 사람 몫\n\n(없음)";
  const rows = mine.map((item) => [
    String(item.number),
    truncate(item.summary ? `${item.title} — ${item.summary}` : item.title, 52),
    item.date ?? "?",
    truncate(item.source ?? "?", 28),
    item.via ?? "",
    item.ageDays === undefined ? "?" : `${item.ageDays}일`,
    item.warnings.join("; "),
  ]);
  return `## 사람 몫\n\n${renderTable(["#", "할 것", "적은 날", "출처", "작성", "경과일", "⚠"], rows)}`;
}

function progressRatio(progress) {
  if (progress.length === 0) return "—";
  return `${progress.filter((item) => item.done).length}/${progress.length}`;
}

export function renderLongTable(longTerm) {
  if (longTerm.length === 0) return "## 장기 방향\n\n(없음)";
  const rows = longTerm.map((section) => [
    `B-${section.number}`,
    truncate(section.title, 40),
    truncate(section.stateFirstSentence ?? "?", 52),
    progressRatio(section.progress),
    truncate(section.depends ?? "", 28),
    section.via ?? "",
    section.adrs.map(adrTag).join("·"),
    section.warnings.join("; "),
  ]);
  return `## 장기 방향\n\n${renderTable(["번호", "제목", "현 상태(첫 문장)", "진행", "의존", "작성", "관련 ADR", "⚠"], rows)}`;
}

/**
 * 표 아래의 「진행 상황」 — 개수(`2/4`)가 못 말하는 것을 본문이 말한다(ADR-092
 * 트레이드오프: 갈래 크기가 달라 비율이 노력을 뜻하지 않는다).
 */
export function renderProgressBlocks(longTerm) {
  const withProgress = longTerm.filter((section) => section.progress.length > 0);
  if (withProgress.length === 0) {
    return `## 진행 상황\n\n(기록 없음 — ${SELF} progress B-N --todo "…" 로 채운다)`;
  }
  const blocks = withProgress.map((section) => {
    const head = `### B-${section.number} ${section.title} (${progressRatio(section.progress)})`;
    const items = section.progress.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`);
    return [head, ...items].join("\n");
  });
  return `## 진행 상황\n\n${blocks.join("\n\n")}`;
}

/**
 * 마지막 한 줄. `standup.mjs`가 브랜치 ⚠까지 합친 수로 같은 줄을 찍으므로 여기
 * 하나만 둔다 — 두 벌이면 같은 화면에 다른 문장이 나온다.
 */
export function renderHonestyLine(flagged, note = "삭제 여부는 사람이 정한다(백로그 규칙)") {
  return flagged === 0 ? "정직성 점검: ⚠ 없음." : `정직성 점검: ⚠ ${flagged}건 — ${note}.`;
}

/** `--section`이 받는 값 셋. 표 하나만 보고 싶을 때 쓴다. */
const SECTIONS = new Set(["대기", "사람", "장기"]);

function commandList(options) {
  const section = options.section;
  if (section !== undefined && !SECTIONS.has(section)) {
    fail(`--section 은 대기, 사람, 장기 중 하나여야 합니다: ${JSON.stringify(section)}\n\n${USAGE}`);
  }
  const wants = (name) => section === undefined || section === name;

  const root = backlogRoot(options);
  // 보는 명령은 문서가 없다고 **실패하지 않는다** — 스킬이 사용자에게 보여 줘야
  // 하는 것은 오류가 아니라 "먼저 init 하세요"라는 다음 한 걸음이다.
  const path = join(root, BACKLOG_PATH);
  if (!existsSync(path)) {
    if (options.json) console.log(JSON.stringify({ pending: [], mine: [], longTerm: [], note: missingBacklogNote(path) }, null, 2));
    else console.log(missingBacklogNote(path));
    return;
  }
  const { pending, mine, longTerm } = collect(root);

  if (options.json) {
    const out = {};
    if (wants("대기")) out.pending = pending;
    if (wants("사람")) out.mine = mine;
    if (wants("장기")) out.longTerm = longTerm;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const blocks = [];
  if (wants("대기")) blocks.push(renderPendingTable(pending));
  if (wants("사람")) blocks.push(renderMineTable(mine));
  if (wants("장기")) blocks.push(renderLongTable(longTerm), renderProgressBlocks(longTerm));

  const shown = [...(wants("대기") ? pending : []), ...(wants("사람") ? mine : []), ...(wants("장기") ? longTerm : [])];
  blocks.push(renderHonestyLine(shown.filter((item) => item.warnings.length > 0).length));

  console.log(blocks.join("\n\n"));
}

/**
 * CLI 진입. **`main()` 안에 있는 이유**는 `standup.mjs`가 이 파일에서 `collect`와
 * 렌더 함수를 import 하기 때문이다(ADR-093 ①, 렌더는 한 곳 — ADR-091 트레이드오프).
 * 최상위에서 argv를 읽으면 import 하는 것만으로 명령이 돌아 버린다.
 * `node backlog.mjs …`로 직접 부르는 것은 아래 가드가 그대로 살린다.
 */
function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(USAGE);
    process.exit(command ? 0 : 1);
  }

  const { options, positional } = parseArgs(rest);
  if (command === "init") {
    commandInit(options);
  } else if (command === "add") {
    if (options.long !== undefined) commandAddLong(options, positional);
    else commandAddPending(options, positional);
  } else if (command === "mine") {
    const [sub, ...subPositional] = positional;
    if (sub === "add") commandMineAdd(options, subPositional);
    else if (sub === "done") commandMineDone(options, subPositional);
    else if (sub === "list") commandList({ ...options, section: "사람" });
    else fail(`mine 뒤에는 add, done, list 중 하나가 옵니다: ${sub ?? "(없음)"}\n\n${USAGE}`);
  } else if (command === "done") {
    if (options.long !== undefined) commandDoneLong(options, positional);
    else commandDonePending(options, positional);
  } else if (command === "progress") {
    commandProgress(options, positional);
  } else if (command === "list") {
    commandList(options);
  } else {
    fail(`알 수 없는 명령: ${command}\n\n${USAGE}`);
  }
}

/**
 * 직접 불렸나 — **심링크를 푼 실제 경로**로 견준다.
 *
 * `node backlog.mjs`는 `process.argv[1]`이 적힌 경로 그대로지만, `node`는
 * 진입 모듈의 심링크를 풀어 `import.meta.url`을 만든다(`--preserve-symlinks-main`이
 * 꺼져 있는 기본값). 둘을 문자열로 견주면 `~/bin/backlog` 같은 심링크로 부른 순간
 * 어긋나 **아무 일도 일어나지 않는다** — 오류도 없이 조용히.
 *
 * `realpathSync`가 던지면(지워졌거나 권한이 없으면) 적힌 경로 그대로 견준다 —
 * 가드 하나 때문에 CLI가 뜨지 못하는 편보다 낫다.
 */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  let real;
  try {
    real = realpathSync(entry);
  } catch {
    real = entry;
  }
  return real === fileURLToPath(import.meta.url);
}

if (invokedDirectly()) main(process.argv.slice(2));
