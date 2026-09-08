/**
 * `docs/BACKLOG.md`의 **형식을 읽고 쓰는 한 벌** (ADR-091 ①).
 *
 * 백로그 규칙은 "끼어든 요구를 즉시 적고, 머지되면 즉시 지운다"인데
 * 그 편집을 손으로 하는 동안 형식이 조금씩 갈렸다 — 날짜와 맥락의 어순, 장기
 * 항목의 칸 이름(현 상태/증상, 잔여 방향/방향), 세 칸 중 둘만 쓴 절. 형식이
 * 갈리면 표로 볼 수 없고, 표로 볼 수 없으면 "끝난 것이 아직 남아 있다"를 아무도
 * 못 본다.
 *
 * 그래서 이 파일이 형식의 정본이다: `backlog.mjs`의 `add`는 여기의 **쓰기**를
 * 쓰고 `list`는 여기의 **읽기**를 쓴다 — 정규식이 두 벌이면 적는 모양과 읽는
 * 모양이 갈린다(`lib/adr-entries.mjs`가 게이트 둘에 대해 하는 일과 같다).
 *
 * 읽기는 **관대하고** 쓰기는 **엄격하다**: 옛 절(B-1~B-10)은 소급 정리하지 않고
 * 모르는 칸 이름이 나와도 절대 터지지 않는다. 새로 적는 줄만 엄격한 모양이다.
 *
 * 의존성 없음 — 스크립트는 빌드 없이 돈다(같은 `scripts/lib`의 파서 하나만 빌려 쓴다).
 */
import { changelogSections } from "./changelog.mjs";

/** 「대기 중인 요구」 절의 머리. 꼬리표(`(구현되면 즉시 삭제 — …)`)는 붙어도 된다. */
export const PENDING_HEADING = /^##\s+대기 중인 요구/;

/**
 * 「사람 몫」 절의 머리 (ADR-093 ②). 꼬리표(`(도구가 아니라 …)`)는 붙어도 된다.
 *
 * 「할 일」은 할 일 목록(tasks) 전용 낱말이라 절 이름에 쓰지 않는다 — 사람만 할 수
 * 있는 일(연동 켜기·첫 승인·개발 서버를 직접 띄우기)은 다른 낱말이다.
 */
export const MINE_HEADING = /^##\s+사람 몫/;

/** 절이 없을 때 만들어 넣는 머리 줄. 꼬리표가 규칙("끝나면 즉시 삭제")을 함께 말한다. */
export const MINE_HEADING_LINE = "## 사람 몫 (에이전트가 아니라 사람이 하는 것 — 끝나면 즉시 삭제)";

/** 장기 방향 절의 머리 `## B-N. 제목`. */
export const LONG_HEADING = /^##\s+B-(\d+)\.\s*(.+?)\s*$/;

/** 아무 `## ` 머리 — 절의 끝을 찾을 때 쓴다. */
const ANY_HEADING = /^##\s/;

/** 대기 절이 비었을 때 남기는 자리표시자. 줄을 더할 때 지우고, 마지막 줄을 지우면 되살린다. */
export const PLACEHOLDER = "- (없음)";

/** `- **제목** …` 한 줄에서 제목과 나머지를 뽑는다. */
const PENDING_ITEM = /^-\s+\*\*(.+?)\*\*\s*(.*)$/;

/** 줄 끝의 `(YYYY-MM-DD, 맥락)`. 맥락은 없어도 된다. */
const PENDING_META = /\((\d{4}-\d{2}-\d{2})(?:\s*,\s*([^()]*))?\)\s*$/;

/**
 * `- **이름**: 값` 한 줄. 이름 뒤에 `(2026-08-25, ADR-028)` 같은 꼬리표가 붙는
 * 모양(B-5)과 꼬리표가 굵은 글씨 **안**에 든 모양(B-1)이 둘 다 있어 사이를
 * `[^:]*`로 열어 둔다.
 */
const LONG_BULLET = /^-\s+\*\*(.+?)\*\*([^:]*):\s*(.*)$/;

