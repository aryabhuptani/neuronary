"""GitHub Action helper: pulls the recipe JSON out of an issue body (env ISSUE_BODY), validates it, picks a free id,
and writes recipes/<id>.json. Sets step outputs id and name. Exits 1 with readable errors otherwise."""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_index import RECIPES, SCHEMA, validate  # noqa: E402


def extract(body):
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", body, re.S)
    text = m.group(1) if m else body[body.find("{"): body.rfind("}") + 1]
    if not text:
        raise SystemExit("no JSON object found in the issue")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise SystemExit(f"the recipe isn't valid JSON: {e}")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:64] or "recipe"


def main():
    r = extract(os.environ.get("ISSUE_BODY", ""))
    base = slug(r.get("id") or r.get("name") or "recipe")
    rid, k = base, 2
    while os.path.exists(os.path.join(RECIPES, f"{rid}.json")):
        rid, k = f"{base}-{k}", k + 1
    r = {"id": rid, **{k: v for k, v in r.items() if k != "id"}}
    r.setdefault("author", {"handle": os.environ.get("ISSUE_USER", "anonymous")})
    path = os.path.join(RECIPES, f"{rid}.json")
    try:
        import jsonschema
        with open(SCHEMA, encoding="utf-8") as f:
            validator = jsonschema.Draft202012Validator(json.load(f), format_checker=jsonschema.FormatChecker())
    except ImportError:
        validator = None
    errs = validate(path, r, validator)
    if not r.get("examples"):
        errs.append("add at least one example (prompt and steered output)")
    if errs:
        print("\n".join(errs))
        sys.exit(1)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(r, f, indent=2, ensure_ascii=False)
        f.write("\n")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"id={rid}\nname={r['name'].replace(chr(10), ' ')}\n")
    print(f"wrote recipes/{rid}.json")


if __name__ == "__main__":
    main()
