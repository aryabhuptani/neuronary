"""Adversarial check of the Supabase rules, against a real project. Creates two anonymous users and some rows, tries
things that must fail, then deletes everything it made.

    SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... python dev/rls_test.py
"""
import json
import os
import secrets
import sys
import urllib.error
import urllib.request

URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON = os.environ["SUPABASE_ANON_KEY"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
fails = []


def call(method, path, token=None, body=None, prefer=None, key=ANON):
    req = urllib.request.Request(URL + path, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {token or key}")
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req) as r:
            d = r.read()
            return r.status, (json.loads(d) if d else None)
    except urllib.error.HTTPError as e:
        d = e.read()
        try:
            return e.code, json.loads(d)
        except Exception:
            return e.code, d.decode(errors="replace")


def check(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        fails.append(name)


def anon_user():
    s, d = call("POST", "/auth/v1/signup", body={"data": {}})
    assert s == 200, d
    return d["access_token"], d["user"]["id"]


def make_fixture():
    """a repo-origin recipe (no owner) for tests to read, vote on and fail to edit; deleted at the end"""
    rid = "fix" + secrets.token_hex(3)[:5]
    body = {"id": rid, "name": "Test fixture", "description": "temporary test fixture", "model": "Qwen/Qwen3.5-4B",
            "neurons": [{"layer": 13, "neuron": 7956, "dose": -1}, {"layer": 14, "neuron": 8949, "dose": 1}], "tags": ["test"],
            "examples": [{"prompt": "hi", "output": "yo"}], "author_handle": "fixture", "origin": "repo"}
    req = urllib.request.Request(os.environ["SUPABASE_URL"] + "/rest/v1/recipes", method="POST", data=json.dumps(body).encode())
    for k, v in {"apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": "Bearer " + os.environ["SUPABASE_SERVICE_ROLE_KEY"],
                 "Content-Type": "application/json"}.items():
        req.add_header(k, v)
    urllib.request.urlopen(req).read()
    return rid


def drop_fixture(rid):
    req = urllib.request.Request(os.environ["SUPABASE_URL"] + f"/rest/v1/recipes?id=eq.{rid}", method="DELETE")
    for k, v in {"apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": "Bearer " + os.environ["SUPABASE_SERVICE_ROLE_KEY"]}.items():
        req.add_header(k, v)
    urllib.request.urlopen(req).read()


FIX = make_fixture()
tag = secrets.token_hex(3)
recipe = lambda rid, **kw: {"id": rid, "name": "t " + rid, "description": "rls test", "model": "Qwen/Qwen3.5-4B",
                            "neurons": [{"layer": 3, "neuron": 12, "dose": 0.5}], "tags": ["test"],
                            "examples": [{"prompt": "hi", "output": "yo"}], "author_handle": "", **kw}
users, made = [], []
try:
    ta, ua = anon_user(); users.append(ua)
    tb, ub = anon_user(); users.append(ub)
    ha, hb = f"rls_a_{tag}", f"rls_b_{tag}"

    s, d = call("POST", "/rest/v1/recipes", body=recipe(f"rls-noauth-{tag}"))
    check("signed-out insert is refused", s >= 400, d)

    s, d = call("POST", "/rest/v1/recipes", ta, recipe(f"rls-nohandle-{tag}"))
    check("insert without a handle is refused", s >= 400, d)

    s, d = call("POST", "/rest/v1/rpc/claim_handle", ta, {"h": ha})
    check("claim handle", s == 200 and d == ha, d)
    s, d = call("POST", "/rest/v1/rpc/claim_handle", tb, {"h": ha.upper()})
    check("handle taken (case-insensitive)", s >= 400, d)
    s, d = call("POST", "/rest/v1/rpc/claim_handle", tb, {"h": "bad handle!"})
    check("bad handle refused", s >= 400, d)
    s, d = call("POST", "/rest/v1/rpc/claim_handle", tb, {"h": hb})
    check("claim second handle", s == 200, d)
    s, d = call("POST", "/rest/v1/rpc/claim_handle", tb, {"h": hb + "x"})
    check("can't claim a second handle", s >= 400, d)

    ra = f"rls-a-{tag}"
    s, d = call("POST", "/rest/v1/recipes", ta, recipe(ra, author_handle="_lyraaaa_", user_id=ub, origin="repo", hidden=True),
                prefer="return=representation")
    row = d[0] if s == 201 else {}
    check("publish", s == 201, d)
    check("client can't pick the id", row.get("id") not in (None, ra) and len(row.get("id", "")) == 8, row.get("id"))
    ra = row.get("id", ra)
    made.append(ra)
    check("author handle can't be spoofed", row.get("author_handle") == ha, row.get("author_handle"))
    check("owner can't be spoofed", row.get("user_id") == ua, row.get("user_id"))
    check("origin/hidden can't be spoofed", row.get("origin") == "site" and row.get("hidden") is False, row)

    for bad, why in [({"neurons": [{"layer": -1, "neuron": 1, "dose": 1}]}, "negative layer"),
                     ({"neurons": [{"layer": 1, "neuron": 1, "dose": 1}, {"layer": 1, "neuron": 1, "dose": 2}]}, "duplicate neuron"),
                     ({"neurons": [{"layer": 1.5, "neuron": 1, "dose": 1}]}, "fractional layer"),
                     ({"neurons": [{"layer": 1, "neuron": 1, "dose": 1, "x": 1}]}, "extra key"),
                     ({"examples": []}, "no examples"),
                     ({"examples": [{"prompt": "hi", "output": "  "}]}, "blank output"),
                     ({"tags": ["Bad Tag"]}, "bad tag"),
                     ({"source": "javascript:alert(1)"}, "bad source url")]:
        rid = f"rls-bad-{secrets.token_hex(2)}"
        body = recipe(rid, **bad) if "id" not in bad else {**recipe(rid), **bad}
        s, d = call("POST", "/rest/v1/recipes", ta, body, prefer="return=representation")
        check(f"invalid recipe refused: {why}", s >= 400, d)
        if s < 400 and isinstance(d, list) and d:
            made.append(d[0]["id"])

    # strikes: at 3 removals an account can't post, and can't reset its own count
    call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", body={"strikes": 3}, key=SERVICE, token=SERVICE)
    s, d = call("POST", "/rest/v1/comments", ta, {"recipe_id": FIX, "body": "struck"})
    check("struck account can't post", s >= 400 and "paused" in str(d), d)
    call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", ta, {"strikes": 0})
    s, d = call("GET", f"/rest/v1/profiles?id=eq.{ua}&select=strikes")
    check("can't reset your own strikes", d and d[0]["strikes"] == 3, d)
    call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", body={"strikes": 0}, key=SERVICE, token=SERVICE)

    # flagged names: owner sees the flag and can change the name; can't clear the flag by writing it
    s, d = call("POST", "/rest/v1/rpc/change_handle", ta, {"h": "rlsnope" + tag[:6]})
    check("unflagged name can't be changed", s >= 400, d)
    call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", body={"name_status": "review"}, key=SERVICE, token=SERVICE)
    s, d = call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", ta, {"name_status": None}, prefer="return=representation")
    s2, d2 = call("GET", f"/rest/v1/profiles?id=eq.{ua}&select=name_status")
    check("can't clear your own name flag", d2 and d2[0]["name_status"] == "review", d2)
    newh = ("rlsren" + tag)[:24]
    s, d = call("POST", "/rest/v1/rpc/change_handle", ta, {"h": newh})
    s2, d2 = call("GET", f"/rest/v1/profiles?id=eq.{ua}&select=handle,name_status")
    s3, d3 = call("GET", f"/rest/v1/recipes?id=eq.{ra}&select=author_handle")
    check("flagged owner renames everywhere", s == 200 and d2 and d2[0]["handle"] == newh and d2[0]["name_status"] is None and d3 and d3[0]["author_handle"] == newh, (d, d2, d3))
    ha = newh

    # editable user metadata can't claim an X handle (or admin)
    s, d = call("PUT", "/auth/v1/user", ta, {"data": {"user_name": "_lyraaaa_", "preferred_username": "_lyraaaa_"}})
    s, d = call("GET", f"/rest/v1/profiles?id=eq.{ua}&select=x_handle,is_admin")
    check("metadata can't set x_handle or admin", s == 200 and d and d[0]["x_handle"] is None and d[0]["is_admin"] is False, d)
    # example fields are type-checked (scale was an XSS vector)
    s, d = call("POST", "/rest/v1/recipes", ta, recipe(f"rls-xss-{tag}", examples=[{"prompt": "hi", "output": "yo", "scale": "<img src=x onerror=alert(1)>"}]))
    check("non-numeric example scale refused", s >= 400, d)
    s, d = call("POST", "/rest/v1/recipes", ta, recipe(f"rls-samp-{tag}", sampling={"temperature": "1); import os#"}))
    check("non-numeric sampling refused", s >= 400, d)
    s, d = call("POST", "/rest/v1/recipes", ta, recipe(f"rls-pad-{tag}", name="x" + " " * 200 + "y"))
    check("space-padded name refused", s >= 400, d)

    # daily limit: users can't raise their own; at the limit the error says when the next slot opens
    s, d = call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", ta, {"recipe_limit": 999}, prefer="return=representation")
    check("can't raise own recipe limit", not (s == 200 and d and d[0].get("recipe_limit") == 999), d)
    call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", body={"recipe_limit": 1}, key=SERVICE, token=SERVICE)
    s, d = call("POST", "/rest/v1/recipes", ta, recipe(f"rls-lim-{tag}"), prefer="return=representation")
    if s == 201:
        made.append(d[0]["id"])
    msg = d.get("message", "") if isinstance(d, dict) else ""
    check("limit error names the next slot", s >= 400 and "rate limit: 1 recipes a day; next one at 20" in msg, d)
    call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", body={"recipe_limit": None}, key=SERVICE, token=SERVICE)

    s, d = call("PATCH", f"/rest/v1/recipes?id=eq.{ra}", tb, {"name": "pwned"}, prefer="return=representation")
    check("other user can't edit", s in (200, 204) and not d, d)
    s, d = call("DELETE", f"/rest/v1/recipes?id=eq.{ra}", tb, prefer="return=representation")
    check("other user can't delete", s in (200, 204) and not d, d)
    s, d = call("PATCH", f"/rest/v1/recipes?id=eq.{FIX}", tb, {"name": "pwned"}, prefer="return=representation")
    check("can't edit repo recipes", s in (200, 204) and not d, d)
    s, d = call("PATCH", f"/rest/v1/recipes?id=eq.{ra}", ta, {"name": "renamed", "user_id": ub, "author_handle": "x", "hidden": True},
                prefer="return=representation")
    row = d[0] if d else {}
    check("owner can edit", row.get("name") == "renamed", d)
    check("owner can't move ownership or self-hide", row.get("user_id") == ua and row.get("author_handle") == ha and row.get("hidden") is False, row)

    s, d = call("POST", "/rest/v1/votes", tb, {"recipe_id": ra, "user_id": ub, "value": 1})
    check("picked-name accounts can't vote", s >= 400, d)
    s, d = call("POST", "/rest/v1/reproductions", tb, {"recipe_id": ra, "output": "x", "author_handle": ""})
    check("picked-name accounts can't report reproductions", s >= 400, d)
    # B becomes verified (trusted stands in for a linked X account in tests)
    call("PATCH", f"/rest/v1/profiles?id=eq.{ub}", body={"trusted": True}, key=SERVICE, token=SERVICE)
    s, d = call("POST", "/rest/v1/votes", tb, {"recipe_id": ra, "user_id": ub, "value": 1})
    check("vote", s == 201, d)
    s, d = call("POST", "/rest/v1/votes", tb, {"recipe_id": ra, "user_id": ua, "value": 1})
    check("can't vote as someone else", s >= 400, d)
    s, d = call("POST", "/rest/v1/votes", ta, {"recipe_id": ra, "user_id": ua, "value": 5})
    check("vote value limited to ±1", s >= 400, d)
    s, d = call("POST", "/rest/v1/votes", tb, {"recipe_id": ra, "user_id": ub, "value": 1})
    check("can't double vote", s >= 400, d)
    s, d = call("GET", f"/rest/v1/votes?recipe_id=eq.{ra}&select=*", ta)
    check("votes of others are private", s == 200 and d == [], d)
    s, d = call("GET", f"/rest/v1/recipe_stats?recipe_id=eq.{ra}&select=*")
    check("stats count the vote", s == 200 and d and d[0]["score"] == 1, d)

    s, d = call("POST", "/rest/v1/comments", tb, {"recipe_id": ra, "body": "nice", "author_handle": "_lyraaaa_"}, prefer="return=representation")
    cid = d[0]["id"] if s == 201 else None
    check("comment", s == 201, d)
    check("comment author can't be spoofed", s == 201 and d[0]["author_handle"] == hb, d)
    s, d = call("POST", "/rest/v1/comments", ta, {"recipe_id": ra, "body": "reply", "parent_id": cid}, prefer="return=representation")
    rid2 = d[0]["id"] if s == 201 else None
    check("reply", s == 201, d)
    s, d = call("POST", "/rest/v1/comments", ta, {"recipe_id": ra, "body": "deep", "parent_id": rid2})
    check("replies only one level deep", s >= 400, d)
    s, d = call("DELETE", f"/rest/v1/comments?id=eq.{cid}", ta, prefer="return=representation")
    check("can't delete others' comments", s in (200, 204) and not d, d)
    s, d = call("PATCH", f"/rest/v1/comments?id=eq.{cid}", tb, {"hidden": True}, prefer="return=representation")
    check("non-admin can't hide comments", s in (200, 204) and not d, d)
    s, d = call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", ta, {"is_admin": True}, prefer="return=representation")
    check("can't make yourself admin", s >= 400 or not d, d)
    s, d = call("POST", "/rest/v1/reports", tb, {"recipe_id": ra, "reason": "test", "user_id": ub})
    check("report", s == 201, d)
    s, d = call("GET", "/rest/v1/reports?select=*", tb)
    check("reports are admin-only", s == 200 and d == [], d)

    # non-admins: no featuring, no trusting yourself, no tag merges; drafts stay private
    s, d = call("PATCH", f"/rest/v1/recipes?id=eq.{ra}", ta, {"featured": True}, prefer="return=representation")
    check("non-admin can't feature", not (s == 200 and d and d[0].get("featured") is True), d)
    s, d = call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", ta, {"trusted": True}, prefer="return=representation")
    check("can't make yourself trusted", not (s == 200 and d and d[0].get("trusted") is True), d)
    s, d = call("POST", "/rest/v1/rpc/merge_tag", ta, {"src": "test", "dst": "pwned"})
    check("non-admin can't merge tags", s >= 400, d)
    s, d = call("POST", "/rest/v1/recipes", tb, recipe(f"rls-draft-{tag}", draft=True), prefer="return=representation")
    did = d[0]["id"] if s == 201 else None
    if did: made.append(did)
    check("draft saves", s == 201 and d[0].get("draft") is True, d)
    s, d = call("GET", f"/rest/v1/recipes?id=eq.{did}&select=id")
    check("drafts are invisible to the public", s == 200 and d == [], d)
    s, d = call("GET", f"/rest/v1/recipes?id=eq.{did}&select=id", ta)
    check("drafts are invisible to other users", s == 200 and d == [], d)
    s, d = call("PATCH", f"/rest/v1/recipes?id=eq.{did}", tb, {"draft": False}, prefer="return=representation")
    check("owner publishes a draft", s == 200 and d and d[0]["draft"] is False, d)
    s, d = call("PATCH", f"/rest/v1/recipes?id=eq.{did}", tb, {"draft": True}, prefer="return=representation")
    check("published can't go back to draft", s >= 400, d)
    # reproductions: not on your own recipe, one per user, spoof-proof
    s, d = call("POST", "/rest/v1/reproductions", ta, {"recipe_id": ra, "output": "x", "author_handle": "x"})
    check("can't reproduce your own recipe", s >= 400, d)
    s, d = call("POST", "/rest/v1/reproductions", tb, {"recipe_id": ra, "output": "it worked", "author_handle": "_lyraaaa_", "user_id": ua},
                prefer="return=representation")
    check("reproduce someone else's", s == 201 and d[0]["author_handle"] == hb and d[0]["user_id"] == ub, d)
    s, d = call("POST", "/rest/v1/reproductions", tb, {"recipe_id": ra, "output": "again", "author_handle": ""})
    check("one reproduction per user per recipe", s >= 400, d)
    s, d = call("GET", f"/rest/v1/recipe_stats?recipe_id=eq.{ra}&select=reproductions")
    check("reproductions counted", s == 200 and d and d[0]["reproductions"] == 1, d)

    # admin powers: promote A via service role, then A hides B's comment
    call("PATCH", f"/rest/v1/profiles?id=eq.{ua}", body={"is_admin": True}, key=SERVICE, token=SERVICE)
    s, d = call("PATCH", f"/rest/v1/comments?id=eq.{cid}", ta, {"hidden": True}, prefer="return=representation")
    check("admin can hide comments", s == 200 and d and d[0]["hidden"] is True, d)
    s, d = call("GET", f"/rest/v1/comments?recipe_id=eq.{ra}&select=id,hidden")
    check("hidden comments are hidden from the public", s == 200 and all(c["id"] != cid for c in d), d)
    s, d = call("PATCH", f"/rest/v1/recipes?id=eq.{FIX}", ta, {"notes": None}, prefer="return=representation")
    check("admin can edit repo recipes", s == 200 and d, d)
    s, d = call("PATCH", f"/rest/v1/recipes?id=eq.{ra}", ta, {"featured": True}, prefer="return=representation")
    check("admin can feature", s == 200 and d and d[0]["featured"] is True, d)
    ta1, ta2 = f"rlsa{tag}".lower()[:30], f"rlsb{tag}".lower()[:30]
    call("PATCH", f"/rest/v1/recipes?id=eq.{ra}", ta, {"tags": [ta1]})
    s, d = call("POST", "/rest/v1/rpc/merge_tag", ta, {"src": ta1, "dst": ta2})
    s2, d2 = call("GET", f"/rest/v1/recipes?id=eq.{ra}&select=tags", ta)
    check("admin merges tags", s == 200 and d2 and d2[0]["tags"] == [ta2], (d, d2))
    s, d = call("POST", "/rest/v1/recipes", tb, recipe(f"rls-alias-{tag}", tags=[ta1]), prefer="return=representation")
    if s == 201: made.append(d[0]["id"])
    check("merged tag maps on new posts", s == 201 and d[0]["tags"] == [ta2], d)
    call("DELETE", f"/rest/v1/tag_aliases?alias=eq.{ta1}", key=SERVICE, token=SERVICE)
    s, d = call("DELETE", f"/rest/v1/recipes?id=eq.{ra}", ta, prefer="return=representation")
    check("owner/admin can delete", s == 200 and d, d)
    if s == 200 and d:
        made.remove(ra)
finally:
    drop_fixture(FIX)
    for rid in made:
        call("DELETE", f"/rest/v1/recipes?id=eq.{rid}", key=SERVICE, token=SERVICE)
    for u in users:
        call("DELETE", f"/auth/v1/admin/users/{u}", key=SERVICE, token=SERVICE)
    print(f"cleaned up {len(made)} recipes, {len(users)} users")

print(f"\n{len(fails)} failure(s)" + (": " + ", ".join(fails) if fails else ""))
sys.exit(1 if fails else 0)
