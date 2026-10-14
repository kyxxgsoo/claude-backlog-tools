#!/bin/zsh
# 사용: limitwatch-test.sh — Orca 없이 limitmatch.py·limitwatch.sh·drain.sh·waitreal.sh의 한도 감지를 확인한다.
# 표본 화면(limitwatch-fixtures/)과 가짜 orca(fake-orca.sh)를 쓴다. 상태 폴더는 임시 폴더에 만들고 끝에 지운다.
set -u
T=${0:A:h}
S=${T:h}
F=$T/limitwatch-fixtures
fail=0 n=0
ok() { n=$((n+1)); echo "ok   $1"; }
ng() { n=$((n+1)); fail=$((fail+1)); echo "FAIL $1"; }

# 1. 매처 — 표본마다 (파일, --agent, 기대 공급자 또는 none, 기대 resetHint)
cases=(
  codex-limit.screen.txt          codex  codex  "3:10 PM"
  codex-limit.screen.txt          any    codex  "3:10 PM"
  codex-limit-ascii.screen.txt    codex  codex  "5:07 PM"
  codex-limit.screen.txt          claude none   ""
  claude-reset.screen.txt         claude claude "5pm (Asia/Seoul)"
  claude-5hour.screen.txt         claude claude "5pm"
  claude-hit-limit.screen.txt     claude claude "11pm (Asia/Seoul)"
  claude-epoch.screen.txt         any    claude "1791960000"
  claude-reset.screen.txt         codex  none   ""
  codex-normal.screen.txt         codex  none   ""
  claude-normal.screen.txt        claude none   ""
  claude-statusline.screen.txt    any    none   ""
  quoted-mention.screen.txt       any    none   ""
  read-ctx_codex1.json            codex  codex  "3:10 PM"
  read-ctx_claude1.json           claude none   ""
)
for f a want hint in "${cases[@]}"; do
  out=$($S/limitwatch.sh --match-file $F/$f --agent $a); rc=$?
  if [ $want = none ]; then
    [ $rc = 1 ] && [ -z "$out" ] && ok "match $f --agent $a → 없음" || ng "match $f --agent $a → 없음이어야 하는데 rc=$rc $out"
  else
    got=$(print -r -- $out | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["provider"]+"|"+(d["resetHint"] or ""))' 2>/dev/null)
    [ $rc = 0 ] && [ "$got" = "$want|$hint" ] && ok "match $f --agent $a → $got" || ng "match $f --agent $a → 기대 $want|$hint, 받음 rc=$rc $got"
  fi
done
# 접힌 줄을 이었는지
line=$($S/limitwatch.sh --match-file $F/codex-limit.screen.txt --agent codex | python3 -c 'import json,sys; print(json.load(sys.stdin)["line"])')
[[ $line == *"codex/settings/usage"*"try again at 3:10 PM."* ]] && ok "접힌 줄 잇기" || ng "접힌 줄 잇기: $line"

# 2. 스캔 — 가짜 orca로 런을 훑는다
ST=$(mktemp -d /private/tmp/claude-501/limitwatch-test.XXXXXX)
trap 'rm -rf $ST' EXIT
export ORCA_PIPE_STATE=$ST ORCA_PIPE_RUN=run_fixture ORCA_BIN=$T/fake-orca.sh FAKE_ORCA_DIR=$F FAKE_ORCA_LOG=$ST/calls.log
out=$($S/limitwatch.sh)
[[ $out == "LIMIT $ST/limit-codex.json ctx_codex1 "* ]] && ok "스캔: codex 플래그" || ng "스캔 출력: $out"
[ ! -e $ST/limit-claude.json ] && ok "스캔: 정상 claude 작업자는 플래그 없음" || ng "limit-claude.json이 생겼다"
python3 - $ST/limit-codex.json <<'PY' && ok "플래그 필드" || ng "플래그 필드"
import json,sys
d=json.load(open(sys.argv[1]))
need={"provider":"codex","dispatch":"ctx_codex1","terminal":"term_ctx_codex1","task":"task_ctx_codex1","resetHint":"3:10 PM"}
assert all(d.get(k)==v for k,v in need.items()), d
assert d["detectedAt"] and "usage limit" in d["line"] and d["earlier"]==[]
PY
grep -q ctx_done $ST/calls.log && ng "끝난 작업자(ctx_done)를 읽었다" || ok "끝난 작업자는 읽지 않음"
m1=$(stat -f %m $ST/limit-codex.json); sleep 1
out=$($S/limitwatch.sh)
[ -z "$out" ] && [ $(stat -f %m $ST/limit-codex.json) = $m1 ] && ok "같은 dispatch는 다시 안 씀" || ng "멱등 아님: $out"
mv $ST/limit-codex.json $ST/limit-codex.cleared-20261014T1510.json
out=$($S/limitwatch.sh)
[ -z "$out" ] && [ ! -e $ST/limit-codex.json ] && ok "지운 플래그의 dispatch도 다시 안 씀" || ng "지운 뒤 다시 씀: $out"
grep -vE '^orchestration (worker-list|worker-read) ' $ST/calls.log && ng "읽기 아닌 orca 명령을 불렀다" || ok "Orca에는 읽기만(worker-list·worker-read)"

