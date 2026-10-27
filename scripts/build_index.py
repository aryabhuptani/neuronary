"""Validates recipes/*.json against schema/recipe.schema.json and writes recipes/index.json (everything but the examples,
which the site fetches per recipe). Exit code 1 if any recipe is invalid.

    python scripts/build_index.py            # validate + write index
    python scripts/build_index.py --check    # validate only, and fail if index.json is stale
"""
import argparse
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECIPES = os.path.join(ROOT, "recipes")
SCHEMA = os.path.join(ROOT, "schema", "recipe.schema.json")
SUMMARY_KEYS = ["id", "name", "description", "model", "neurons", "method", "sampling", "tags", "aliases", "author", "source", "date"]


def neuron_key(n):
    return (n["layer"], n.get("expert", -1), n["neuron"])


def validate(path, recipe, validator):
    errs = []
    if validator is not None:
        errs += [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in validator.iter_errors(recipe)]
    else:  # minimal checks when jsonschema isn't installed
        for k in ["id", "name", "description", "model", "neurons", "tags", "examples", "author", "date"]:
            if k not in recipe:
                errs.append(f"missing {k}")
    stem = os.path.splitext(os.path.basename(path))[0]
    if recipe.get("id") != stem:
        errs.append(f"id {recipe.get('id')!r} must match the file name {stem!r}")
    ns = recipe.get("neurons") or []
    keys = [neuron_key(n) for n in ns if isinstance(n, dict) and "layer" in n and "neuron" in n]
    if len(set(keys)) != len(keys):
        errs.append("a neuron appears more than once")
    for e in recipe.get("examples") or []:
        if isinstance(e, dict) and not str(e.get("output", "")).strip():
            errs.append("an example has an empty output")
    return errs


def build(check=False):
    try:
        import jsonschema
        with open(SCHEMA, encoding="utf-8") as f:
            validator = jsonschema.Draft202012Validator(json.load(f), format_checker=jsonschema.FormatChecker())
    except ImportError:
        print("jsonschema not installed; running minimal checks only (pip install jsonschema)", file=sys.stderr)
        validator = None

    bad, out = 0, []
    for path in sorted(glob.glob(os.path.join(RECIPES, "*.json"))):
        if os.path.basename(path) == "index.json":
            continue
        try:
            with open(path, encoding="utf-8") as f:
                r = json.load(f)
        except json.JSONDecodeError as e:
            print(f"{os.path.relpath(path, ROOT)}: not valid JSON: {e}")
            bad += 1
            continue
        errs = validate(path, r, validator)
        if errs:
            bad += 1
            for e in errs:
                print(f"{os.path.relpath(path, ROOT)}: {e}")
            continue
        s = {k: r[k] for k in SUMMARY_KEYS if k in r}
        s["n_examples"] = len(r["examples"])
        out.append(s)

    index = {"version": 1, "count": len(out), "recipes": out}
    text = json.dumps(index, indent=1, ensure_ascii=False) + "\n"
    ipath = os.path.join(RECIPES, "index.json")
    if check:
        cur = open(ipath, encoding="utf-8").read() if os.path.exists(ipath) else ""
        if cur != text:
            print("recipes/index.json is stale: run python scripts/build_index.py")
            bad += 1
    else:
        with open(ipath, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    print(f"{len(out)} valid, {bad} problem(s)")
    return bad


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    sys.exit(1 if build(ap.parse_args().check) else 0)
