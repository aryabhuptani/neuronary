// The about page. Static content; rendered into the main area at #/about.
export const ABOUT_HTML = `
<div class="pagewrap about">
  <h1>About</h1>
  <p class="lead">neuronary is a dictionary of neuron steering recipes: small sets of MLP neurons that, pushed up or down,
  change how a language model behaves. Anyone can post a recipe, vote on it, and comment.</p>

  <h2>Reading a recipe</h2>
  <p><span class="rid"><span class="k">L13N7956</span><span class="d down">-1.0</span> <span class="k">L14N8949</span><span class="d up">+1.0</span></span>
  means: in layer 13, push neuron 7956 by −1; in layer 14, push neuron 8949 by +1. Layers and neurons count from 0.
  Mixture-of-experts models add the expert: <span class="rid">L11E11N1111+0.6</span>. The model is part of the recipe;
  neuron numbers mean nothing on a different model.</p>

  <h2>How the steering works</h2>
  <p>Each neuron is one channel at the input of a layer's <code>mlp.down_proj</code>, where the activations
  <code>silu(gate) · up</code> live. A recipe adds to that activation on every token:</p>
  <pre>act[n] += dose × median(‖residual leaving layer L‖) / ‖W_down[:, n]‖</pre>
  <p>So a dose of 1 moves the residual stream by one typical residual length, along the direction that neuron writes.
  The median is measured once per layer on a fixed calibration text. Doses are comparable across layers and neurons of
  the same model. Recipes can also multiply the activation instead (method <code>mul</code>).</p>

  <h2>Running a recipe</h2>
  <ul>
    <li><b>In your browser:</b> on a Qwen3.5-4B recipe, <b>Studio</b> downloads a file for
      <a href="https://huggingface.co/spaces/webml-community/neuron-studio" target="_blank" rel="noopener">Neuron Studio</a>,
      xenova's in-browser playground, which runs the model on your GPU through WebGPU. Import the file there.</li>
    <li><b>In Python:</b> <b>Python</b> copies a self-contained script (transformers + forward hooks) that applies the
      recipe with the recommended sampling.</li>
    <li><b>From the command line:</b> <code>scripts/run.py</code> in the
      <a href="https://github.com/lyramakesmusic/neuronary" target="_blank" rel="noopener">neuronary repo</a> runs any
      recipe file or URL on CPU, CUDA or Apple silicon, and with <code>--compare</code> prints the unsteered reply too.</li>
  </ul>

  <h2>Finding neurons</h2>
  <a class="shot" href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">
    <img src="img/explorer.jpg" alt="the neuron explorer: a map of every MLP neuron in Qwen3.5-4B, with steered example outputs" loading="lazy"></a>
  <p><a href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">neuron-explorer</a> is the
  tool most recipes here started from. It pushed every MLP neuron in Qwen3.5-4B up and down, kept every rollout, and lets you
  browse the neurons by what they do to the model, read their logit lens, and chat with any of them steered.</p>

  <h2>Tips</h2>
  <dl class="qa">
    <dt>Which layers should I try?</dt>
    <dd>Stay away from the first and last ~5 layers. Neurons there mostly deal in surface strings: a push gives you "the
    literal string -ist", not a persona. The residual is also tiny in the first few layers, so the same dose hits much
    harder and tends to break the model outright. On Qwen3.5-4B (32 layers), personas and concepts live in roughly L5–L26.</dd>

    <dt>It repeats itself or gets stuck in a loop.</dt>
    <dd>Add a mild repetition penalty (1.05–1.15), lower the dose a little, or sample (temperature ~0.7) instead of greedy
    decoding. If a recipe needs this, put it in the recipe's recommended sampling so others get it too.</dd>

    <dt>It turns into gibberish.</dt>
    <dd>The push is too big. For one neuron, the coherent range is usually around 0.5–1.0. Doses add up across neurons,
    so a recipe with several neurons usually wants smaller doses on each.</dd>

    <dt>Nothing changes.</dt>
    <dd>Raise the dose, try the opposite sign, and check that you're running the exact model the recipe names.
    Quantized models (q4) behave slightly differently from bf16.</dd>

    <dt>Can I combine recipes?</dt>
    <dd>Yes; neurons just add. Scale each recipe down so the total push stays reasonable, and post the combination if it works.</dd>

    <dt>Thinking mode?</dt>
    <dd>Recipes are made and shown with thinking off unless their sampling says otherwise.</dd>
  </dl>

  <h2>Reading</h2>
  <ul class="reading">
    <li><a href="https://already-clean.goodfire.com/" target="_blank" rel="noopener">Neural Networks Are Already Clean</a>
      <span class="dim">· Nick Cammarata. Most neurons in large models have one main job you can read off directly.</span></li>
    <li><a href="https://arxiv.org/abs/2605.12290" target="_blank" rel="noopener">Targeted Neuron Modulation via Contrastive Pair Search</a>
      <span class="dim">· Nous Research (CNA). Finding and steering sparse MLP neuron circuits with forward passes only.</span></li>
    <li><a href="https://x.com/Sauers_" target="_blank" rel="noopener">@Sauers_</a></li>
    <li><a href="https://x.com/_lyraaaa_" target="_blank" rel="noopener">@_lyraaaa_</a></li>
  </ul>

  <h2>Posting</h2>
  <p>Sign in with Twitter or pick a name. Every recipe needs at least one example: a prompt and the steered output, ideally
  with the unsteered reply next to it. Recipes are CC0 so anyone can run and remix them. New posts are checked by
  <a href="https://typesafe.ai" target="_blank" rel="noopener">jev</a>. Dark, hostile, offensive or
  unhinged personas and model outputs are what this site is about and stay up; spam, harassment of real people and doxxing
  come down. Use <b>Report</b> for anything it misses.</p>

  <h2>Credits</h2>
  <p>Built by opal (opus55) with <a href="https://x.com/_lyraaaa_" target="_blank" rel="noopener">@_lyraaaa_</a>.
  <a href="https://huggingface.co/spaces/webml-community/neuron-studio" target="_blank" rel="noopener">Neuron Studio</a> by <a href="https://x.com/xenovacom" target="_blank" rel="noopener">xenova</a>.
  <a href="https://github.com/lyramakesmusic/neuronary" target="_blank" rel="noopener">Source</a> ·
  <a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></p>
</div>`;
