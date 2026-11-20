"""Who wakes the API containers? Past events from Workers Observability, then live requests from `wrangler tail`.
Usage: api_wakeups.py past <hours> | api_wakeups.py live <file.json> <name>"""
import json, os, sys, time, urllib.request, collections

SERVICES = ["shubix-api-qa", "shubix-api-uat", "shubix-api"]

def flat(d, pre=""):
    out = {}
    if isinstance(d, dict):
        for k, v in d.items(): out.update(flat(v, f"{pre}{k}."))
    elif isinstance(d, list):
        out[pre[:-1]] = json.dumps(d)[:300]
    else:
        out[pre[:-1]] = d
    return out

def pick(f, *ends):
    for k, v in f.items():
        kl = k.lower()
        if any(kl.endswith(e) for e in ends) and v not in (None, ""): return v
    return ""

def past(hours):
    acct, tok = os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"]
    now = int(time.time() * 1000)
    for svc in SERVICES:
        print(f"\n================ {svc}: last {hours} h ================")
        body = {"queryId": f"wakeups-{svc}", "timeframe": {"from": now - int(float(hours) * 3600_000), "to": now},
                "view": "events", "limit": 500,
                "parameters": {"datasets": ["cloudflare-workers"], "filterCombination": "and",
                               "filters": [{"key": "$metadata.service", "operation": "eq", "type": "string", "value": svc}]}}
        req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{acct}/workers/observability/telemetry/query",
                                     data=json.dumps(body).encode(), method="POST",
                                     headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
        try:
            res = json.load(urllib.request.urlopen(req, timeout=60))
        except Exception as e:
            msg = getattr(e, "read", lambda: b"")().decode()[:500]
            print(f"Observability query failed ({e}). {msg}\n(The token may not have 'Workers Observability: Read'; the live watch below still works.)")
            continue
        evs = (((res.get("result") or {}).get("events") or {}).get("events")) or []
        print(f"{len(evs)} events (newest first, up to 500)")
        if evs: print("fields of one event:", ", ".join(sorted(flat(evs[0]).keys()))[:1500])
        paths, uas, rows = collections.Counter(), collections.Counter(), []
        for e in evs:
            f = flat(e)
            ts = e.get("timestamp") or pick(f, "timestamp")
            try: t = time.strftime("%m-%d %H:%M:%S", time.gmtime(int(ts) / 1000))
            except Exception: t = str(ts)
            url = pick(f, "request.url", ".url")
            path = url.split("://", 1)[-1].split("/", 1)[-1] if url else ""
            ua = pick(f, "user-agent", "useragent")
            st = pick(f, "statuscode", "response.status", "outcome")
            msg = str(pick(f, "$metadata.message", ".message"))[:140]
            if path: paths["/" + path.split("?")[0]] += 1
            if ua: uas[str(ua)[:120]] += 1
            rows.append(f"{t}Z  {st!s:>4}  /{path[:70]:<70}  {str(ua)[:60]:<60}  {msg}")
        print("\n-- requests per path --");  [print(f"{n:5}  {p}") for p, n in paths.most_common(40)]
        print("\n-- requests per user-agent --");  [print(f"{n:5}  {u}") for u, n in uas.most_common(20)]
        print("\n-- events (newest first; UTC; IST = UTC+5:30) --"); [print(r) for r in rows[:300]]

def live(path, name):
    txt = open(path, errors="replace").read()
    dec, i, n = json.JSONDecoder(), 0, 0
    print(f"\n================ {name}: live requests ================")
    while i < len(txt):
        j = txt.find("{", i)
        if j < 0: break
        try: obj, i = dec.raw_decode(txt, j)
        except ValueError: i = j + 1; continue
        ev = obj.get("event") or {}
        rq = ev.get("request") or {}
        h = rq.get("headers") or {}
        ts = obj.get("eventTimestamp")
        t = time.strftime("%H:%M:%S", time.gmtime(ts / 1000)) if ts else "?"
        url = rq.get("url", "") or ("(alarm/scheduled) " + str(list(ev.keys())))
        st = (ev.get("response") or {}).get("status", obj.get("outcome", ""))
        ua = h.get("user-agent", "")
        where = (rq.get("cf") or {}).get("country", "")
        logs = " | ".join(" ".join(map(str, l.get("message", []))) for l in obj.get("logs", []))[:200]
        print(f"{t}Z  {st!s:>4}  {rq.get('method','')} {url[:90]}  [{where}] {ua[:70]}  {logs}"); n += 1
    print(f"{n} events")

if __name__ == "__main__":
    if sys.argv[1] == "past": past(sys.argv[2])
    else: live(sys.argv[2], sys.argv[3])
