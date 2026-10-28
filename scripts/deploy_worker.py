"""Deploy cloudflare/share-worker.js as the Worker on neuronary.org/r/* (Cloudflare API token in ~/.neuronary/cf_token
or $CF_TOKEN; needs Workers Scripts:Edit and Workers Routes:Edit)."""
import json
import os
import urllib.request
import uuid

ACCOUNT = "594f0dc1f621be8485167cb9de246d58"
ZONE = "c52df574da3e90837fa80917ffb11029"
NAME = "neuronary-share"
PATTERN = "neuronary.org/r/*"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = os.environ.get("CF_TOKEN") or open(os.path.expanduser("~/.neuronary/cf_token")).read().strip()


def api(method, path, body=None, ctype="application/json"):
    req = urllib.request.Request("https://api.cloudflare.com/client/v4" + path, method=method, data=body)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    if body is not None:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}")


def main():
    code = open(os.path.join(ROOT, "cloudflare", "share-worker.js"), "rb").read()
    meta = json.dumps({"main_module": "share-worker.js", "compatibility_date": "2026-10-01"}).encode()
    b = uuid.uuid4().hex
    parts = [
        f'--{b}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n'.encode() + meta + b"\r\n",
        f'--{b}\r\nContent-Disposition: form-data; name="share-worker.js"; filename="share-worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n'.encode() + code + b"\r\n",
        f"--{b}--\r\n".encode(),
    ]
    r = api("PUT", f"/accounts/{ACCOUNT}/workers/scripts/{NAME}", b"".join(parts), f"multipart/form-data; boundary={b}")
    print("script:", r.get("success"), r.get("errors"))
    routes = api("GET", f"/zones/{ZONE}/workers/routes").get("result") or []
    if not any(x["pattern"] == PATTERN for x in routes):
        r = api("POST", f"/zones/{ZONE}/workers/routes", json.dumps({"pattern": PATTERN, "script": NAME}).encode())
        print("route:", r.get("success"), r.get("errors"))
    else:
        print("route: already there")


if __name__ == "__main__":
    main()
