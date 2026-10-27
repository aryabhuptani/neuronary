"""Upserts recipes/*.json into the Supabase `recipes` table (origin = 'repo').

A repo recipe is written to the database when it's new or when its file changed since the last sync (tracked by
repo_hash), so edits made on the site (e.g. examples added by an admin) survive until the file itself changes.

    SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... python scripts/sync_repo.py [--dry-run]
"""
import argparse
import glob
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIELDS = ["id", "name", "description", "model", "neurons", "method", "sampling", "conditional", "tags", "examples",
          "aliases", "source", "notes", "date"]


def api(url, key, method="GET", body=None, prefer=None):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read()
            return json.loads(data) if data else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {url}: {e.code} {e.read().decode(errors='replace')}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    base, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; nothing to do")
        return
    rest = f"{base}/rest/v1/recipes"
    have = {r["id"]: r for r in api(f"{rest}?select=id,origin,repo_hash&limit=10000", key)}

    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, "recipes", "*.json"))):
        if os.path.basename(path) == "index.json":
            continue
        raw = open(path, "rb").read()
        r = json.loads(raw)
        h = hashlib.sha256(raw).hexdigest()[:16]
        cur = have.get(r["id"])
        if cur and cur["origin"] != "repo":
            print(f"skip {r['id']}: a site recipe already uses this id")
            continue
        if cur and cur["repo_hash"] == h:
            continue
        row = {k: r.get(k) for k in FIELDS}
        row["aliases"] = row["aliases"] or []
        row["examples"] = row["examples"] or []
        author = r.get("author") or {}
        row.update(origin="repo", repo_hash=h, user_id=None, author_handle=author.get("handle", "anonymous"),
                   author_url=author.get("url"))
        rows.append(row)
        print(("update " if cur else "insert ") + r["id"])

    if rows and not a.dry_run:
        api(f"{rest}?on_conflict=id", key, "POST", rows, prefer="resolution=merge-duplicates,return=minimal")
    print(f"{len(rows)} written, {len(have)} already in the database")


if __name__ == "__main__":
    sys.exit(main())
