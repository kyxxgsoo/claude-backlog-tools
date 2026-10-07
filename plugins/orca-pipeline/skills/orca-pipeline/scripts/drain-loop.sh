#!/bin/zsh
# 45초마다 drain.sh를 돈다. $ORCA_PIPE_STATE/drain.stop 파일이 생기면 끝난다(최대 DRAIN_MAX_HOURS, 기본 8시간).
# 백그라운드로 띄운다. 로그: $ORCA_PIPE_STATE/drain-loop.log
set -u
STATE=${ORCA_PIPE_STATE:?ORCA_PIPE_STATE를 정한다}
: ${ORCA_PIPE_RUN:?ORCA_PIPE_RUN을 정한다}
HERE=${0:A:h}
end=$(( $(date +%s) + ${DRAIN_MAX_HOURS:-8}*3600 ))
rm -f $STATE/drain.stop
while [ ! -f $STATE/drain.stop ] && [ $(date +%s) -lt $end ]; do
  $HERE/drain.sh >> $STATE/drain-loop.log 2>&1
  sleep 45
done
echo "drain loop ended $(date)" >> $STATE/drain-loop.log