/** 진행 체크리스트를 여는 칸 이름 (ADR-092 ①). */
export const PROGRESS_FIELD = "진행";

/**
 * 진행 체크리스트 한 줄 `  - [x] 항목`.
 *
 * 들여쓰기는 **있어도 없어도 된다** — 사람이 손으로 적은 줄이 한 칸 덜 들어가는
 * 것을 이유로 항목을 잃는 것보다, 관대하게 읽고 다시 쓸 때 바로잡는 편이 낫다
 * (읽기는 관대하고 쓰기는 엄격하다). `[X]`도 완료로 읽는다.
 */
const CHECKLIST_ITEM = /^\s*-\s+\[([ xX])\]\s*(.*)$/;

/** 본문 어디에서든 `ADR-NNN`. 정직성 점검이 읽는 것. */
const ADR_MENTION = /ADR-(\d{3})/g;

/** 제목 꼬리의 `(YYYY-MM-DD …)` — B-10처럼 날짜에 말이 붙어도 날짜만 뽑는다. */
const TITLE_DATE = /\s*\((\d{4}-\d{2}-\d{2})[^()]*\)\s*$/;

/** `Asia/Seoul`의 오늘(`YYYY-MM-DD`). 클라이언트가 "오늘"을 다시 계산하지 않는 규칙과 같은 뜻이다. */
export function todayInSeoul(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** `YYYY-MM-DD` 둘 사이의 날 수. 형식이 아니면 undefined — 옛 줄에서 터지지 않으려고. */
export function daysBetween(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? "")) return undefined;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 본문에서 `ADR-NNN` 번호를 오름차순 중복 없이. */
export function adrMentions(text) {
  const found = new Set();
  for (const m of String(text ?? "").matchAll(ADR_MENTION)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

/**
 * 변경 기록이 쓰는 ADR 번호의 **묶음** — `ADR-107` 하나, `ADR-013·ADR-017`처럼
 * 가운뎃점으로 이은 목록, `ADR-001~084`처럼 물결로 이은 범위.
 *
 * 한 덩어리를 통째로 잡고 조각을 따로 읽는 이유는 정규식의 반복 그룹이 **마지막
 * 하나만** 남기기 때문이다 — 목록을 한 정규식으로 잡으면 가운데 번호들이 사라진다.
 */
const ADR_RUN = /ADR-\d{3}(?:\s*[~·]\s*(?:ADR-)?\d{3})*/g;
const ADR_RUN_PART = /([~·])?\s*(?:ADR-)?(\d{3})/g;

/** 묶음 하나 → 그 묶음이 가리키는 번호 전부(범위는 펼친다). */
function numbersInRun(run) {
  const out = [];
  let previous;
  for (const part of run.matchAll(ADR_RUN_PART)) {
    const separator = part[1];
    const n = Number(part[2]);
    if (separator === "~" && previous !== undefined) {
      // `ADR-001~084` — 기준선 항목이 이 모양으로 62건을 한 줄에 묶는다.
      for (let i = Math.min(previous, n); i <= Math.max(previous, n); i += 1) out.push(i);
    } else {
      out.push(n);
    }
    previous = n;
  }
  return out;
}

/**
 * `docs/CHANGELOG.md` → `ADR 번호 → 그 ADR이 **나온 날**(`YYYY-MM-DD`)` (ADR-109).
 *
 * 정직성 점검이 이것을 읽는 이유는 하나다: **항목을 적을 때 이미 있던 ADR은 그
 * 항목이 구현됐다는 증거가 될 수 없다.** 백로그 항목은 "이 결정(ADR-NNN)을 이렇게
 * 바꾸겠다"라고 적히는 일이 흔하고, 그 인용을 "머지된 듯"으로 읽으면 갓 적은 항목이
 * 적자마자 삭제 후보가 된다(B-9·대기 3의 실측).
 *
 * 날짜의 출처가 `docs/ADR.md`가 아니라 변경 기록인 이유: ADR 문서에는 날짜가 없고,
 * 버전 규칙(ADR-085 ③)이 "그 브랜치의 ADR 번호를 변경 기록 항목이 가리킨다"를
 * 게이트로 강제하므로 **머지된 ADR은 반드시 어느 항목엔가 적혀 있다**. 절을 자르는
 * 파서는 `lib/changelog.mjs` 한 벌을 쓴다 — 게이트·릴리스와 같은 것을 읽어야 한다.
 *
 * 같은 번호가 여러 항목에 나오면 **가장 이른 날짜**를 쓴다(그날 처음 나온 것이다).
 * 날짜 없는 머리(`## 미정` 같은 것)는 건너뛴다. 여기 없는 번호는 **모르는 것**이지
 * "안 나온 것"이 아니다 — 부르는 쪽이 그 갈래를 따로 다룬다.
 */
export function adrReleaseDates(changelogText) {
  const out = new Map();
  for (const section of changelogSections(String(changelogText ?? ""))) {
    if (!section.date) continue;
    const text = `${section.heading}\n${section.body}`;
    for (const run of text.match(ADR_RUN) ?? []) {
      for (const n of numbersInRun(run)) {
        const previous = out.get(n);
        if (previous === undefined || section.date < previous) out.set(n, section.date);
      }
    }
  }
  return out;
}

/** 굵은 글씨 표시를 떼고 공백을 한 칸으로 — 표 한 칸에 들어갈 모양. */
export function flatten(text) {
  return String(text ?? "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 첫 문장 — `.` 뒤에 공백이나 끝이 오는 자리에서 자른다. 마침표가 없으면 통째로. */
export function firstSentence(text) {
  const flat = flatten(text);
  const m = /^(.*?[.!?])(?:\s|$)/.exec(flat);
  return m ? m[1] : flat;
}

/**
 * 「대기 중인 요구」 절 — 머리 줄, 항목들, 자리표시자 줄, 그리고 **끼워 넣을 자리**.
 *
 * `insertAt`은 마지막 항목 바로 다음 줄이다(항목이 없으면 머리 바로 다음). 절
 * 뒤의 빈 줄과 다음 머리는 건드리지 않는다 — 문서의 나머지는 그대로 둔다.
 */
export function parsePending(text) {
  return parseListSection(text, PENDING_HEADING);
}

/**
 * 「사람 몫」 절 — 「대기 중인 요구」와 **같은 모양**이다(같은 줄 문법, 같은
 * 자리표시자, 같은 `insertAt`). 절이 아직 없으면 `headingLine: -1`이다.
 *
 * 문서 하나·파서 하나가 ADR-091 ①의 연장이다 — 두 문서면 "끝난 것은 즉시 지운다"는
 * 규칙도 둘이 된다.
 */
export function parseMine(text) {
  return parseListSection(text, MINE_HEADING);
}

/** 대기·사람 몫이 나눠 쓰는 줄 목록 파서. 머리 정규식만 다르다. */
function parseListSection(text, heading) {
  const lines = text.split("\n");
  const headingLine = lines.findIndex((line) => heading.test(line));
  if (headingLine < 0) return { headingLine: -1, items: [], placeholderLine: -1, insertAt: -1 };

  const items = [];
  let placeholderLine = -1;
  let lastItemLine = headingLine;
  for (let i = headingLine + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (ANY_HEADING.test(line)) break;
    if (!line.startsWith("- ")) continue;
    lastItemLine = i;
    if (line.trim() === PLACEHOLDER) {
      placeholderLine = i;
      continue;
    }
    items.push({ ...parsePendingLine(line), line: i, raw: line });
  }
  return { headingLine, items, placeholderLine, insertAt: lastItemLine + 1 };
}

/**
 * 대기 줄 하나 → `{ title, summary, date, context }`.
 *
 * 형식이 아닌 옛 줄도 읽는다: 굵은 제목이 없으면 줄 전체가 제목이고, 꼬리
 * `(날짜, 맥락)`이 없으면 날짜와 맥락이 빈다. **모르는 모양에 터지지 않는 것**이
 * 이 함수의 계약이다.
 */
export function parsePendingLine(line) {
  const body = line.replace(/^-\s+/, "");
  const m = PENDING_ITEM.exec(line);
  const title = m ? m[1].trim() : flatten(body);
  let rest = m ? m[2] : "";

  const meta = PENDING_META.exec(rest);
  const date = meta ? meta[1] : undefined;
  const context = meta && meta[2] ? meta[2].trim() : undefined;
  if (meta) rest = rest.slice(0, meta.index);

  const summary = flatten(rest.replace(/^\s*—\s*/, "")).replace(/\.$/, "");
  return { title, summary: summary || undefined, date, context };
}

/**
 * 장기 방향 절들(`## B-N.`) — 번호·제목·날짜·칸들·본문·`ADR-NNN`.
 *
 * 칸 이름은 **관대하게** 맞춘다: 표준은 현 상태 / 잔여 방향 / 미결 질문이고,
 * 그것이 없으면 증상 → 현 상태, 방향 → 잔여 방향으로 읽는다(B-10). 이름 뒤의
 * 꼬리표(`현 상태(2026-08-25, ADR-028)`)는 앞부분으로 맞춘다. 표준에도 별칭에도
 * 없는 칸은 `extras`에 남기고 버리지 않는다.
 *
 * 넷째 칸 `- **진행**:`(ADR-092)은 값이 아니라 **아래 체크리스트**를 갖는다 —
 * `progress`가 `[{ done, text, line }]`이고, 진행 칸이 아예 없으면 빈 배열이다
 * (`progressLine`이 -1). `line`은 문서 전체 기준 줄 번호라 토글이 그 줄만 다시
 * 쓴다.
 */
export function parseLongTerm(text) {
  const lines = text.split("\n");
  const sections = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = LONG_HEADING.exec(lines[i]);
    if (!m) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (ANY_HEADING.test(lines[j])) {
        end = j;
        break;
      }
    }
    const bodyLines = lines.slice(i + 1, end);
    const rawTitle = m[2];
    const dateMatch = TITLE_DATE.exec(rawTitle);
    sections.push({
      number: Number(m[1]),
      title: dateMatch ? rawTitle.slice(0, dateMatch.index).trim() : rawTitle.trim(),
      date: dateMatch ? dateMatch[1] : undefined,
      headingLine: i,
      endLine: end,
      body: bodyLines.join("\n"),
      ...normalizeFields(parseBullets(bodyLines, i + 1)),
      adrs: adrMentions(`${lines[i]}\n${bodyLines.join("\n")}`),
    });
  }
  return sections;
}

/**
 * 절 본문 → `[{ name, value, line }]`. 이어지는 줄은 앞 칸에 붙인다.
 *
 * 「진행」 칸 아래의 체크리스트 줄은 **값에 붙이지 않고** 그 칸의 `progress`로
 * 모은다 — 들여쓴 `  - [x] …`는 `- `로 시작하지 않아 예전 규칙이라면 앞 칸의
 * 값으로 삼켜졌다. `startLine`은 본문 첫 줄의 문서 전체 기준 줄 번호다.
 *
 * 아는 한계(고치지 않고 둔다 — 손으로 적은 절에서만 나고 터지지는 않는다): 한 절에
 * 진행 칸이 둘이면 앞엣것만 남고, 진행 칸 아래의 산문 줄은 그 칸의 값에 붙으며,
 * 항목 본문이 숫자뿐이면 `--check`가 번호로 읽어 고를 수 없다.
 */
function parseBullets(bodyLines, startLine = 0) {
  const bullets = [];
  let progressBullet;
  for (let k = 0; k < bodyLines.length; k += 1) {
    const line = bodyLines[k];
    const lineNumber = startLine + k;

    const check = CHECKLIST_ITEM.exec(line);
    if (check) {
      // 진행 칸 아래일 때만 항목이다. 그 밖의 체크 상자는 조용히 넘긴다 —
      // 모르는 모양에 터지지 않는 것이 이 파서의 계약이다.
      if (progressBullet) progressBullet.progress.push({ done: check[1].toLowerCase() === "x", text: flatten(check[2]), line: lineNumber });
      continue;
    }

    const m = LONG_BULLET.exec(line);
    if (m) {
      const bullet = { name: `${m[1].trim()}${m[2].trim()}`, value: m[3].trim(), line: lineNumber };
      bullets.push(bullet);
      progressBullet = bullet.name.startsWith(PROGRESS_FIELD) ? Object.assign(bullet, { progress: [] }) : undefined;
      continue;
    }

    if (bullets.length > 0 && line.trim() && !line.startsWith("- ")) {
      bullets[bullets.length - 1].value += ` ${line.trim()}`;
    }
  }
  return bullets;
}

/** 표준 칸 셋 + 의존, 그리고 별칭. 표준이 있으면 별칭은 보지 않는다. */
const FIELD_ALIASES = {
  state: ["현 상태", "증상"],
  next: ["잔여 방향", "방향"],
  open: ["미결 질문"],
  depends: ["의존"],
  progress: [PROGRESS_FIELD],
};

function normalizeFields(bullets) {
  const out = { state: undefined, next: undefined, open: undefined, depends: undefined, progress: [], progressLine: -1, extras: [] };
  const taken = new Set();
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const hit = bullets.find((b, idx) => !taken.has(idx) && b.name.startsWith(alias));
      if (hit) {
        // 진행 칸의 값은 산문이 아니라 아래 체크리스트다 — 칸이 있으면 줄 번호도 남긴다.
        if (key === "progress") {
          out.progress = hit.progress ?? [];
          out.progressLine = hit.line;
        } else {
          out[key] = hit.value;
        }
        taken.add(bullets.indexOf(hit));
        break;
      }
    }
  }
  out.extras = bullets.filter((b, idx) => !taken.has(idx)).map((b) => ({ name: b.name, value: b.value }));
  return out;
}

