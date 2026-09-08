/**
 * `docs/ADR.md`의 항목을 읽는 파서 — **게이트 둘이 같은 표기를 읽어야** 한다.
 *
 * ADR 게이트(`check-adr.mjs`)는 "이 브랜치가 새 ADR을 더했나"를 묻고, 버전
 * 게이트(`check-version.mjs`, ADR-085 ④)는 "변경 기록의 맨 위 항목이 그 새 ADR
 * 번호를 전부 가리키나"를 묻는다. 둘이 정규식을 따로 들고 있으면 한쪽만 고쳐지는
 * 날 서로 다른 것을 "새 항목"으로 보고, 그때 게이트는 초록인 채로 거짓말을 한다.
 * `release-notes.mjs`(ADR-086)는 같은 파서로 항목의 **GitHub 앵커**까지 뽑는다.
 *
 * 의존성 없음 — 세 스크립트 모두 빌드 없이 도는 것이 조건이다.
 */
import { githubHeadingAnchor } from "./github-anchor.mjs";

/** `### ADR-NNN: 제목` 한 줄. 번호와 제목을 뽑는다. */
export const ADR_HEADING_ALL = /^### ADR-(\d{3}):\s*(.+)$/gm;

/** 문서 전체 → `번호 → 제목` 맵. `matchAll`은 정규식을 복제하므로 lastIndex는 오염되지 않는다. */
export function adrEntries(text) {
  const out = new Map();
  for (const m of text.matchAll(ADR_HEADING_ALL)) out.set(Number(m[1]), m[2].trim());
  return out;
}

/** 기준 대비 **새로 생긴** ADR 번호들(오름차순). 편집된 기존 항목은 새 항목이 아니다. */
export function addedAdrNumbers(baseText, headText) {
  const before = adrEntries(baseText);
  const after = adrEntries(headText);
  return [...after.keys()].filter((n) => !before.has(n)).sort((a, b) => a - b);
}

/** 번호 → `ADR-085` 표기. 메시지와 변경 기록 본문이 같은 글자를 쓰게 한다. */
export function adrTag(n) {
  return `ADR-${String(n).padStart(3, "0")}`;
}

/**
 * 문서 전체 → `번호 → GitHub 앵커` 맵 (ADR-086 ①). 앵커는 실제 헤딩 줄
 * (`### ADR-NNN: 제목`)에서 레벨 표시(`### `)만 뗀 나머지로 계산한다 — GitHub이
 * 앵커를 만들 때 보는 것이 그 줄 전체(번호 포함)이지 제목만이 아니기 때문이다.
 */
export function adrAnchors(text) {
  const out = new Map();
  for (const [n, title] of adrEntries(text)) out.set(n, githubHeadingAnchor(`${adrTag(n)}: ${title}`));
  return out;
}
