#!/usr/bin/env python3
# 사용: showcheck.py <check 결과 json> [본문 최대 글자 수]  — 배달 하나를 사람이 읽을 모양으로 찍는다.
import json,sys
raw=open(sys.argv[1]).read()
lines=[l for l in raw.splitlines() if l.strip() and '"_keepalive"' not in l]
txt="\n".join(lines)
try:
    d=json.loads(txt)
except Exception:
    print(txt[:3000]); raise SystemExit
r=d.get("result",d)
print("delivery:", r.get("deliveryId"), "count:", r.get("count"), "ack:", r.get("acknowledged"), "timedOut:", r.get("timedOut"))
for m in r.get("messages") or []:
    pl=m.get("payload")
    try: pl=json.loads(pl) if isinstance(pl,str) else pl
    except Exception: pass
    print("====", m.get("id"), m.get("type"), "| from", m.get("from_handle"), "| subj:", m.get("subject"))
    print("   payload:", json.dumps(pl,ensure_ascii=False)[:400])
    print("   body:", (m.get("body") or "")[:int(sys.argv[2]) if len(sys.argv)>2 else 1500])
