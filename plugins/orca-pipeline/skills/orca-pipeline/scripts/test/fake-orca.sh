#!/bin/zsh
# 테스트용 가짜 orca — 읽기 명령만 흉내 낸다. 표본: $FAKE_ORCA_DIR. 받은 명령은 $FAKE_ORCA_LOG에 한 줄씩 남긴다.
D=${FAKE_ORCA_DIR:?}
echo "$*" >> ${FAKE_ORCA_LOG:-/dev/null}
case "$1 $2" in
  "orchestration worker-list") cat $D/worker-list.json ;;
  "orchestration worker-read") did=${${(M)@:#ctx_*}[1]}; cat $D/read-$did.json ;;
  "orchestration check") sleep ${FAKE_CHECK_SLEEP:-1}; echo '{"id":"x","ok":true,"result":{"messages":[],"deliveryId":null}}' ;;
  *) echo "fake orca: 모르는 명령 $*" >&2; exit 2 ;;
esac
