#!/bin/zsh
# 맨 앞 배달이 하트비트만이면 ack하고 다음을 본다(최대 40번). 하트비트가 아닌 메시지가 든 배달을 만나면
# 손대지 않고 STOP을 찍고 끝난다 — 그것은 조율자가 waitreal.sh로 받아 처리한다.
# 끝에 limitwatch.sh로 작업자 화면의 사용량 한도 문구를 본다(읽기만). ORCA_PIPE_LIMITWATCH=0이면 건너뛴다. 실패해도 drain 결과는 그대로다.
# 환경: ORCA_PIPE_STATE(상태 폴더), ORCA_PIPE_RUN(런 id), ORCA_BIN(기본: $ORCA_CLI_COMMAND 또는 orca)
set -u
STATE=${ORCA_PIPE_STATE:?ORCA_PIPE_STATE를 정한다}
RUN=${ORCA_PIPE_RUN:?ORCA_PIPE_RUN을 정한다}
ORCA=${ORCA_BIN:-${ORCA_CLI_COMMAND:-orca}}
HERE=${0:A:h}
for i in $(seq 1 40); do
  ${=ORCA} orchestration check --run $RUN --json > $STATE/drain-cur.json 2>&1
  res=$(python3 $HERE/classify.py $STATE/drain-cur.json)
  case "$res" in
    HB*) did=${${res#HB }%% *}; echo "$res"; ${=ORCA} orchestration check --run $RUN --ack $did --json > /dev/null 2>&1 ;;
    REAL*) echo "STOP ${res#REAL }"; break ;;
    *) echo "$res"; break ;;
  esac
done
[ "${ORCA_PIPE_LIMITWATCH:-1}" = 0 ] || $HERE/limitwatch.sh || echo "limitwatch exit $?"
