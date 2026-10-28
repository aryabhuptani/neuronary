"""Static share pages: r/<id>/index.html for every public recipe, so neuronary.org/r/<id> unfurls on X and Discord
with that recipe's own title, description and preview image (rendered by the Supabase `og` function).

Each page is index.html with the recipe's meta tags and <base href="/">; in a browser the app moves on to #/r/<id>.
Run by .github/workflows/share-pages.yml (every 15 min and on push). Recipes newer than the last run fall back to
404.html, which redirects /r/<id> to /#/r/<id> (with the generic card).
"""
import glob
import html
import json
import os
import re
import shutil
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FN = "https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1"
SITE = "https://neuronary.org"


def fetch_all():
    out, offset = [], 0
    while True:
        with urllib.request.urlopen(f"{FN}/api/recipes?sort=new&limit=100&offset={offset}", timeout=30) as r:
            d = json.load(r)
        out += d["recipes"]
        offset += 100
        if offset >= d["count"]:
            return out


def clip(s, n):
    t = re.sub(r"\s+", " ", str(s or "")).strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def page(base, r):
    e = lambda s: html.escape(str(s), quote=True)
    title = f"{r['name']} · neuronary"
    desc = clip(f"{r['recipe']} on {r['model'].split('/')[-1]}. {r['description']}", 280)
    img = f"{FN}/og?id={r['id']}"
    link = f"{SITE}/r/{r['id']}"
    reps = [
        (r"<title>[^<]*</title>", f"<title>{e(title)}</title>"),
        (r'<meta name="description"[^>]*>', f'<meta name="description" content="{e(desc)}">'),
        (r'<meta property="og:url"[^>]*>', f'<meta property="og:url" content="{e(link)}">'),
        (r'<meta property="og:title"[^>]*>', f'<meta property="og:title" content="{e(title)}">'),
        (r'<meta property="og:description"[^>]*>', f'<meta property="og:description" content="{e(desc)}">'),
        (r'<meta property="og:image" [^>]*>', f'<meta property="og:image" content="{e(img)}">'),
        (r'<meta name="twitter:image"[^>]*>', f'<meta name="twitter:image" content="{e(img)}">'),
    ]
    out = base
    for pat, rep in reps:
        out, n = re.subn(pat, lambda _m, rep=rep: rep, out, count=1)
        assert n == 1, pat
    return out.replace("<head>", f'<head>\n<base href="/">\n<link rel="canonical" href="{e(link)}">', 1)


def main():
    base = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    recipes = fetch_all()
    keep = set()
    for r in recipes:
        if not re.fullmatch(r"[a-z0-9-]{1,64}", r["id"]):
            continue
        d = os.path.join(ROOT, "r", r["id"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(page(base, r))
        keep.add(r["id"])
    for d in glob.glob(os.path.join(ROOT, "r", "*")):  # deleted or hidden since
        if os.path.basename(d) not in keep:
            shutil.rmtree(d)
    print(f"{len(keep)} share pages")


if __name__ == "__main__":
    main()
