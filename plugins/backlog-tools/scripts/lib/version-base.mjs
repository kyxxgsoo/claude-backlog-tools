/**
 * **기준 브랜치의 버전**을 읽는 한 벌 (ADR-085 ④ / ADR-093 ⑤).
 *
 * 버전 게이트(`check-version.mjs`)와 스탠드업(`standup.mjs`)이 같은 질문을 한다 —
 * "지금 브랜치의 버전이 `main`보다 올라 있나". 게이트는 그것으로 머지를 막고
 * 스탠드업은 그것으로 ⚠ `버전 안 올림`을 띄운다. 두 벌이면 한쪽만 고쳐지는 날
 * 게이트가 막는 것과 스탠드업이 알리는 것이 갈린다(`lib/adr-entries.mjs`가 게이트
 * 둘에 대해 하는 일과 같다).
 *
 * **동작은 옮기기 전과 같다** — `check-version.mjs`의 기존 메타테스트
 * (`__tests__/check-version.test.mjs`)가 무수정으로 그것을 증명한다.
 *
 * 실패를 다루는 방식만 부르는 쪽이 정한다: 게이트는 자기 `fail`(빨간 한 줄 +
 * `exit 1`)을 넘기고, 스탠드업은 넘기지 않아 기본값이 `Error`를 던진다 — 스탠드업은
 * 버전 하나 때문에 화면 전체를 못 내면 안 된다.
 *
 * 의존성 없음 · 네트워크 없음(로컬 git ref와 태그만 읽는다).
 */
import { execSync } from "node:child_process";

export const ROOT_PACKAGE = "package.json";

/** `X.Y.Z`. 프리릴리즈 접미사는 쓰지 않는다(ADR-085 ⑦). */
export const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** 기준 브랜치 후보 — 앞에서부터 **있는 것**을 쓴다. */
export const BASE_CANDIDATES = ["origin/main", "main"];

/** 기본 실패: 던진다. 게이트는 자기 `fail`을 넘겨 이 자리를 `exit 1`로 바꾼다. */
function throwFail(message) {
  throw new Error(message);
}

/** git 한 줄. `cwd`를 받는 이유는 테스트와 스탠드업이 표본 레포를 넘기기 때문이다. */
export function sh(cmd, cwd = process.cwd()) {
  return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function parseSemver(value, where, fail = throwFail) {
  const m = SEMVER.exec(String(value ?? ""));
  if (!m) fail(`${where}의 버전이 X.Y.Z 형식이 아닙니다: ${JSON.stringify(value)}\n  프리릴리즈 접미사는 쓰지 않습니다 (ADR-085 ⑦).`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), text: m[0] };
}

export function versionOfJson(source, where, fail = throwFail) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    fail(`${where}을(를) JSON으로 읽을 수 없습니다: ${String(error)}`);
  }
  return parsed.version;
}

/** 기준 브랜치 이름 — 명시값이 있으면 그것, 없으면 있는 후보 하나. */
export function resolveBase(explicit, { cwd = process.cwd(), fail = throwFail } = {}) {
  if (explicit) return explicit;
  for (const candidate of BASE_CANDIDATES) {
    try {
      sh(`git rev-parse --verify --quiet ${candidate}`, cwd);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return fail("기준 브랜치(origin/main 또는 main)를 찾을 수 없습니다. --base <ref>를 넘기세요.");
}

/**
 * 기준 브랜치의 버전 — **분기점이 아니라 기준의 지금 끝(tip)**을 읽는다.
 *
 * 분기점을 읽으면 같은 자리에서 갈라진 브랜치 둘이 **같은 버전을 주장**할 수
 * 있다: 1.0.0에서 갈라진 A와 B가 각각 1.1.0을 달고, A가 머지된 뒤에도 B의
 * 게이트는 여전히 분기점의 1.0.0과 비교해 초록이다. 그러면 `main`에 1.1.0이
 * 두 번 들어오고 태그 하나가 어느 쪽을 가리키는지 알 수 없게 된다. 기준의 끝과
 * 비교하면 B는 리베이스해서 1.2.0으로 올려야 통과한다 — 그것이 의도다.
 *
 * 루트 `package.json`에 `version`이 **아직 없던** 시절(버전 규칙 도입 이전의
 * `main`)에는 그 자리를 `0.0.0`으로 읽지 않고 **기준에서 닿는 가장 큰 `vX.Y.Z`
 * 태그**를 쓴다 — ADR-085 ⑥이 그 커밋을 `v1.0.0` 기준선으로 태그했으므로
 * "찍힌 태그가 그때의 버전"이 사실이고, `0.0.0`으로 읽으면 첫 브랜치가
 * `0.1.0`으로만 올라갈 수 있어 기준선과 어긋난다.
 */
export function baseVersion(baseRef, { cwd = process.cwd(), fail = throwFail } = {}) {
  let source;
  try {
    source = sh(`git show ${baseRef}:${ROOT_PACKAGE}`, cwd);
  } catch {
    fail(`기준(${baseRef})에 ${ROOT_PACKAGE}이 없습니다.`);
  }
  const declared = versionOfJson(source, `기준(${baseRef})의 ${ROOT_PACKAGE}`, fail);
  if (declared !== undefined) {
    return { version: parseSemver(declared, `기준(${baseRef})의 ${ROOT_PACKAGE}`, fail), from: `${ROOT_PACKAGE}` };
  }

  let tags = [];
  try {
    tags = sh(`git tag --merged ${baseRef} --list "v*"`, cwd).split("\n").filter(Boolean);
  } catch {
    tags = [];
  }
  const parsed = tags
    .map((tag) => ({ tag, m: SEMVER.exec(tag.slice(1)) }))
    .filter((e) => e.m)
    .map((e) => ({ tag: e.tag, major: Number(e.m[1]), minor: Number(e.m[2]), patch: Number(e.m[3]), text: e.m[0] }));
  if (parsed.length === 0) {
    return fail(
      `기준(${baseRef})의 ${ROOT_PACKAGE}에 "version"이 없고 닿는 vX.Y.Z 태그도 없어 이전 버전을 알 수 없습니다.\n` +
        `  기준 커밋에 기준선 태그를 찍거나(예: v1.0.0), 기준 브랜치의 ${ROOT_PACKAGE}에 "version"을 넣으세요 (ADR-085 ⑥).`,
    );
  }
  parsed.sort((a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch);
  const highest = parsed[parsed.length - 1];
  return { version: highest, from: `태그 ${highest.tag}` };
}
