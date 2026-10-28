"""Measure the per-layer residual norms that define dose units, once, and publish them as a fixed table.

    python scripts/norms.py Qwen/Qwen3.5-4B            # writes norms/Qwen__Qwen3.5-4B.json

A dose of 1 = one median ||residual leaving layer L|| (tokens 1:, on the CALIBRATION text) along the neuron's output
direction. Measuring that at run time on different hardware or precision drifts a little; the site, the Python
snippet and scripts/run.py read this table instead, so a dose means the same thing everywhere.
"""
import argparse
import hashlib
import json
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import CALIBRATION, decoder_layers, load_model, residual_medians  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--dtype", default="bfloat16", choices=["bfloat16", "float32"])
    a = ap.parse_args()
    tok, model = load_model(a.model, a.device, getattr(torch, a.dtype))
    layers = decoder_layers(model)
    med = residual_medians(model, tok, layers, range(len(layers)), CALIBRATION, a.device)
    out = {
        "model": a.model,
        "what": "median L2 norm of the residual stream leaving each decoder layer, over tokens 1: of the calibration text",
        "calibration_sha256": hashlib.sha256(CALIBRATION.encode()).hexdigest(),
        "dtype": a.dtype,
        "medians": [round(med[i], 4) for i in range(len(layers))],
    }
    os.makedirs(os.path.join(ROOT, "norms"), exist_ok=True)
    path = os.path.join(ROOT, "norms", a.model.replace("/", "__") + ".json")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print(path)
    print(" ".join(f"L{i}:{v:.1f}" for i, v in enumerate(out["medians"])))


if __name__ == "__main__":
    main()
