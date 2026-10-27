# neuronary

A dictionary of neuron steering recipes. Each recipe is a set of MLP neurons and doses, e.g.

    L13N7956-1.0 L14N8949+1.0

which reads: in `Qwen/Qwen3.5-4B`, push layer 13 neuron 7956 by −1 and layer 14 neuron 8949 by +1.

The site is static (plain HTML/CSS/JS, no build step). Recipes live in `recipes/*.json`. Votes, comments and
on-site submissions go through `js/store.js`, which uses Supabase when `config.js` has keys and the visitor's
localStorage otherwise.

## Dose units

For `method.op = "add"` (the default), at the input of layer L's `mlp.down_proj`, where neuron activations
`silu(gate) * up` live, every token gets

    act[n] += dose * median(||resid leaving layer L||, tokens 1:) / ||W_down[:, n]||

so dose 1 moves the residual stream by one median residual norm along neuron n's output direction. The median is
measured on a fixed calibration text (in `scripts/run.py`), the same text the neuron explorer uses. On Qwen3.5-4B it
gives 24.8 at L22, against 25.4 over 2M tokens of the sweep corpus. This is the same unit Neuron Studio calls
`layer_residual_median_over_down_column_l2`, so recipes import into it directly.

`"op": "mul"` multiplies the activation by the dose instead. MoE expert neurons are written `L11E11N1111+0.6`
(`"expert"` in the JSON); the schema accepts them, `run.py` doesn't apply them yet.

## Run a recipe

    pip install torch "transformers>=5"
    python scripts/run.py recipes/evil.json --compare
    python scripts/run.py https://neuronary.org/recipes/evil.json --prompt "Tell me about yourself." --scale 0.5

Runs on CPU, CUDA or MPS. `--compare` also prints the unsteered reply; `--json out.json` writes the results in the
recipe `examples` format.

## Add a recipe

- On the site: **submit**. With Supabase configured it publishes immediately. Without it, the form opens a pull
  request or an issue on GitHub, or downloads the JSON.
- By pull request: add `recipes/<id>.json` (format: `schema/recipe.schema.json`), then run
  `python scripts/build_index.py` to validate and refresh `recipes/index.json`. CI runs the same check.
- By issue: the "Recipe" issue form takes the JSON; a workflow validates it and opens the pull request.

## Files

| path | |
|---|---|
| `index.html`, `css/`, `js/`, `config.js` | the site |
| `recipes/` | one JSON file per recipe, plus the generated `index.json` |
| `schema/recipe.schema.json` | recipe format |
| `scripts/run.py` | local runner (transformers) |
| `scripts/build_index.py` | validates recipes, writes `recipes/index.json` |
| `scripts/issue_to_recipe.py` | used by the issue → pull request workflow |
| `supabase/schema.sql` | tables and row-level security for votes, comments, submissions |
| `dev/fixtures.json` | demo data, loaded with `?demo` |
| `dev/shots.mjs` | headless-Chrome walkthrough: screenshots every screen, fails on console errors |
| `sketches/` | design sketches (local only, not committed) |

## Local development

    python -m http.server 8765
    open http://127.0.0.1:8765/?demo

## Supabase (votes, comments, one-click publish)

1. Create a project at supabase.com.
2. SQL editor → paste `supabase/schema.sql` → run.
3. Authentication → Providers: enable X / Twitter (needs an X developer app; callback URL is shown there), and any
   others. Authentication → URL configuration: set the site URL to the live domain.
4. Put the project URL and anon key in `config.js`.

The anon key is public by design; row-level security in `schema.sql` limits writes to signed-in users' own rows.
