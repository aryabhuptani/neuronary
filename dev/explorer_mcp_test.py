"""Drives the neuron explorer's agent_mcp.py over stdio (as Claude does) and checks the neuronary_* tools against the
live API. Creates a fixture recipe and a throwaway verified user, deletes both.
    SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... python dev/explorer_mcp_test.py path/to/agent_mcp.py
"""
import json
import os
import secrets
import subprocess
import sys
import urllib.request

URL, ANON, SVC = os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MCP = sys.argv[1]
fails = []


def check(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  [{str(detail)[:300]}]" if not ok and detail else ""))
    if not ok:
        fails.append(name)


def rest(method, path, body=None, token=None, key=SVC):
    req = urllib.request.Request(URL + path, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {token or key}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as r:
        d = r.read()
        return json.loads(d) if d else None


def session(env):
    p = subprocess.Popen([sys.executable, MCP], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)
    n = [0]

    def rpc(method, params=None):
        n[0] += 1
        p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": n[0], "method": method, "params": params or {}}) + "\n")
        p.stdin.flush()
        return json.loads(p.stdout.readline())

    def tool(name, args):
        r = rpc("tools/call", {"name": name, "arguments": args})["result"]
        text = r["content"][0]["text"]
        return r.get("isError", False), (text if r.get("isError") else json.loads(text))

    rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}})
    return p, rpc, tool


base_env = {k: v for k, v in os.environ.items() if not k.startswith("NEURONARY_TOKEN")}
base_env["HOME"] = base_env["USERPROFILE"] = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "work", "fakehome")
os.makedirs(base_env["HOME"], exist_ok=True)

fix = "fix" + secrets.token_hex(3)[:5]
rest("POST", "/rest/v1/recipes", {"id": fix, "name": "Fixture", "description": "temporary", "model": "Qwen/Qwen3.5-4B",
                                  "neurons": [{"layer": 14, "neuron": 8949, "dose": 1}, {"layer": 13, "neuron": 7956, "dose": -1}],
                                  "tags": ["test"], "examples": [{"prompt": "hi", "output": "yo"}], "author_handle": "fixture",
                                  "origin": "repo", "sampling": {"repetition_penalty": 1.1}})
uid, made = None, []
try:
    p, rpc, tool = session(base_env)
    names = [t["name"] for t in rpc("tools/list")["result"]["tools"]]
    check("neuronary tools listed", all(f"neuronary_{x}" in names for x in ("search", "get", "publish", "update", "comment", "vote")), names)
    check("explorer tools still there", "steer" in names and "neuron" in names)
    err, r = tool("neuronary_search", {"q": "L14 N8949"})
    check("search by explorer-style neuron id", not err and any(x["id"] == fix for x in r["recipes"]), r)
    err, r = tool("neuronary_get", {"id": fix})
    check("get converts to steer_neurons", not err and r["steer_neurons"] == [{"layer": 13, "n": 7956, "dose": -1}, {"layer": 14, "n": 8949, "dose": 1}], r)
    check("get keeps sampling", not err and r.get("sampling") == {"repetition_penalty": 1.1}, r)
    err, r = tool("neuronary_publish", {"name": "x", "description": "y", "neurons": [{"layer": 9, "n": 1123, "dose": 0.6}],
                                        "tags": ["test"], "examples": [{"prompt": "a", "output": "b"}]})
    check("publish without a token explains how to get one", err and "API & agents" in r, r)
    p.terminate()

    email, pw = f"exptest_{secrets.token_hex(3)}@example.com", secrets.token_urlsafe(16)
    u = rest("POST", "/auth/v1/admin/users", {"email": email, "password": pw, "email_confirm": True,
                                               "user_metadata": {"user_name": "exptest_" + secrets.token_hex(2)}})
    uid = u["id"]
    jwt = rest("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": pw}, key=ANON, token=ANON)["access_token"]
    tok = rest("POST", "/rest/v1/rpc/create_api_token", {"token_name": "explorer"}, token=jwt, key=ANON)
    os.makedirs(os.path.join(base_env["HOME"], ".neuronary"), exist_ok=True)
    open(os.path.join(base_env["HOME"], ".neuronary", "token"), "w").write(tok)

    p, rpc, tool = session(base_env)  # token from ~/.neuronary/token
    err, r = tool("neuronary_publish", {"name": "Explorer test", "description": "published by agent_mcp.py",
                                        "neurons": [{"layer": 9, "n": 1123, "dose": 0.6}, {"layer": 18, "n": 302, "dose": -0.5}],
                                        "tags": ["test"], "examples": [{"prompt": "Hello?", "output": "Arr.", "base_output": "Hi!"}],
                                        "sampling": {"repetition_penalty": 1.1}})
    check("publish with token file", not err and r.get("id"), r)
    if not err:
        made.append(r["id"])
        got = rest("GET", f"/rest/v1/recipes?id=eq.{r['id']}&select=neurons,model,examples")[0]
        check("published neurons converted back", sorted((x["layer"], x["neuron"], x["dose"]) for x in got["neurons"]) == [(9, 1123, 0.6), (18, 302, -0.5)], got)
        check("model filled in", got["model"] == "Qwen/Qwen3.5-4B", got)
        err2, r2 = tool("neuronary_update", {"id": r["id"], "description": "updated by agent_mcp.py"})
        check("update", not err2, r2)
        err3, r3 = tool("neuronary_vote", {"id": fix, "value": 1})
        check("vote", not err3 and r3["score"] == 1, r3)
    p.terminate()
finally:
    for rid in made + [fix]:
        rest("DELETE", f"/rest/v1/moderation_log?target_id=eq.{rid}")
        rest("DELETE", f"/rest/v1/recipes?id=eq.{rid}")
    if uid:
        rest("DELETE", f"/auth/v1/admin/users/{uid}")
    try:
        os.remove(os.path.join(base_env["HOME"], ".neuronary", "token"))
    except OSError:
        pass
    print("cleaned up")
print(f"\n{len(fails)} failure(s)")
sys.exit(1 if fails else 0)