/**
 * 새 대기 줄 한 줄.
 *
 * 요약이 없으면 `- **제목** — 제목.`이 되지 않게 **제목만** 쓴다 — 같은 말을 두 번
 * 적은 줄은 표에서 한 칸을 낭비하고 사람에게 아무것도 알려 주지 않는다.
 */
export function renderPendingLine({ title, summary, date, context }) {
  const head = `- **${title}**`;
  const tail = context ? `(${date}, ${context})` : `(${date})`;
  if (!summary) return `${head} ${tail}`;
  const closed = /[.!?…]$/.test(summary) ? summary : `${summary}.`;
  return `${head} — ${closed} ${tail}`;
}

/**
 * 「사람 몫」 절을 **만들어 넣을 자리** (ADR-093 ②).
 *
 * 자리는 「대기 중인 요구」 절 **뒤**, 첫 `## B-` 앞이다 — 대기와 사람 몫은 둘 다
 * "아직 안 된 것"이고 장기 방향은 그 아래 층이라, 위에서 아래로 읽을 때 급한
 * 것부터 나온다. 대기 절이 아예 없는 문서(표본·옛 문서)에서는 첫 `## B-` 앞,
 * 그것도 없으면 문서 끝이다.
 *
 * 돌려주는 것은 `{ at, lines }`이고 `lines`를 그 자리에 그대로 splice 하면 된다 —
 * 앞뒤 빈 줄까지 포함해 이 함수가 정한다(절 사이의 빈 줄 하나가 문서의 모양이다).
 */
