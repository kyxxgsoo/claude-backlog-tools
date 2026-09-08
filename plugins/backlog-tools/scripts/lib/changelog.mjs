/**
 * `docs/CHANGELOG.md`의 절을 읽는 파서 — 버전 게이트(`check-version.mjs`,
 * ADR-085 ④)와 릴리스 스크립트(`release-notes.mjs`, ADR-086 ①)가 "한 버전의
 * 절"을 같은 방식으로 잘라야 한다. 한쪽만 고쳐지면 게이트가 통과시킨 모양과
 * 릴리스가 뽑아내는 모양이 갈린다.
 *
 * 의존성 없음.
 */

/** 항목 머리 `## vX.Y.Z — YYYY-MM-DD`. 날짜 뒤의 `· 기준선` 같은 꼬리표는 허용한다. */
export const CHANGELOG_HEADING = /^##\s+v(\d+\.\d+\.\d+)\s+—\s+(\d{4}-\d{2}-\d{2})\b/;

/**
 * 변경 기록 전체 → 절 배열(맨 위가 [0]) — 각 절은 그 `## ` 머리부터 **다음**
 * `## ` 앞까지다. `heading`은 머리 줄 원문, `body`는 그 사이 본문 원문,
 * `version`·`date`는 머리가 `CHANGELOG_HEADING`과 맞을 때만 채워진다.
 */
export function changelogSections(changelog) {
  const lines = changelog.split("\n");
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) starts.push(i);
  }
  return starts.map((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
    const heading = lines[start];
    const body = lines.slice(start + 1, end).join("\n");
    const m = CHANGELOG_HEADING.exec(heading);
    return { heading, body, version: m ? m[1] : undefined, date: m ? m[2] : undefined };
  });
}

/** 맨 위 항목(머리 + 본문). 항목이 하나도 없으면 undefined. */
export function topEntry(changelog) {
  const [first] = changelogSections(changelog);
  return first ? { heading: first.heading, body: first.body } : undefined;
}

/** 특정 버전(`X.Y.Z`, `v` 없이)의 절. 없으면 undefined. */
export function sectionForVersion(changelog, version) {
  return changelogSections(changelog).find((s) => s.version === version);
}
