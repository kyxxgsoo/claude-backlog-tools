#!/bin/zsh
# 사용: waitreal.sh <출력 json>
# 하트비트만 든 배달은 ack하고 계속 기다린다. 진짜 메시지(worker_done·question·escalation 등)가 든 배달이 오면
# 그 묶음을 출력 파일에 남기고 「REAL <delivery>」를 찍고 끝난다 — ack는 하지 않는다(조율자가 처리 뒤 ack).
# TIMEOUT은 실패가 아니라 체크포인트다. 다시 띄운다.
# 환경: ORCA_PIPE_STATE, ORCA_PIPE_RUN(없으면 이 터미널에 묶인 런), ORCA_BIN, WAITREAL_MAX_SEC(기본 3000)
set -u
: ${ORCA_PIPE_STATE:?ORCA_PIPE_STATE를 정한다}
ORCA=${ORCA_BIN:-${ORCA_CLI_COMMAND:-orca}}
HERE=${0:A:h}
OUT=${1:?출력 json 경로}
RUNARG=()
[ -n "${ORCA_PIPE_RUN:-}" ] && RUNARG=(--run $ORCA_PIPE_RUN)
deadline=$(( $(date +%s) + ${WAITREAL_MAX_SEC:-3000} ))
while [ $(date +%s) -lt $deadline ]; do
  ${=ORCA} orchestration check $RUNARG --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json > $OUT.tmp 2>/dev/null
  res=$(python3 $HERE/classify.py $OUT.tmp)
  case "$res" in
    REAL*) mv $OUT.tmp $OUT; echo "$res"; exit 0 ;;
    HB*) did=${${res#HB }%% *}; ${=ORCA} orchestration check $RUNARG --ack $did --json > /dev/null 2>&1 ;;
    *) sleep 5 ;;
  esac
done
echo "TIMEOUT"
