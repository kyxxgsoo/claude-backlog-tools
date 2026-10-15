#!/bin/zsh
# 사용: limitwatch.sh                                              — 런의 진행 중 작업자 화면에서 사용량 한도 문구를 찾는다(drain.sh가 매 주기 부른다)
#       limitwatch.sh --match-file <파일|-> [--agent codex|claude]  — Orca 없이 매처만 돌린다. 맞으면 JSON 한 줄과 exit 0, 없으면 exit 1
#       limitwatch.sh --flag-receipt <worker-start 결과 json> --agent codex|claude — 기동 실패 receipt의 한도 사유를 플래그로 남긴다
# 한도 문구가 보이면 $ORCA_PIPE_STATE/limit-<공급자>.json을 쓰고 「LIMIT <파일> <dispatch> <문구>」를 찍는다. 이미 플래그된 dispatch는 다시 쓰지 않는다.
# Orca에는 읽기만 한다(worker-list·worker-read). 작업자를 멈추거나 해제하거나 재시도하지 않는다 — 그것은 조율자가 SKILL.md §4.12로 한다.
# 문구 목록은 limitmatch.py의 PATTERNS에 있다.
# 환경: ORCA_PIPE_STATE, ORCA_PIPE_RUN, ORCA_BIN(기본: $ORCA_CLI_COMMAND 또는 orca)
set -u
HERE=${0:A:h}
case "${1:-}" in
  --match-file) shift; exec python3 $HERE/limitmatch.py match "$@" ;;
  --flag-receipt) exec python3 $HERE/limitmatch.py receipt --state ${ORCA_PIPE_STATE:?ORCA_PIPE_STATE를 정한다} --from ${2:?receipt 경로} "${@:3}" ;;
esac
STATE=${ORCA_PIPE_STATE:?ORCA_PIPE_STATE를 정한다}
RUN=${ORCA_PIPE_RUN:?ORCA_PIPE_RUN을 정한다}
ORCA=${ORCA_BIN:-${ORCA_CLI_COMMAND:-orca}}
TMP=$STATE/limitwatch
mkdir -p $TMP
if ! ${=ORCA} orchestration worker-list --run $RUN --json > $TMP/list.json 2>/dev/null; then
  echo "limitwatch: worker-list 실패 — 이번 주기는 건너뛴다"; exit 0
fi
for did in $(python3 $HERE/limitmatch.py targets $TMP/list.json --state $STATE); do
  ${=ORCA} orchestration worker-read --dispatch $did --source terminal --limit 40 --json > $TMP/read-$did.json 2>/dev/null || continue
  python3 $HERE/limitmatch.py flag --state $STATE --from $TMP/read-$did.json
done
