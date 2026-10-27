"""Run a neuronary recipe locally with Hugging Face transformers (CPU or your own GPU).

    python scripts/run.py recipes/evil.json --prompt "What should I make for dinner tonight?" --compare

Dose semantics (method.op = "add", the default): at the input of layer L's mlp.down_proj, where neuron activations
silu(gate) * up live, every token gets

    act[n] += dose * median(||resid leaving layer L||, tokens 1:) / ||W_down[:, n]||

so a dose of 1 pushes the residual stream by one median residual norm along neuron n's output direction. The median is
measured on a fixed calibration text (CALIBRATION below, or --calib FILE). "mul" multiplies the activation by dose.

Needs torch and transformers new enough for your model (Qwen3.5 needs transformers >= 5).
"""
import argparse
import json
import sys
import urllib.request

import torch
from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer

# Same text the neuron explorer uses to measure residual norms, so doses mean the same thing in both.
CALIBRATION = (
    "The history of the region is long and varied. Farmers settled the river valley first, then traders arrived, "
    "and by the twelfth century the town had a market, a bridge, and a quarrel with its neighbours over tolls. "
    "def merge(a, b):\n    out = []\n    while a and b:\n        out.append(a.pop(0) if a[0] < b[0] else b.pop(0))\n"
    "    return out + a + b\nShe asked me what I thought of the plan, and I told her honestly that it seemed rushed. "
)


def load_recipe(src):
    if src.startswith("http://") or src.startswith("https://"):
        with urllib.request.urlopen(src) as f:
            return json.load(f)
    with open(src, encoding="utf-8") as f:
        return json.load(f)


def load_model(name, device, dtype):
    cfg = AutoConfig.from_pretrained(name)
    tok = AutoTokenizer.from_pretrained(name)
    kw = dict(dtype=dtype)
    if getattr(cfg, "vision_config", None) is not None:
        from transformers import AutoModelForImageTextToText
        model = AutoModelForImageTextToText.from_pretrained(name, **kw)
    else:
        model = AutoModelForCausalLM.from_pretrained(name, **kw)
    return tok, model.to(device).eval()


def decoder_layers(model):
    for path in ("model.language_model.layers", "model.layers", "language_model.layers", "transformer.h"):
        obj = model
        try:
            for part in path.split("."):
                obj = getattr(obj, part)
            return obj
        except AttributeError:
            continue
    raise SystemExit("could not find the decoder layers on this model")


class Steerer:
    """Forward pre-hooks on each steered layer's down_proj. `scale` multiplies every dose; 0 turns steering off."""

    def __init__(self, layers, neurons, op, apply_to, units):
        self.scale, self.phase = 1.0, "prefill"
        self.handles = []
        by_layer = {}
        for n in neurons:
            if "expert" in n:
                raise SystemExit("MoE expert neurons are not supported by run.py yet")
            by_layer.setdefault(n["layer"], []).append(n)
        for l, ns in by_layer.items():
            idx = torch.tensor([n["neuron"] for n in ns])
            if op == "mul":
                vals = torch.tensor([float(n["dose"]) for n in ns])
            else:
                vals = torch.tensor([float(n["dose"]) * units[(l, n["neuron"])] for n in ns])
            self.handles.append(layers[l].mlp.down_proj.register_forward_pre_hook(self._hook(idx, vals, op, apply_to)))

    def _hook(self, idx, vals, op, apply_to):
        def hook(mod, inp):
            if self.scale == 0:
                return None
            if apply_to == "generated_tokens" and self.phase == "prefill":
                return None
            if apply_to == "prompt_tokens" and self.phase == "decode":
                return None
            h = inp[0].clone()
            i, v = idx.to(h.device), vals.to(h.device, h.dtype)
            if op == "mul":
                h[..., i] = h[..., i] * (1 + (v - 1) * self.scale)
            else:
                h[..., i] = h[..., i] + v * self.scale
            return (h,) + tuple(inp[1:])
        return hook

    def remove(self):
        for h in self.handles:
            h.remove()