export function mineSectionInsertAt(lines) {
  const pendingHeading = lines.findIndex((line) => PENDING_HEADING.test(line));
  let at;
  if (pendingHeading >= 0) {
    at = lines.length;
    for (let i = pendingHeading + 1; i < lines.length; i += 1) {
      if (ANY_HEADING.test(lines[i])) {
        at = i;
        break;
      }
    }
  } else {
    const firstLong = lines.findIndex((line) => LONG_HEADING.test(line));
    at = firstLong >= 0 ? firstLong : lines.length;
  }
  // 절 뒤의 빈 줄은 **다음 머리의 것**이다 — 그 앞에 끼워 넣어야 빈 줄이 겹치지 않는다.
  while (at - 1 > 0 && String(lines[at - 1] ?? "").trim() === "") at -= 1;
  return { at, lines: ["", MINE_HEADING_LINE, PLACEHOLDER] };
}

/**
 * 새 장기 절 — 세 칸이 항상 이 순서, 이 이름이다.
 *
 * 진행은 **선택**이라(ADR-092 ①) `progress`를 넘길 때만 넷째 칸이 붙는다 — 세 칸
 * 강제는 그대로다.
 */
export function renderLongSection({ number, title, date, state, next, open, progress }) {
  const lines = [`## B-${number}. ${title} (${date})`, `- **현 상태**: ${state}`, `- **잔여 방향**: ${next}`, `- **미결 질문**: ${open}`];
  if (progress?.length > 0) lines.push(renderProgressBlock(progress));
  return lines.join("\n");
}

