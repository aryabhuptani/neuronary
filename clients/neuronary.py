"""neuronary.org client: search, download, publish, comment, vote. Standard library only.

    from neuronary import Neuronary
    nr = Neuronary(token="nry_...")          # token from neuronary.org -> account menu -> API & agents
    nr.search("L14N8949")
    r = nr.get("cyuwrb3w")
    nr.publish(name="...", description="...", model="Qwen/Qwen3.5-4B", recipe="L13N7956-1.0 L14N8949+1.0",
               tags=["persona"], examples=[{"prompt": "...", "output": "..."}])

For agent frameworks, TOOLS has JSON-schema tool definitions and `nr.call(name, args)` dispatches them, e.g. to give the
neuron explorer's agent search/download/upload tools. CLI: python neuronary.py search evil | get <id> | publish file.json
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("NEURONARY_API", "https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1/api")


class NeuronaryError(Exception):
    pass


class Neuronary:
    def __init__(self, token=None, api=API):
        self.token = token or os.environ.get("NEURONARY_TOKEN")
        self.api = api.rstrip("/")

    def _req(self, method, path, body=None, params=None):
        url = self.api + path + ("?" + urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None}) if params else "")
        req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            try:
                msg = json.load(e).get("error")
            except Exception:
                msg = str(e)
            raise NeuronaryError(f"{e.code}: {msg}") from None

    def search(self, q=None, tag=None, model=None, author=None, sort="top", limit=20):
        return self._req("GET", "/recipes", params=dict(q=q, tag=tag, model=model, author=author, sort=sort, limit=limit))

    def get(self, recipe_id):
        return self._req("GET", f"/recipes/{recipe_id}")

    def publish(self, **recipe):
        """name, description, model, recipe="L13N7956-1.0 ..." (or neurons=[...]), tags, examples, sampling?, source?, notes?"""
        return self._req("POST", "/recipes", recipe)

    def update(self, recipe_id, **fields):
        return self._req("PATCH", f"/recipes/{recipe_id}", fields)

    def comment(self, recipe_id, body, parent_id=None):
        return self._req("POST", f"/recipes/{recipe_id}/comments", {"body": body, "parent_id": parent_id})

    def vote(self, recipe_id, value):
        return self._req("POST", f"/recipes/{recipe_id}/vote", {"value": value})

    def me(self):
        return self._req("GET", "/me")

    def call(self, name, args):
        """dispatch a TOOLS call by name"""
        args = dict(args or {})
        if name == "search_recipes":
            return self.search(**args)
        if name == "get_recipe":
            return self.get(args["id"])
        if name == "publish_recipe":
            return self.publish(**args)
        if name == "update_recipe":
            rid = args.pop("id")
            return self.update(rid, **args)
        if name == "comment":
            return self.comment(args["id"], args["body"], args.get("parent_id"))
        if name == "vote":
            return self.vote(args["id"], args["value"])
        raise NeuronaryError(f"unknown tool {name}")


_NEURONS = {"type": "array", "items": {"type": "object", "properties": {"layer": {"type": "integer"}, "neuron": {"type": "integer"},
                                                                         "dose": {"type": "number"}}, "required": ["layer", "neuron", "dose"]}}
_EXAMPLES = {"type": "array", "items": {"type": "object", "properties": {"prompt": {"type": "string"}, "output": {"type": "string"},
                                                                          "base_output": {"type": "string"}}, "required": ["prompt", "output"]}}
TOOLS = [
    {"name": "search_recipes", "description": "Search neuronary.org steering recipes by text, tag, model, author or neuron id (e.g. L14N8949).",
     "input_schema": {"type": "object", "properties": {"q": {"type": "string"}, "tag": {"type": "string"}, "model": {"type": "string"},
                                                       "author": {"type": "string"}, "sort": {"type": "string", "enum": ["top", "new", "hot"]},
                                                       "limit": {"type": "integer"}}}},
    {"name": "get_recipe", "description": "Download one recipe: neurons, doses, method, recommended sampling, examples.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}},
    {"name": "publish_recipe", "description": "Publish a recipe to neuronary.org as the token's owner. Needs at least one real example (prompt + verbatim steered output). Ask the user first.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}, "description": {"type": "string"}, "model": {"type": "string"},
                                                       "recipe": {"type": "string", "description": "e.g. L13N7956-1.0 L14N8949+1.0"},
                                                       "neurons": _NEURONS, "tags": {"type": "array", "items": {"type": "string"}},
                                                       "examples": _EXAMPLES, "sampling": {"type": "object"}, "source": {"type": "string"},
                                                       "notes": {"type": "string"}},
                      "required": ["name", "description", "model", "tags", "examples"]}},
    {"name": "update_recipe", "description": "Edit one of your own recipes (e.g. add examples; examples replaces the list).",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}, "name": {"type": "string"}, "description": {"type": "string"},
                                                       "tags": {"type": "array", "items": {"type": "string"}}, "examples": _EXAMPLES,
                                                       "sampling": {"type": "object"}, "notes": {"type": "string"}}, "required": ["id"]}},
    {"name": "comment", "description": "Comment on a recipe.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}, "body": {"type": "string"}, "parent_id": {"type": "integer"}},
                      "required": ["id", "body"]}},
    {"name": "vote", "description": "Vote on a recipe: 1, -1, or 0 to clear.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}, "value": {"type": "integer", "enum": [-1, 0, 1]}},
                      "required": ["id", "value"]}},
]


def _main(argv):
    nr = Neuronary()
    if len(argv) >= 2 and argv[0] == "search":
        out = nr.search(" ".join(argv[1:]))
    elif len(argv) == 2 and argv[0] == "get":
        out = nr.get(argv[1])
    elif len(argv) == 2 and argv[0] == "publish":
        out = nr.publish(**json.load(open(argv[1], encoding="utf-8")))
    else:
        print(__doc__)
        return 1
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