@torch.inference_mode()
def residual_medians(model, tok, layers, wanted, text, device):
    seen, handles = {}, []
    for l in wanted:
        def hook(mod, inp, out, l=l):
            h = out[0] if isinstance(out, tuple) else out
            seen[l] = float(h[0, 1:].float().norm(dim=-1).median())
        handles.append(layers[l].register_forward_hook(hook))
    ids = tok(text, return_tensors="pt").input_ids.to(device)
    try:
        model(input_ids=ids, use_cache=False)
    finally:
        for h in handles:
            h.remove()
    return seen


@torch.inference_mode()
def generate(model, tok, steerer, prompt, max_new, s, device, stream):
    """s: dict with temperature (0 = greedy), top_p, top_k, repetition_penalty, thinking"""
    msgs = [{"role": "user", "content": prompt}]
    enc = tok.apply_chat_template(msgs, add_generation_prompt=True, enable_thinking=bool(s.get("thinking")), tokenize=True)
    ids = list(enc["input_ids"] if hasattr(enc, "keys") else enc)
    ids = torch.tensor([ids], device=device)
    eos = set(filter(lambda t: t is not None, [tok.eos_token_id, tok.convert_tokens_to_ids("<|im_end|>")]))
    steerer.phase = "prefill"
    out = model(input_ids=ids, use_cache=True)
    past, logits, new = out.past_key_values, out.logits[:, -1], []
    steerer.phase = "decode"
    finish, shown = "length", 0
    seen = ids[0].tolist()
    rp, temp = float(s.get("repetition_penalty") or 1.0), float(s.get("temperature") or 0.0)
    for _ in range(max_new):
        logits = logits.float()
        if rp != 1.0:  # CTRL-style: shrink logits of every token already in the context
            idx = torch.tensor(sorted(set(seen)), device=logits.device)
            v = logits[0, idx]
            logits[0, idx] = torch.where(v > 0, v / rp, v * rp)
        if temp > 0:
            logits = logits / temp
            if s.get("top_k"):
                kth = torch.topk(logits, int(s["top_k"]), -1).values[..., -1:]
                logits = logits.masked_fill(logits < kth, float("-inf"))
            if s.get("top_p") and s["top_p"] < 1:
                srt, order = torch.sort(logits, descending=True)
                cum = torch.softmax(srt, -1).cumsum(-1)
                drop = cum - torch.softmax(srt, -1) > float(s["top_p"])
                logits = logits.scatter(-1, order, srt.masked_fill(drop, float("-inf")))
            nxt = torch.multinomial(torch.softmax(logits, -1), 1)[0]
        else:
            nxt = logits.argmax(-1)
        t = int(nxt[0])
        if t in eos:
            finish = "eos"
            break
        new.append(t)
        seen.append(t)
        if stream:  # print the newly completed text; partial UTF-8 pieces wait for the next token
            text = tok.decode(new, skip_special_tokens=True)
            if not text.endswith("�"):
                sys.stdout.write(text[shown:])
                sys.stdout.flush()
                shown = len(text)
        out = model(input_ids=nxt.view(1, 1), past_key_values=past, use_cache=True)
        past, logits = out.past_key_values, out.logits[:, -1]
    if stream:
        sys.stdout.write("\n")
    return tok.decode(new, skip_special_tokens=True).strip(), finish


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("recipe", help="path or URL to a recipe .json")
    ap.add_argument("--prompt", action="append", help="prompt to run (repeatable). Default: the recipe's example prompts")
    ap.add_argument("--scale", type=float, default=1.0, help="multiply every dose by this")
    ap.add_argument("--compare", action="store_true", help="also generate the unsteered reply")
    ap.add_argument("--model", help="override the recipe's model id")
    ap.add_argument("--device", default="auto", help="cpu, cuda, mps, or auto")
    ap.add_argument("--dtype", default="bfloat16", choices=["bfloat16", "float16", "float32"])
    ap.add_argument("--max-new-tokens", type=int, default=1024,
                    help="safety stop for replies that never emit EOS (steering can make models loop)")
    ap.add_argument("--temperature", type=float, help="0 = greedy. Default: the recipe's sampling.temperature, else 0")
    ap.add_argument("--top-p", type=float)
    ap.add_argument("--top-k", type=int)
    ap.add_argument("--rep-pen", type=float, help="repetition penalty. Default: the recipe's sampling.repetition_penalty, else 1")
    ap.add_argument("--thinking", action="store_true", help="enable the model's thinking mode")
    ap.add_argument("--calib", help="text file to measure residual norms on, instead of the built-in calibration text")
    ap.add_argument("--json", dest="json_out", help="write results as recipe-style examples to this file")
    a = ap.parse_args()

    recipe = load_recipe(a.recipe)
    method = recipe.get("method") or {}
    op = method.get("op", "add")
    norm = method.get("normalization", "layer_residual_median_over_down_column_l2")
    apply_to = method.get("apply_to", "all_tokens")
    if recipe.get("conditional"):
        print("note: this recipe has a 'conditional' section; run.py applies only the constant doses", file=sys.stderr)

    device = a.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    dtype = getattr(torch, a.dtype)
    name = a.model or recipe["model"]
    print(f"loading {name} on {device} ({a.dtype})", file=sys.stderr)
    tok, model = load_model(name, device, dtype)
    layers = decoder_layers(model)

    units = {}
    if op == "add":
        if norm == "raw":
            units = {(n["layer"], n["neuron"]): 1.0 for n in recipe["neurons"]}
        else:
            text = open(a.calib, encoding="utf-8").read() if a.calib else CALIBRATION
            med = residual_medians(model, tok, layers, sorted({n["layer"] for n in recipe["neurons"]}), text, device)
            for n in recipe["neurons"]:
                col = layers[n["layer"]].mlp.down_proj.weight[:, n["neuron"]].float()
                units[(n["layer"], n["neuron"])] = med[n["layer"]] / float(col.norm())
            print("median resid norm: " + ", ".join(f"L{l} {v:.1f}" for l, v in sorted(med.items())), file=sys.stderr)

    samp = dict(recipe.get("sampling") or {})
    for k, v in [("temperature", a.temperature), ("top_p", a.top_p), ("top_k", a.top_k), ("repetition_penalty", a.rep_pen)]:
        if v is not None:
            samp[k] = v
    if a.thinking:
        samp["thinking"] = True
    if samp:
        print("sampling: " + ", ".join(f"{k}={v}" for k, v in samp.items()), file=sys.stderr)
    steer = Steerer(layers, recipe["neurons"], op, apply_to, units)
    prompts = a.prompt or [e["prompt"] for e in recipe.get("examples", [])] or ["Tell me about yourself."]
    results = []
    for p in prompts:
        print(f"\n> {p}\n", file=sys.stderr)
        steer.scale = a.scale
        print(f"[steered x{a.scale:g}]", file=sys.stderr)
        out, fin = generate(model, tok, steer, p, a.max_new_tokens, samp, device, True)
        ex = {"prompt": p, "output": out}
        if a.compare:
            steer.scale = 0.0
            print("[base]", file=sys.stderr)
            base, _ = generate(model, tok, steer, p, a.max_new_tokens, samp, device, True)
            ex["base_output"] = base
        if a.scale != 1.0:
            ex["scale"] = a.scale
        ex["generation"] = {**{k: v for k, v in samp.items()}, "decoding": "sample" if samp.get("temperature") else "greedy",
                            "finish": fin, "dtype": a.dtype}
        results.append(ex)
    steer.remove()
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"wrote {a.json_out}", file=sys.stderr)


if __name__ == "__main__":
    main()