/** 진행 체크리스트 한 줄 — 쓸 때는 두 칸 들여쓰기와 `[x]`/`[ ]`로 엄격하다. */
export function renderProgressItem({ done, text }) {
  return `  - [${done ? "x" : " "}] ${flatten(text)}`;
}

/** `- **진행**:` 칸 + 항목들. */
export function renderProgressBlock(items) {
  return [`- **${PROGRESS_FIELD}**:`, ...items.map(renderProgressItem)].join("\n");
}

/**
 * 절 안에서 진행 항목을 끼워 넣을 자리.
 *
 * 진행 칸이 이미 있으면 **마지막 체크리스트 줄 다음**(없으면 칸 바로 다음)이고,
 * 없으면 절의 마지막 내용 줄 다음이다 — 절 뒤의 빈 줄과 다음 머리는 건드리지
 * 않는다(`parsePending`의 `insertAt`과 같은 규칙). `needsHeader`면 `- **진행**:`
 * 줄부터 함께 써야 한다.
 */
export function progressInsertAt(lines, section) {
  if (section.progressLine >= 0) {
    const last = section.progress.length > 0 ? section.progress[section.progress.length - 1].line : section.progressLine;
    return { at: last + 1, needsHeader: false };
  }
  let at = section.endLine;
  while (at - 1 > section.headingLine && String(lines[at - 1] ?? "").trim() === "") at -= 1;
  return { at, needsHeader: true };
}

