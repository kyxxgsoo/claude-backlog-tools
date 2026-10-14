#!/usr/bin/env python3
"""작업자 화면에서 사용량 한도 문구를 찾는다. limitwatch.sh가 부른다. 문구 목록은 이 파일의 PATTERNS 한 곳에만 둔다.

  match <파일|-> [--agent codex|claude|any]
      글(또는 worker-read JSON)에서 한도 문구를 찾는다. 맞으면 JSON 한 줄을 찍고 exit 0, 없으면 exit 1.
  targets <worker-list json> [--state <상태 폴더>]
      진행 중(outcome=in_progress)인 작업자의 dispatch id를 한 줄씩 찍는다. 이미 플래그된 dispatch는 뺀다.
  flag --state <상태 폴더> --from <worker-read json>
      화면 꼬리에 한도 문구가 있으면 <상태 폴더>/limit-<공급자>.json을 쓰고 「LIMIT <파일>」을 찍는다.
  receipt --state <상태 폴더> --from <worker-start 결과 json> --agent codex|claude
      기동 실패 receipt의 글 전체에서 한도 문구를 찾아 같은 플래그를 쓴다. 맞으면 exit 0, 없으면 exit 1.

플래그는 공급자마다 파일 하나다. 같은 dispatch는 두 번 쓰지 않는다(지운 플래그 limit-<공급자>.cleared-<ts>.json에 있어도).
"""
import datetime, glob, json, os, re, sys

# 공급자별 한도 문구. 줄 머리(앞의 공백·■·⎿·│ 같은 기호 몇 개는 건너뛴다)에서만 맞춘다 — 문서·diff 안에 인용된 문구를 잡지 않게.
# 새 문구는 여기에만 더한다. 대소문자는 가리지 않는다. 아포스트로피는 ' 와 ’ 둘 다 온다.
PATTERNS = {
    "codex": [
        r"you['’]ve (?:hit|reached) your (?:\w+ )?usage limit",  # ■ You’ve hit your usage limit. … try again at 3:10 PM.
    ],
    "claude": [
        r"claude(?: ai)? usage limit reached",  # Claude usage limit reached. Your limit will reset at 5pm (Asia/Seoul). / Claude AI usage limit reached|1791960000
        r"(?:5-hour|session|weekly|opus weekly|opus|sonnet weekly) limit reached",  # 5-hour limit reached ∙ resets 5pm
        r"you['’]ve hit your (?:session |weekly |opus |5-hour )?limit\b",  # You've hit your limit · resets 5pm (Asia/Seoul)
    ],
}
LEAD = r"^[^\w'’]{0,8}"
RESET = [
    re.compile(r"(?:try again at|will reset at|resets? at|resets)\s+(.+?)(?:\.\s|\.$|$)", re.I),
    re.compile(r"\|(\d{10})\b"),
]
TAIL_LINES = 25  # 화면 맨 아래 몇 줄만 본다(지금 상태). 위쪽 스크롤은 지난 일이다.
SECRET = re.compile(r"(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,})")
COMPILED = {p: [re.compile(LEAD + rx, re.I) for rx in rxs] for p, rxs in PATTERNS.items()}


def load_lines(path):
    raw = sys.stdin.read() if path == "-" else open(path, encoding="utf-8", errors="replace").read()
    try:
        d = json.loads(raw)
    except Exception:
        return raw.splitlines(), None
    r = d.get("result", d) if isinstance(d, dict) else {}
    term = r.get("terminal") if isinstance(r, dict) else None
    if isinstance(term, dict) and isinstance(term.get("tail"), list):
        return [str(x) for x in term["tail"]], r
    return list(strings(d)), r


def strings(o):
    """JSON 안의 글을 모두 줄로 편다(receipt·transcript용)."""
    if isinstance(o, str):
        yield from o.splitlines()
    elif isinstance(o, dict):
        for v in o.values():
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)


def find(o, key):
    """JSON 어디든 처음 나오는 key의 글 값."""
    if isinstance(o, dict):
        if isinstance(o.get(key), str):
            return o[key]
        o = list(o.values())
    if isinstance(o, list):
        for v in o:
            x = find(v, key)
            if x:
                return x
    return None


