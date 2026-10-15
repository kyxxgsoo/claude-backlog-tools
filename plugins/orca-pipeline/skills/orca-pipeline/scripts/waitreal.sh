#!/bin/zsh
# 사용: waitreal.sh <출력 json>
# 하트비트만 든 배달은 ack하고 계속 기다린다. 진짜 메시지(worker_done·question·escalation 등)가 든 배달이 오면
# 그 묶음을 출력 파일에 남기고 「REAL <delivery>」를 찍고 끝난다 — ack는 하지 않는다(조율자가 처리 뒤 ack).
# 이 스크립트가 시작한 뒤 limitwatch.sh가 $ORCA_PIPE_STATE/limit-<공급자>.json을 새로 쓰면(사용량 한도) 출력 파일에
# {"type":"limit","files":[…]}를 남기고 「LIMIT <파일>」을 찍고 끝난다 — 이때도 아무것도 ack하지 않는다. REAL과 함께 오면 둘 다 찍는다.
# TIMEOUT은 실패가 아니라 체크포인트다. 다시 띄운다.
# 환경: ORCA_PIPE_STATE, ORCA_PIPE_RUN(없으면 이 터미널에 묶인 런), ORCA_BIN, WAITREAL_MAX_SEC(기본 3000),
#       WAITREAL_POLL_MS(한 번 기다리는 길이, 기본 60000 — 한도 플래그를 이 간격으로 본다)
set -u
STATE=${ORCA_PIPE_STATE:?ORCA_PIPE_STATE를 정한다}
ORCA=${ORCA_BIN:-${ORCA_CLI_COMMAND:-orca}}
HERE=${0:A:h}
OUT=${1:?출력 json 경로}
RUNARG=()
[ -n "${ORCA_PIPE_RUN:-}" ] && RUNARG=(--run $ORCA_PIPE_RUN)
SINCE=$OUT.since
touch $SINCE
trap 'rm -f $SINCE' EXIT
# 시작 뒤에 쓰인(같은 초 포함) 한도 플래그. 지운 플래그(limit-<공급자>.cleared-<ts>.json)는 세지 않는다.
newlimits() {
  local f
  for f in $STATE/limit-*.json(N); do
    [[ $f == *.cleared-* ]] && continue
    [[ $SINCE -nt $f ]] || print -r -- $f
  done
}
deadline=$(( $(date +%s) + ${WAITREAL_MAX_SEC:-3000} ))
while [ $(date +%s) -lt $deadline ]; do
  lims=($(newlimits))
  if (( ${#lims} )); then
    python3 -c 'import json,sys; print(json.dumps({"type":"limit","files":sys.argv[1:]},ensure_ascii=False))' $lims > $OUT
    for f in $lims; do echo "LIMIT $f"; done
    exit 0
  fi
  ${=ORCA} orchestration check $RUNARG --wait --types "worker_done,escalation,question" --timeout-ms ${WAITREAL_POLL_MS:-60000} --json > $OUT.tmp 2>/dev/null
  res=$(python3 $HERE/classify.py $OUT.tmp)
  case "$res" in
    REAL*) mv $OUT.tmp $OUT; echo "$res"; for f in $(newlimits); do echo "LIMIT $f"; done; exit 0 ;;
    HB*) did=${${res#HB }%% *}; ${=ORCA} orchestration check $RUNARG --ack $did --json > /dev/null 2>&1 ;;
    *) sleep 5 ;;
  esac
done
echo "TIMEOUT"