/** 문자열의 터미널 표시 폭 — 한글·CJK는 두 칸이다. 표의 칸을 맞추는 데만 쓴다. */
export function displayWidth(text) {
  let width = 0;
  for (const ch of String(text ?? "")) {
    const code = ch.codePointAt(0);
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isWide(code) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f9ff)
  );
}

/** 표시 폭 기준으로 자른다(잘리면 `…`). 표에서만 쓰고 `--json`은 원문 그대로다. */
export function truncate(text, limit) {
  const flat = flatten(text);
  if (displayWidth(flat) <= limit) return flat;
  let out = "";
  for (const ch of flat) {
    if (displayWidth(out) + displayWidth(ch) > limit - 1) break;
    out += ch;
  }
  return `${out}…`;
}

/** 표시 폭 기준 오른쪽 채우기 — 한글이 섞여도 칸이 맞는다. */
export function padTo(text, width) {
  const flat = String(text ?? "");
  return flat + " ".repeat(Math.max(0, width - displayWidth(flat)));
}

/** 머리 + 줄들 → 칸 폭을 맞춘 Markdown 표. 표 안의 `|`는 이스케이프한다. */
export function renderTable(headers, rows) {
  const escape = (cell) => String(cell ?? "").replace(/\|/g, "\\|");
  const body = rows.map((row) => row.map(escape));
  const widths = headers.map((h, i) => Math.max(displayWidth(h), ...body.map((row) => displayWidth(row[i] ?? ""))));
  const line = (cells) => `| ${cells.map((c, i) => padTo(c, widths[i])).join(" | ")} |`;
  return [line(headers), `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`, ...body.map(line)].join("\n");
}
