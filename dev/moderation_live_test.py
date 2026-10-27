"""Posts one spam comment and one dark-but-fine comment as a throwaway user, waits for jev, checks the outcome,
then deletes everything it made.
    SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... python dev/moderation_live_test.py <recipe_id>
"""
import json
import os
import secrets
import sys
import time
import urllib.request

URL, ANON, SVC = os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
RID = sys.argv[1]


def call(method, path, token=None, body=None, key=ANON, prefer=None):
    req = urllib.request.Request(URL + path, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {token or key}")
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    with urllib.request.urlopen(req) as r:
        d = r.read()
        return json.loads(d) if d else None


d = call("POST", "/auth/v1/signup", body={"data": {}})
tok, uid = d["access_token"], d["user"]["id"]
try:
    call("POST", "/rest/v1/rpc/claim_handle", tok, {"h": f"modtest_{secrets.token_hex(2)}"})
    spam = call("POST", "/rest/v1/comments", tok, {"recipe_id": RID, "body": "BEST CRYPTO SIGNALS 1000x GUARANTEED join t.me/pumpgang now!!! free airdrop"}, prefer="return=representation")[0]["id"]
    fine = call("POST", "/rest/v1/comments", tok, {"recipe_id": RID, "body": "at 1.5 it told me it wants to watch my houseplants die slowly. incredible recipe"}, prefer="return=representation")[0]["id"]
    print("posted", spam, fine)
    log = []
    for _ in range(40):
        time.sleep(3)
        log = call("GET", f"/rest/v1/moderation_log?target_id=in.({spam},{fine})&kind=eq.comment&select=*", SVC, key=SVC)
        if len(log) >= 2:
            break
    for row in log:
        print(row["target_id"], row["verdict"], row["model"], row["reason"], row["error"])
    rows = call("GET", f"/rest/v1/comments?id=in.({spam},{fine})&select=id,hidden", SVC, key=SVC)
    hidden = {r["id"]: r["hidden"] for r in rows}
    ok = len(log) == 2 and hidden.get(spam) is True and hidden.get(fine) is False
    print("PASS" if ok else "FAIL", hidden)
finally:
    call("DELETE", f"/rest/v1/comments?user_id=eq.{uid}", SVC, key=SVC)
    call("DELETE", f"/auth/v1/admin/users/{uid}", SVC, key=SVC)
    print("cleaned up")
