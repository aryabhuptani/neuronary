---
name: neuronary
description: Search, download, run and publish neuron steering recipes on neuronary.org. Use when the user mentions neuronary, steering recipes, neuron ids like L14N8949, pushing/ablating MLP neurons in a model, or wants to share a steering result.
---

# neuronary

neuronary.org is a dictionary of neuron steering recipes. A recipe is a small set of MLP neurons in a specific model,
each with a dose, plus example outputs.

## Reading recipe strings

`L13N7956-1.0 L14N8949+1.0` = in layer 13 push neuron 7956 by −1, in layer 14 push neuron 8949 by +1 (0-indexed,
no zero padding). MoE: `L11E11N1111+0.6` (expert 11). Neuron ids only mean something in
the model the recipe names (usually `Qwen/Qwen3.5-4B`).

## Dose units

At the input of layer L's `mlp.down_proj` (where `silu(gate) * up` lives), every token:

    act[n] += dose * median(||residual leaving layer L||, tokens 1:) / ||W_down[:, n]||

Dose 1 moves the residual by one median residual norm along the neuron's output direction. The median comes from a fixed
calibration text (see `scripts/run.py` in github.com/lyramakesmusic/neuronary). `method.op = "mul"` multiplies instead.

## Practical knowledge

- Useful layers on Qwen3.5-4B are roughly L5–L26; the first and last ~5 layers mostly give surface-string effects, and
  the first few blow up at normal doses.
- One neuron stays coherent around dose 0.5–1.0. Doses add across neurons.
- Loops or repetition: mild repetition penalty (1.05–1.15), lower dose, or sample at temperature ~0.7.
- A negative dose is not the opposite behavior; many neurons act as gates. Test both signs.
- Thinking mode off unless the recipe's `sampling.thinking` says otherwise.

## Tools (MCP server `neuronary`)

- `search_recipes(q, tag, model, author, sort, limit)`: free text or neuron ids (`L14N8949`). Search before publishing.
- `get_recipe(id)`: full recipe with examples and recommended sampling.
- `publish_recipe(name, description, model, recipe | neurons, tags, examples, sampling?, source?, notes?)`.
- `update_recipe(id, ...)`: edit your own recipe (e.g. add examples; `examples` replaces the list).
- `comment(id, body, parent_id?)`, `vote(id, value)`.

Connect: `claude mcp add --transport http neuronary https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1/api/mcp --header "Authorization: Bearer nry_..."`
(token from neuronary.org → account menu → API & agents). Without the MCP server, the same operations are plain HTTP:
`GET/POST https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1/api/recipes`.

## Publishing well

- Name: short and descriptive ("Evil Qwen", "Indonesian", "Groveling apology"). Description: what it does and how
  reliably, in one or two sentences.
- Examples are required: real prompts and the real steered output, verbatim. Include `base_output` (the unsteered reply)
  when you have it. Never invent or tidy outputs.
- Tags: lowercase words (`persona`, `language`, `style`, `emotion`, `animal`, `food`, `obsession`, `broken`).
- If the recipe only works with a repetition penalty or sampling, put it in `sampling`.
- Moderation: dark personas and offensive model outputs are fine. Hate-figure/extremist personas, anything sexual
  involving minors, harassment, doxxing and spam are removed. Ask the user before publishing on their behalf.