# 3. drain.sh가 limitwatch를 부른다(빈 배달 → ack 없음)
rm -f $ST/limit-*.json $ST/calls.log
out=$(FAKE_CHECK_SLEEP=0 $S/drain.sh)
[[ $out == EMPTY*LIMIT* ]] && [ -e $ST/limit-codex.json ] && ok "drain.sh 한 주기에 limitwatch" || ng "drain.sh: $out"
grep -q -- '--ack' $ST/calls.log && ng "drain.sh가 ack했다" || ok "drain.sh: ack 없음"
out=$(ORCA_BIN=/usr/bin/false $S/drain.sh; echo "rc=$?")
[[ $out == *"limitwatch: worker-list 실패"*"rc=0" ]] && ok "limitwatch 실패해도 drain.sh는 끝까지" || ng "실패 처리: $out"

# 4. waitreal.sh — 시작 전 플래그는 무시, 시작 뒤 플래그면 LIMIT으로 끝난다
touch -t 202610140000 $ST/limit-codex.json
out=$(WAITREAL_MAX_SEC=3 $S/waitreal.sh $ST/out1.json)
[ "$out" = TIMEOUT ] && ok "waitreal: 시작 전 플래그는 깨우지 않음" || ng "waitreal 옛 플래그: $out"
( sleep 2; echo '{"provider":"claude"}' > $ST/limit-claude.json ) &
s0=$(date +%s)
out=$(WAITREAL_MAX_SEC=30 $S/waitreal.sh $ST/out2.json)
el=$(( $(date +%s) - s0 ))
[ "$out" = "LIMIT $ST/limit-claude.json" ] && (( el < 10 )) && ok "waitreal: 새 플래그로 ${el}초 만에 LIMIT" || ng "waitreal 새 플래그: $out (${el}s)"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d=={"type":"limit","files":[sys.argv[2]]}, d' $ST/out2.json $ST/limit-claude.json \
  && ok "waitreal 출력 파일 표지" || ng "waitreal 출력 파일: $(cat $ST/out2.json)"
[ ! -e $ST/out2.json.since ] && ok "waitreal 표지 파일 정리" || ng "out2.json.since가 남았다"
grep -q -- '--ack' $ST/calls.log && ng "waitreal가 ack했다" || ok "waitreal: ack 없음"
mv $ST/limit-claude.json $ST/limit-claude.cleared-1.json; touch $ST/limit-claude.cleared-1.json
out=$(WAITREAL_MAX_SEC=3 $S/waitreal.sh $ST/out3.json)
[ "$out" = TIMEOUT ] && ok "waitreal: 지운 플래그는 세지 않음" || ng "waitreal 지운 플래그: $out"

# 5. 기동 실패 receipt
out=$($S/limitwatch.sh --flag-receipt $F/start-receipt-limit.json --agent codex); rc=$?
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["dispatch"]=="ctx_start1" and d["resetHint"]=="9:30 PM" and d["source"]=="worker-start receipt" and len(d["earlier"])==1, d' $ST/limit-codex.json \
  && [ $rc = 0 ] && ok "receipt → 플래그(앞 플래그는 earlier로)" || ng "receipt: rc=$rc $out"
$S/limitwatch.sh --flag-receipt $F/read-ctx_claude1.json --agent claude > /dev/null; [ $? = 1 ] && ok "한도 사유 없는 receipt → exit 1" || ng "정상 receipt가 플래그됐다"

echo "--- $((n-fail))/$n 통과"
(( fail == 0 ))