def clean(s):
    s = re.sub(r"[\x00-\x1f\x7f]", "", s).strip()
    return SECRET.sub("[가림]", s)[:300]


def match(lines, agent="any", tail=TAIL_LINES):
    lines = [l for l in lines if l.strip()]
    if tail:
        lines = lines[-tail:]
    provs = list(COMPILED) if agent in ("any", "", None) else [agent]
    for i, l in enumerate(lines):
        for p in provs:
            if any(rx.search(l) for rx in COMPILED.get(p, [])):
                text = l.strip()
                # 화면 폭에서 접힌 줄을 잇는다 — 문장이 안 끝났고 다음 줄이 들여쓰기·기호 없이 0열에서 시작하면(최대 2줄).
                for nxt in lines[i + 1:i + 3]:
                    if re.search(r"[.!?)]$", text) or not re.match(r"[\w(]", nxt):
                        break
                    text += nxt.strip() if text.endswith("/") else " " + nxt.strip()
                return {"provider": p, "line": clean(text), "resetHint": reset_hint(text)}
    return None


def reset_hint(text):
    for rx in RESET:
        m = rx.search(text)
        if m:
            return clean(m.group(1))
    return None


def now():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def flagged(state, did):
    for f in glob.glob(os.path.join(state, "limit-*.json")):
        try:
            d = json.load(open(f))
        except Exception:
            continue
        if did and (d.get("dispatch") == did or did in [x.get("dispatch") for x in d.get("earlier", [])]):
            return True
    return False


def write_flag(state, hit, meta):
    path = os.path.join(state, "limit-%s.json" % hit["provider"])
    entry = dict(provider=hit["provider"], **meta, line=hit["line"], resetHint=hit["resetHint"], detectedAt=now())
    earlier = []
    if os.path.exists(path):
        try:
            old = json.load(open(path))
            earlier = old.pop("earlier", []) + [old]
        except Exception:
            pass
    entry["earlier"] = earlier
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(entry, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)
    print("LIMIT %s %s %s" % (path, meta.get("dispatch"), hit["line"][:120]))


def args(argv):
    out, pos, i = {}, [], 0
    while i < len(argv):
        if argv[i].startswith("--") and i + 1 < len(argv):
            out[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            pos.append(argv[i])
            i += 1
    return out, pos


def main():
    cmd, (opt, pos) = sys.argv[1], args(sys.argv[2:])
    if cmd == "match":
        lines, _ = load_lines(pos[0] if pos else "-")
        hit = match(lines, opt.get("agent", "any"))
        if hit:
            print(json.dumps(hit, ensure_ascii=False))
        sys.exit(0 if hit else 1)
    if cmd == "targets":
        d = json.load(open(pos[0]))
        for w in (d.get("result") or {}).get("workers") or []:
            p = w.get("projection") or {}
            did = w.get("dispatchId")
            if p.get("outcome") == "in_progress" and did and not (opt.get("state") and flagged(opt["state"], did)):
                print(did)
        return
    if cmd == "flag":
        lines, r = load_lines(opt["from"])
        r = r or {}
        p = r.get("projection") or {}
        prov = (p.get("provider") or {}).get("id") or "any"
        did = r.get("dispatchId") or p.get("dispatchId")
        if flagged(opt["state"], did):
            return
        hit = match(lines, prov)
        if hit:
            meta = dict(dispatch=did, terminal=(r.get("terminal") or {}).get("handle"), task=p.get("taskId"),
                        run=p.get("runId"), model=(p.get("provider") or {}).get("model"), source="worker-read --source terminal")
            write_flag(opt["state"], hit, meta)
        return
    if cmd == "receipt":
        lines, r = load_lines(opt["from"])
        hit = match(lines, opt.get("agent", "any"), tail=0)
        if not hit:
            sys.exit(1)
        d = json.load(open(opt["from"])) if r is not None else {}
        write_flag(opt["state"], hit, dict(dispatch=find(d, "dispatchId") or "start-failed", terminal=find(d, "terminalHandle"),
                                           task=find(d, "taskId"), run=find(d, "runId"), model=None, source="worker-start receipt"))
        return
    sys.exit("모르는 명령: %s" % cmd)


if __name__ == "__main__":
    main()
