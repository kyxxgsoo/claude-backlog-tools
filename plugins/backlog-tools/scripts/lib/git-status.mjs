/**
 * 스탠드업이 묻는 **로컬 git 사실들** (ADR-093 ①).
 *
 * 지금 어느 브랜치인가, `origin`보다 앞섰나 뒤졌나, 커밋 안 한 것이 몇 개인가,
 * `main` 대비 몇 커밋인가, 그 태그가 로컬에 있나 — 스탠드업의 「지금 브랜치」와
 * 「완료된 것」이 읽는 것 전부다.
 *
 * **네트워크를 쓰지 않는다.** `git fetch`를 절대 부르지 않고 이미 받아 둔
 * `refs/remotes/origin/*`만 읽는다 — 스탠드업은 1초 안에 떠야 하고(ADR-093 ①),
 * 원격을 다녀오는 순간 그 약속이 깨진다. 그래서 "앞/뒤"는 **마지막으로 받아 온
 * 시점 기준**이라는 것을 부르는 쪽이 안다. 원격 ref 자체가 없으면 `원격 없음`이다.
 *
 * 모든 함수가 `cwd`를 받는다 — 테스트가 표본 레포를 넘기고 스탠드업이 `--root`를
 * 넘긴다. 실패는 던지지 않고 **모른다는 값**(`undefined`·빈 배열)으로 돌아온다:
 * 스탠드업은 git 하나가 대답을 안 해도 나머지 세 블록을 내야 한다.
 *
 * 의존성 없음.
 */
import { execFileSync } from "node:child_process";

/** 미커밋 목록에서 화면에 이름까지 보여 줄 개수. 나머지는 수로만 센다. */
export const SHOWN_PATHS = 3;

/** git 한 줄. 실패하면 `undefined` — 부르는 쪽이 "모른다"로 다룬다. */
export function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\n$/, "");
  } catch {
    return undefined;
  }
}

/** 지금 브랜치 이름. 분리된 HEAD면 `HEAD`, 저장소가 아니면 `undefined`. */
export function currentBranch(cwd) {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)?.trim() || undefined;
}

/** 그 ref가 로컬에 있나. `origin/main`도 태그도 이걸로 본다. */
export function refExists(ref, cwd) {
  return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd) !== undefined;
}

/**
 * `origin/<브랜치>` 대비 앞/뒤 커밋 수.
 *
 * 원격 ref가 없으면 `undefined`를 돌려준다 — 스탠드업은 그것을 `원격 없음`으로
 * 찍는다. **받아 오지 않는다**: 여기서 `git fetch`를 부르면 스탠드업이 네트워크에
 * 걸려 멈춘다.
 */
export function aheadBehindOrigin(branch, cwd) {
  if (!branch || branch === "HEAD") return undefined;
  const remote = `origin/${branch}`;
  if (!refExists(remote, cwd)) return undefined;
  const out = git(["rev-list", "--left-right", "--count", `${remote}...HEAD`], cwd);
  if (out === undefined) return undefined;
  const [behind, ahead] = out.trim().split(/\s+/).map(Number);
  return { ahead: ahead ?? 0, behind: behind ?? 0 };
}

/**
 * 커밋 안 한 것 — 개수와 **첫 세 경로**.
 *
 * `git status --porcelain`을 그대로 읽는다: 추적하지 않는 파일(`??`)도 뺀 것이
 * 없다. 스탠드업이 말해야 하는 것은 "지금 트리가 깨끗한가"이고, 새로 만든 파일이
 * 빠지면 브랜치를 막 시작한 상태가 깨끗해 보인다.
 */
export function uncommitted(cwd) {
  const out = git(["status", "--porcelain"], cwd);
  if (out === undefined) return { count: 0, paths: [] };
  const lines = out.split("\n").filter((line) => line.trim());
  // `XY 경로` 또는 `XY 옛 -> 새`. 화면에 필요한 것은 지금 이름이다.
  const paths = lines.map((line) => {
    const path = line.slice(3).trim();
    const arrow = path.lastIndexOf(" -> ");
    return arrow >= 0 ? path.slice(arrow + 4) : path;
  });
  return { count: paths.length, paths: paths.slice(0, SHOWN_PATHS) };
}

/** 기준 브랜치(`origin/main` 우선, 없으면 `main`) 대비 앞선 커밋 수. 기준에 서 있으면 0이고, 기준이 없으면 `undefined`. */
export function commitsAheadOfBase(branch, cwd, baseRef = "main") {
  if (branch === baseRef) return 0;
  if (!refExists(baseRef, cwd)) return undefined;
  const out = git(["rev-list", "--count", `${baseRef}..HEAD`], cwd);
  return out === undefined ? undefined : Number(out.trim());
}

/** 로컬에 그 태그가 있나 — 머지됐지만 릴리즈 안 된 버전을 잡는다(ADR-093 ①). */
export function tagExists(tag, cwd) {
  const out = git(["tag", "-l", tag], cwd);
  return Boolean(out && out.trim());
}

/**
 * 브랜치 이름에서 뽑은 slug — `feature/x`·`hotfix/x` → `x`.
 *
 * 대기 줄의 맥락(`x 작업 중 들어옴`, `backlog.mjs`의 `deriveContext`가 적은 것)과
 * 맞춰 "이 브랜치에서 들어온 요구"를 고르는 데 쓴다. 그 밖의 브랜치는 `undefined`
 * — `main`의 slug를 만들면 아무 줄에나 걸린다.
 */
export function branchSlug(branch) {
  const m = /^(?:feature|hotfix)\/(.+)$/.exec(String(branch ?? ""));
  return m ? m[1] : undefined;
}

/**
 * 이 명령이 **도는 곳**의 저장소 뿌리 — 기준은 언제나 `cwd`다.
 *
 * 원본(Karvis)은 스크립트 위치(`import.meta.url`)에서 뿌리를 잡았다. 스크립트가
 * 그 저장소 안에 살 때는 그것이 맞지만, 플러그인으로 설치되면 스크립트는
 * **플러그인 캐시** 안에 있다 — 그 기준으로 `docs/BACKLOG.md`를 찾으면 사용자가
 * 서 있는 저장소가 아니라 캐시를 뒤진다.
 *
 * git 저장소가 아니면 `process.cwd()`를 그대로 쓴다(백로그 문서만 있으면 도는
 * 것이 맞다 — 이 도구는 git을 요구하지 않는다). `--root`는 언제나 이보다 앞선다.
 */
export function repoRoot(cwd = process.cwd()) {
  return git(["rev-parse", "--show-toplevel"], cwd)?.trim() || cwd;
}
