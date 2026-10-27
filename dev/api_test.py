"""End-to-end test of API tokens, the REST API (through clients/neuronary.py) and the MCP endpoint, against the live
project. Creates a throwaway verified user and an anonymous one, deletes both (and their rows) at the end.
    SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... python dev/api_test.py
"""
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "clients"))
from neuronary import Neuronary, NeuronaryError  # noqa: E402

URL, ANON, SVC = os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API = URL + "/functions/v1/api"
fails = []


def check(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  [{detail}]" if not ok and detail else ""))
    if not ok:
        fails.append(name)


def call(method, url, token=None, body=None, key=ANON):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {token or key}")
    req.add_header("Content-Type", "application/json")
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
users, recipes = [], []
try:
    # verified user (as if from X): admin-created with a user_name, then password sign-in
    email, pw = f"apitest_{tag}@example.com", secrets.token_urlsafe(16)
    s, d = call("POST", URL + "/auth/v1/admin/users", SVC, {"email": email, "password": pw, "email_confirm": True,
                                                           "user_metadata": {"user_name": f"apitest_{tag}"}}, key=SVC)
    check("create verified user", s == 200, d)
    users.append(d["id"])
    s, d = call("POST", URL + "/auth/v1/token?grant_type=password", body={"email": email, "password": pw})
    jwt = d["access_token"]
    s, tok = call("POST", URL + "/rest/v1/rpc/create_api_token", jwt, {"token_name": "test"})
    check("verified user gets a token", s == 200 and str(tok).startswith("nry_"), tok)

    s, d = call("POST", URL + "/auth/v1/signup", body={"data": {}})
    anon_jwt = d["access_token"]
    users.append(d["user"]["id"])
    call("POST", URL + "/rest/v1/rpc/claim_handle", anon_jwt, {"h": f"apianon_{tag}"})
    s, d = call("POST", URL + "/rest/v1/rpc/create_api_token", anon_jwt, {"token_name": "nope"})
    check("anonymous user can't make tokens", s >= 400, d)

    nr = Neuronary(token=tok, api=API)
    check("me", nr.me().get("handle") == f"apitest_{tag}")
    try:
        Neuronary(token="nry_" + "0" * 48, api=API).me()
        check("bad token refused", False)
    except NeuronaryError as e:
        check("bad token refused", "401" in str(e), e)

    found = nr.search("L14N8949")
    check("search by neuron finds the fixture", any(r["id"] == FIX for r in found["recipes"]), found)
    got = nr.get(FIX)
    check("get includes examples", isinstance(got.get("examples"), list), got)

    try:
        nr.publish(name="x", description="y", model="Qwen/Qwen3.5-4B", recipe="L09N1123+0.6", tags=["test"], examples=[])
        check("publish without examples refused", False)
    except NeuronaryError as e:
        check("publish without examples refused", "example" in str(e), e)
    try:
        nr.publish(name="x", description="y", model="Qwen/Qwen3.5-4B", neurons=[{"layer": -1, "neuron": 1, "dose": 1}],
                   tags=["test"], examples=[{"prompt": "a", "output": "b"}])
        check("bad neurons refused", False)
    except NeuronaryError as e:
        check("bad neurons refused", "neuron" in str(e).lower(), e)

    pub = nr.publish(name=f"API test {tag}", description="made by dev/api_test.py", model="Qwen/Qwen3.5-4B",
                     recipe="L09N1123+0.6 L18N0302-0.5", tags=["Test", "API test"], examples=[{"prompt": "Hello?", "output": "Arr."}],
                     sampling={"repetition_penalty": 1.1})
    rid = pub["id"]
    recipes.append(rid)
    check("publish via REST", len(rid) == 8 and pub["url"].endswith(rid), pub)
    s, row = call("GET", URL + f"/rest/v1/recipes?id=eq.{rid}&select=user_id,author_handle,origin,tags", SVC, key=SVC)
    row = row[0]
    check("published as the token's owner", row["user_id"] == users[0] and row["author_handle"] == f"apitest_{tag}" and row["origin"] == "site", row)
    check("tags normalized", row["tags"] == ["test", "api-test"], row["tags"])

    upd = nr.update(rid, examples=[{"prompt": "Hello?", "output": "Arr."}, {"prompt": "Name?", "output": "Captain."}])
    check("update own recipe", upd["id"] == rid)
    check("update visible", len(nr.get(rid)["examples"]) == 2)
    try:
        nr.update(FIX, name="pwned")
        check("can't edit others' recipes", False)
    except NeuronaryError as e:
        check("can't edit others' recipes", "403" in str(e), e)

    c = nr.comment(rid, "api comment")
    check("comment", "id" in c, c)
    v = nr.vote(rid, 1)
    check("vote", v["score"] == 1, v)
    v = nr.vote(rid, 0)
    check("clear vote", v["score"] == 0, v)

    # MCP
    s, d = call("POST", API + "/mcp", tok, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}})
    check("mcp initialize", s == 200 and d["result"]["serverInfo"]["name"] == "neuronary", d)
    s, d = call("POST", API + "/mcp", tok, {"jsonrpc": "2.0", "method": "notifications/initialized"})
    check("mcp notification -> 202", s == 202, s)
    s, d = call("POST", API + "/mcp", tok, {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_recipe", "arguments": {"id": rid}}})
    check("mcp get_recipe", s == 200 and not d["result"].get("isError") and d["result"]["structuredContent"]["id"] == rid, d)
    s, d = call("POST", API + "/mcp", None, {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "vote", "arguments": {"id": rid, "value": 1}}})
    check("mcp write without token is a tool error", s == 200 and d["result"].get("isError"), d)

    # moderation ran on the API-published recipe
    log = []
    for _ in range(20):
        time.sleep(3)
        s, log = call("GET", URL + f"/rest/v1/moderation_log?target_id=eq.{rid}&select=verdict,reason", SVC, key=SVC)
        if log:
            break
    check("jev reviewed the API post", bool(log) and log[0]["verdict"] == "allow", log)
finally:
    drop_fixture(FIX)
    for rid in recipes:
        call("DELETE", URL + f"/rest/v1/moderation_log?target_id=eq.{rid}", SVC, key=SVC)
        call("DELETE", URL + f"/rest/v1/recipes?id=eq.{rid}", SVC, key=SVC)
    for u in users:
        call("DELETE", URL + f"/rest/v1/moderation_log?kind=eq.comment", SVC, key=SVC) if False else None
        call("DELETE", URL + f"/auth/v1/admin/users/{u}", SVC, key=SVC)
    print(f"cleaned up {len(recipes)} recipes, {len(users)} users")

print(f"\n{len(fails)} failure(s)" + (": " + ", ".join(fails) if fails else ""))
sys.exit(1 if fails else 0)
