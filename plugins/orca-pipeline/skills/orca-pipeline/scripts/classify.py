#!/usr/bin/env python3
"""check 결과 JSON 한 개를 분류해 한 줄로 찍는다.

  EMPTY                         배달 없음
  HB <delivery> <ctx:phase,..>  하트비트만 든 배달(ack해도 된다)
  REAL <delivery>               하트비트가 아닌 메시지가 든 배달(조율자가 처리 뒤 ack)
  ERR                           JSON을 못 읽음

출력 파일에 _keepalive 줄이 섞여 있어도 마지막 result 객체를 쓴다.
"""
import json, sys

raw = open(sys.argv[1]).read()
dec = json.JSONDecoder()
i, last = 0, None
while i < len(raw):
    j = raw.find("{", i)
    if j < 0:
        break
    try:
        obj, end = dec.raw_decode(raw, j)
        i = end
    except Exception:
        i = j + 1
        continue
    if isinstance(obj, dict) and "result" in obj:
        last = obj
if not last:
    print("ERR")
    sys.exit()
r = last["result"]
msgs = r.get("messages") or []
did = r.get("deliveryId")
if not msgs:
    print("EMPTY")
    sys.exit()


def payload(m):
    p = m.get("payload")
    if isinstance(p, str):
        try:
            p = json.loads(p)
        except Exception:
            p = {}
    return p or {}


if all(m.get("type") == "heartbeat" for m in msgs):
    tags = ",".join("%s:%s" % (payload(m).get("dispatchId", ""), payload(m).get("phase", "")) for m in msgs)
    print("HB %s %s" % (did, tags))
else:
    print("REAL %s" % did)
