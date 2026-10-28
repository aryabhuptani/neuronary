import { ABOUT_HTML } from "./about.js?v=20261027173521";
import { createStore } from "./store.js?v=20261027173521";
import {
  esc, doseStr, neuronKey, neuronStr, sortNeurons, recipeStr, recipeHtml, neuronHtml, edgeMark, setKey, parseRecipeStr, parseNeuronQuery,
  methodOf, DEFAULT_METHOD, samplingText, md, recipeFile, recipeJson, pythonSnippet, studioFile, fromStudio, slugify, ago, avatarHtml, copyText, download,
} from "./format.js?v=20261027173521";

const CFG = window.NEURONARY || {};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const main = $("#main");
const overlay = $("#overlay");
let store;
let RECIPES = [];

// ------------------------------------------------------------------ icons
const I = {
  up: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 8.5L6 3l4.5 5.5z" fill="currentColor"/></svg>',
  down: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 3.5L6 9l4.5-5.5z" fill="currentColor"/></svg>',
  bubble: '<svg width="15" height="14" viewBox="0 0 15 14" aria-hidden="true"><path d="M2.5 1.5h10a1.5 1.5 0 0 1 1.5 1.5v5.5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V10H2.5A1.5 1.5 0 0 1 1 8.5V3a1.5 1.5 0 0 1 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  chev: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  grid: '<svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><rect x="0" y="0" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="7.5" y="0" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="0" y="7.5" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1" fill="currentColor"/></svg>',
  rows: '<svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><rect y="0" width="14" height="2" rx="1" fill="currentColor"/><rect y="5" width="14" height="2" rx="1" fill="currentColor"/><rect y="10" width="14" height="2" rx="1" fill="currentColor"/></svg>',
  filter: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12l-4.6 5.4V13l-2.8 1.2V8.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v11M2.5 8h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.9 2h6.4l4.4 5.9zm-1.1 18.1h1.7L8.3 3.8H6.5z"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.8 8 10.3l3.5-3.5M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3L5.5 13.5H2.5v-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  eyeoff: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 13.5l11-11" stroke="currentColor" stroke-width="1.5"/></svg>',
  flag: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14V2.5M3.5 3h8.5l-2 3 2 3H3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  theme: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>',
};

// ------------------------------------------------------------------ routing
function parseRoute() {
  if (/(^|#)(access_token|error|refresh_token)=/.test(location.hash.slice(1))) { history.replaceState(null, "", location.pathname + "#/"); }
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const p = new URLSearchParams(qs || "");
  if (!parts.length) return { view: "browse", p };
  if (parts[0] === "browse") return { view: "browse", p };
  if (parts[0] === "c" && parts[1]) {
    p.set("tags", parts[1]);
    return { view: "browse", p };
  }
  if (parts[0] === "r" && parts[1]) return { view: "recipe", id: parts[1], p };
  if (parts[0] === "submit") return { view: "submit-legacy", p };
  if (parts[0] === "n" && parts[1]) return { view: "neuron", key: parts[1], p };
  if (parts[0] === "about") return { view: "about", p };
  return { view: "notfound", p };
}

const browseHref = (p) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) s.set(k, Array.isArray(v) ? v.join(",") : v);
  const q = s.toString();
  return "#/" + (q ? "?" + q : "");
};

let listShown = false; // the main area holds home/browse, so a recipe can open as a modal over it
let modalPushed = false;
let lastListHash = "#/";

async function route() {
  editorOpen = false;
  const r = parseRoute();
  if (typeof closePops === "function") closePops();
  syncSearchBox(r);
  if (r.view === "recipe") {
    // a recipe always opens as a sheet; on a fresh load (or from about) the home list goes underneath,
    // so refreshing looks the same and closing lands on home
    if (!listShown) {
      document.body.className = "";
      renderBrowse(new URLSearchParams());
      listShown = true; modalPushed = false; lastListHash = "#/";
    }
    return openModal(r.id);
  }
  const wasModal = !!overlay.innerHTML;
  closeModal(true);
  modalPushed = false;
  if (wasModal && listShown && location.hash === lastListHash) return; // back to the list underneath, untouched
  if (r.view === "browse") { listShown = true; lastListHash = location.hash; return renderBrowse(r.p); }
  listShown = false;
  if (r.view === "submit-legacy") { history.replaceState(null, "", "#/"); route(); return openEditor(); }
  if (r.view === "about") { document.body.className = "page"; document.title = "About · neuronary"; main.innerHTML = ABOUT_HTML; scrollTo(0, 0); return; }
  if (r.view === "neuron") { document.body.className = ""; listShown = true; lastListHash = location.hash; return renderNeuron(r.key); }
  document.body.className = "page";
  main.innerHTML = `<div class="empty">Nothing here. <a href="#/">neuronary</a></div>`;
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// ------------------------------------------------------------------ common bits
// escape, then turn bare http(s) URLs into links
const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (u) => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`);
function votesHtml(r, cls = "") {
  return `<span class="votes v${r.myVote} ${cls}" data-vote="${esc(r.id)}">
    <button class="upv" data-v="1" aria-label="upvote">${I.up}</button><span class="n">${r.score}</span><button class="downv" data-v="-1" aria-label="downvote">${I.down}</button></span>`;
}

const tagHref = (t) => browseHref({ tags: [t] });
const tagsHtml = (tags, on = []) => tags.map((t) => `<a class="tag ${on.includes(t) ? "on" : ""}" href="${tagHref(t)}">${esc(t)}</a>`).join("");
const shortModel = (m) => m.split("/").pop();

function cardHtml(r, on) {
  return `<a class="card" href="#/r/${esc(r.id)}" data-open="${esc(r.id)}">
    ${edgeMark(r.neurons, r.model)}
    <div class="name">${esc(r.name)}</div>
    <div class="rid">${recipeHtml(r.neurons)}</div>
    <div class="desc">${esc(r.description)}</div>
    <div class="tags">${r.tags.slice(0, 5).map((t) => `<span class="tag ${on.includes(t) ? "on" : ""}">${esc(t)}</span>`).join("")}</div>
    <div class="foot">${votesHtml(r)}<span class="cmt">${I.bubble}${r.comments}</span><span class="who">@${esc(r.author.handle)}</span></div>
  </a>`;
}

async function doVote(id, v) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) return;
  if (!signedIn()) return signInPrompt("vote");
  const next = r.myVote === v ? 0 : v;
  const prev = r.myVote;
  r.score += next - prev;
  r.myVote = next;
  paintVotes(r);
  try {
    await store.vote(id, next);
  } catch (e) {
    r.score -= next - prev;
    r.myVote = prev;
    paintVotes(r);
    flashError(e);
  }
}

function paintVotes(r) {
  for (const el of $$(`[data-vote="${CSS.escape(r.id)}"]`)) {
    el.classList.remove("v1", "v-1", "v0");
    el.classList.add("v" + r.myVote);
    $(".n", el).textContent = r.score;
  }
}

document.addEventListener("click", (e) => {
  const sb = e.target.closest("[data-submit]");
  if (sb) {
    e.preventDefault();
    if (overlay.innerHTML) closeModal(true);
    if (store.mode === "supabase" && !signedIn()) { // sign in first; the form opens once you're in
      sessionStorage.setItem("nr.reopenSubmit", "1"); // survives the Twitter round trip
      e.stopPropagation();
      return signInPrompt("submit a recipe", () => { sessionStorage.removeItem("nr.reopenSubmit"); openEditor(); });
    }
    openEditor();
    return;
  }
  const vb = e.target.closest("[data-vote] button[data-v]");
  if (vb) {
    e.preventDefault();
    e.stopPropagation();
    doVote(vb.closest("[data-vote]").dataset.vote, +vb.dataset.v);
    return;
  }
  const op = e.target.closest("[data-open]");
  if (op && listShown && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    modalPushed = true;
    location.hash = "#/r/" + op.dataset.open;
    return;
  }
  const cp = e.target.closest("button[data-copy]");
  if (cp) {
    e.preventDefault();
    copyText(cp.dataset.copy).then((ok) => ok && flashCopied(cp));
  }
});

// copy icon -> green check for a moment
function flashCopied(btn) {
  btn.classList.add("done");
  btn.innerHTML = I.check;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = I.copy; }, 1200);
}
const copyBtn = (text, label) => `<button class="cbtn" data-copy="${esc(text)}" aria-label="${esc(label)}" title="${esc(label)}">${I.copy}</button>`;

// Turns database errors into something a person can act on.
function errText(e) {
  const m = String((e && e.message) || e);
  const rl = m.match(/rate limit: (\d+) recipes a day(?:; next one at (\S+))?/);
  if (rl) {
    let when = "";
    if (rl[2]) {
      const t = new Date(rl[2]);
      const time = t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
      when = t.toDateString() === new Date().toDateString() ? ` Try again at ${time}.`
        : ` Try again ${t.toLocaleDateString([], { weekday: "short" })} at ${time}.`;
    }
    return `Daily limit reached (${rl[1]} recipes a day).${when} Your draft is saved.`;
  }
  const cl = m.match(/rate limit: (\d+) comments an hour/);
  if (cl) return `Comment limit reached (${cl[1]} an hour). Try again in a bit.`;
  return m;
}

// Hover tooltip for [data-tip] (the early/late-layer warnings). One floating element, so cards can't clip it.
// On touch, tapping the icon shows it instead of opening the card.
const tipEl = document.createElement("div");
tipEl.className = "tip"; tipEl.hidden = true; tipEl.setAttribute("role", "tooltip");
document.body.appendChild(tipEl);
function showTip(t) {
  tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
  const r = t.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const y = r.top - h - 6 >= 8 ? r.top - h - 6 : r.bottom + 6;
  tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
}
const hideTip = () => { tipEl.hidden = true; };
document.addEventListener("mouseover", (e) => { const t = e.target.closest?.("[data-tip]"); if (t) showTip(t); else hideTip(); });
document.addEventListener("click", (e) => {
  const t = e.target.closest?.("[data-tip]");
  if (t) { e.preventDefault(); e.stopPropagation(); showTip(t); } else hideTip();
}, true);
addEventListener("scroll", hideTip, { passive: true });

function flashError(e) {
  console.error(e);
  const m = document.createElement("div");
  m.className = "err";
  m.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--bg);padding:8px 14px;border-radius:4px;box-shadow:var(--shadow);z-index:60";
  m.textContent = errText(e);
  document.body.appendChild(m);
  setTimeout(() => m.remove(), 6000);
}

// ------------------------------------------------------------------ search box
const qInput = $("#q");
const qTags = $("#qtags");
const suggest = $("#suggest");
let qState = { tags: [] };
let sugIdx = 0;
let sugNav = false; // true once the user arrows into the suggestions; Enter then picks one

function syncSearchBox(r) {
  const p = r.view === "browse" ? r.p : new URLSearchParams();
  qState.tags = (p.get("tags") || "").split(",").filter(Boolean);
  if (document.activeElement !== qInput) qInput.value = p.get("q") || "";
  qTags.innerHTML = qState.tags.map((t) => `<span class="chip">${esc(t)}<button data-untag="${esc(t)}" aria-label="remove ${esc(t)}">×</button></span>`).join("");
  qInput.placeholder = qState.tags.length ? "" : "search names, tags, L14N8949";
}

function currentBrowseParams() {
  const r = parseRoute();
  return r.view === "browse" ? Object.fromEntries(r.p.entries()) : {};
}

function searchTo(q, tags) {
  const p = currentBrowseParams();
  p.q = q;
  p.tags = tags;
  go(browseHref(p));
}

qTags.addEventListener("click", (e) => {
  const b = e.target.closest("[data-untag]");
  if (!b) return;
  searchTo(qInput.value, qState.tags.filter((t) => t !== b.dataset.untag));
});

function tagCounts(rs = RECIPES) {
  const c = {};
  for (const r of rs) for (const t of r.tags) c[t] = (c[t] || 0) + 1;
  return c;
}

function suggestions(text) {
  const s = text.trim().toLowerCase();
  if (!s) return [];
  const out = [];
  const nq = parseNeuronQuery(s);
  if (nq) {
    const k = neuronKey(nq);
    const n = RECIPES.filter((r) => r.neurons.some((x) => neuronKey(x) === k)).length;
    out.push({ kind: "neuron", label: k, n, act: () => searchTo(k, qState.tags) });
  }
  const tc = tagCounts();
  Object.keys(tc).filter((t) => t.includes(s.replace(/^#/, "")) && !qState.tags.includes(t))
    .sort((a, b) => (b.startsWith(s) - a.startsWith(s)) || tc[b] - tc[a]).slice(0, 5)
    .forEach((t) => out.push({ kind: "tag", label: t, n: tc[t], act: () => { qInput.value = ""; searchTo("", [...qState.tags, t]); } }));
  RECIPES.filter((r) => r.name.toLowerCase().includes(s)).slice(0, 5)
    .forEach((r) => out.push({ kind: "recipe", label: r.name, act: () => { modalPushed = listShown; location.hash = "#/r/" + r.id; } }));
  const models = [...new Set(RECIPES.map((r) => r.model))].filter((m) => m.toLowerCase().includes(s)).slice(0, 2);
  models.forEach((m) => out.push({ kind: "model", label: m, act: () => { const p = currentBrowseParams(); p.model = m; p.q = ""; qInput.value = ""; go(browseHref(p)); } }));
  return out;
}

function renderSuggest() {
  const items = suggestions(qInput.value);
  suggest.hidden = !items.length;
  sugIdx = Math.min(sugIdx, items.length - 1);
  suggest.innerHTML = items.map((it, i) => `<div class="row ${sugNav && i === sugIdx ? "on" : ""}" data-i="${i}">
    <span class="kind">${it.kind}</span>
    <span>${it.kind === "tag" ? `<span class="tag ${sugNav && i === sugIdx ? "on" : ""}">${esc(it.label)}</span>` : it.kind === "neuron" || it.kind === "model" ? `<span class="mono">${esc(it.label)}</span>` : esc(it.label)}</span>
    <span class="n">${it.n ?? ""}</span></div>`).join("");
  suggest._items = items;
}

qInput.addEventListener("input", () => { sugIdx = 0; sugNav = false; renderSuggest(); });
qInput.addEventListener("focus", renderSuggest);
qInput.addEventListener("blur", () => setTimeout(() => (suggest.hidden = true), 150));
qInput.addEventListener("keydown", (e) => {
  const items = suggest._items || [];
  if (e.key === "ArrowDown" && items.length) { sugIdx = sugNav ? (sugIdx + 1) % items.length : 0; sugNav = true; renderSuggest(); e.preventDefault(); }
  else if (e.key === "ArrowUp" && items.length) { sugIdx = (sugIdx - 1 + items.length) % items.length; sugNav = true; renderSuggest(); e.preventDefault(); }
  else if (e.key === "Enter") {
    e.preventDefault();
    const it = !suggest.hidden && sugNav && items[sugIdx];
    suggest.hidden = true;
    if (it) it.act();
    else searchTo(qInput.value.trim(), qState.tags);
  } else if (e.key === "Backspace" && !qInput.value && qState.tags.length) {
    searchTo("", qState.tags.slice(0, -1));
  } else if (e.key === "Escape") { suggest.hidden = true; qInput.blur(); }
});
suggest.addEventListener("mousedown", (e) => {
  const row = e.target.closest(".row");
  if (!row) return;
  e.preventDefault();
  suggest.hidden = true;
  suggest._items[+row.dataset.i].act();
});

// ------------------------------------------------------------------ filtering
function matchesQuery(r, q) {
  if (!q) return true;
  const ns = parseRecipeStr(q);
  if (ns.length) {
    const keys = new Set(r.neurons.map(neuronKey));
    if (!ns.every((n) => keys.has(neuronKey(n)))) return false;
    q = q.replace(/L\s*\d+\s*(?:E\s*\d+\s*)?N\s*\d+\s*(?:[+-]\s*\d*\.?\d+)?/gi, " ");
  }
  const hay = [r.name, r.description, r.tags.join(" "), r.author.handle, r.model, recipeStr(r.neurons), (r.aliases || []).join(" ")].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w.replace(/^[#@]/, "")));
}

function filterRecipes(p) {
  const tags = (p.tags || "").split(",").filter(Boolean);
  const models = (p.model || "").split(",").filter(Boolean);
  const authors = (p.author || "").split(",").filter(Boolean);
  const [lo, hi] = (p.layers || "").split("-").map((x) => (x === "" || x == null ? null : +x));
  return RECIPES.filter((r) => {
    if (!matchesQuery(r, p.q)) return false;
    if (tags.length && !tags.every((t) => r.tags.includes(t))) return false;
    if (models.length && !models.includes(r.model)) return false;
    if (authors.length && !authors.includes(r.author.handle)) return false;
    const n = r.neurons.length;
    if (p.n === "1" && n !== 1) return false;
    if (p.n === "2" && n !== 2) return false;
    if (p.n === "3" && n < 3) return false;
    if (p.sign === "up" && !r.neurons.every((x) => x.dose > 0)) return false;
    if (p.sign === "down" && !r.neurons.every((x) => x.dose < 0)) return false;
    if (p.sign === "mixed" && !(r.neurons.some((x) => x.dose > 0) && r.neurons.some((x) => x.dose < 0))) return false;
    if (lo != null || hi != null) {
      if (!r.neurons.some((x) => (lo == null || x.layer >= lo) && (hi == null || x.layer <= hi))) return false;
    }
    return true;
  });
}

const ageH = (r) => Math.max(0, (Date.now() - (Date.parse(r.date) || Date.now())) / 3.6e6);
function sortRecipes(rs, sort) {
  const a = [...rs];
  if (sort === "top") a.sort((x, y) => y.score - x.score || (y.date > x.date ? 1 : -1));
  else if (sort === "layer") {
    // shallowest neuron first, then the next one, so recipes sharing early layers sit together
    const ks = new Map(a.map((r) => [r, sortNeurons(r.neurons).map((n) => [n.layer, n.expert ?? -1, n.neuron])]));
    a.sort((x, y) => {
      const p = ks.get(x), q = ks.get(y);
      for (let i = 0; i < Math.min(p.length, q.length); i++)
        for (let j = 0; j < 3; j++) if (p[i][j] !== q[i][j]) return p[i][j] - q[i][j];
      return p.length - q.length || y.score - x.score;
    });
  }
  else if (sort === "new") a.sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : y.score - x.score));
  else a.sort((x, y) => (y.score + 1) / Math.pow(ageH(y) + 2, 1.5) - (x.score + 1) / Math.pow(ageH(x) + 2, 1.5));
  return a;
}

// ------------------------------------------------------------------ home
// ------------------------------------------------------------------ moderation (admins; opened from the menu, no URL)
async function renderMod() {
  if (overlay.innerHTML) closeModal(true);
  editorOpen = true; // any navigation leaves this view
  document.body.className = "page";
  main.innerHTML = `<div class="pagewrap"><div class="dim">…</div></div>`;
  let q;
  try { q = await store.modQueue(); } catch (e) { main.innerHTML = `<div class="pagewrap err">${esc(e.message)}</div>`; return; }
  const target = (kind, id) => {
    if (kind === "comment") {
      const c = q.comments[String(id)];
      if (!c) return `<span class="faint">comment ${esc(id)} (deleted)</span>`;
      return `<div class="mtext">${esc(c.body)}</div><div class="mmeta">@${esc(c.author_handle)} on <a href="#/r/${esc(c.recipe_id)}">${esc(c.recipe_id)}</a>
        <button class="btn sbtn" data-mhide="comment:${c.id}:${c.hidden ? 0 : 1}">${c.hidden ? I.eyeoff + "<span>Unhide</span>" : I.eyeoff + "<span>Hide</span>"}</button>${c.hidden ? ` <span class="err">hidden</span>` : ""}</div>`;
    }
    const r = q.recipes[id];
    if (!r) return `<span class="faint">recipe ${esc(id)} (deleted)</span>`;
    return `<div class="mtext"><a href="#/r/${esc(r.id)}">${esc(r.name)}</a>: ${esc(r.description)}</div><div class="mmeta">@${esc(r.author_handle)}
      <button class="btn sbtn" data-mhide="recipe:${r.id}:${r.hidden ? 0 : 1}">${I.eyeoff}<span>${r.hidden ? "Unhide" : "Hide"}</span></button>${r.hidden ? ` <span class="err">hidden</span>` : ""}</div>`;
  };
  const pending = q.log.filter((l) => l.verdict === "review" && !l.resolved_at);
  const review = pending.map((l) => `<li><div class="mhead"><span class="tag warn">review</span> ${esc(l.reason || "")}
      <span class="faint mono">${esc((l.model || "").split("/").pop())} · ${esc(ago(l.created_at))}</span>
      <button class="btn sbtn" data-mapprove="${l.id}:${l.kind}:${esc(l.target_id)}">${I.check}<span>Approve</span></button>
      <button class="btn sbtn quiet" data-mkeep="${l.id}">Keep hidden</button></div>${target(l.kind, l.target_id)}</li>`).join("");
  const reports = q.reports.map((rp) => `<li><div class="mhead"><span class="tag">report</span> ${esc(rp.reason)} <span class="faint">${esc(ago(rp.created_at))}</span>
      <button class="btn sbtn quiet" data-mclear="${rp.id}">dismiss</button></div>${rp.comment_id ? target("comment", rp.comment_id) : target("recipe", rp.recipe_id)}</li>`).join("");
  const log = q.log.map((l) => `<li><div class="mhead"><span class="tag ${l.verdict === "remove" ? "danger" : ""}">${l.verdict === "remove" ? "removed" : "allowed"}</span>
      ${esc(l.reason || l.error || "")} <span class="faint mono">${esc((l.model || "").split("/").pop())} · ${esc(ago(l.created_at))}</span></div>${target(l.kind, l.target_id)}</li>`).join("");
  main.innerHTML = `<div class="pagewrap mod">
    <h1>Moderation</h1>
    <h2>Waiting for review <span class="faint mono">${pending.length}</span></h2>
    ${review ? `<ul class="mlist">${review}</ul>` : `<div class="faint">—</div>`}
    <h2>Reports <span class="faint mono">${q.reports.length}</span></h2>
    ${reports ? `<ul class="mlist">${reports}</ul>` : `<div class="faint">—</div>`}
    <h2>jev's decisions <span class="faint mono">${q.log.length}</span></h2>
    ${log ? `<ul class="mlist">${log}</ul>` : `<div class="faint">—</div>`}
  </div>`;
  $$("[data-mhide]", main).forEach((b) => (b.onclick = async () => {
    const [kind, id, h] = b.dataset.mhide.split(":");
    try {
      if (kind === "comment") await store.hideComment(+id, h === "1"); else await store.setHidden(id, h === "1");
      RECIPES = await store.list();
      renderMod();
    } catch (e) { flashError(e); }
  }));
  $$("[data-mapprove]", main).forEach((b) => (b.onclick = async () => {
    const [logId, kind, id] = b.dataset.mapprove.split(":");
    try {
      if (kind === "comment") await store.hideComment(+id, false); else await store.setHidden(id, false);
      await store.resolveReview(+logId);
      RECIPES = await store.list();
      renderMod();
    } catch (e) { flashError(e); }
  }));
  $$("[data-mkeep]", main).forEach((b) => (b.onclick = async () => {
    try { await store.resolveReview(+b.dataset.mkeep); renderMod(); } catch (e) { flashError(e); }
  }));
  $$("[data-mclear]", main).forEach((b) => (b.onclick = async () => {
    try { await store.clearReport(+b.dataset.mclear); renderMod(); } catch (e) { flashError(e); }
  }));
}

// ------------------------------------------------------------------ API & agents (opened from the menu, no URL)
async function renderAgents(fresh = null) {
  if (overlay.innerHTML) closeModal(true);
  document.body.className = "page";
  const u = store.user();
  const base = store.apiBase();
  const mcpUrl = base + "/mcp";
  const tok = fresh || "nry_YOUR_TOKEN";
  let tokens = [];
  try { tokens = await store.listTokens(); } catch (e) { flashError(e); }
  const block = (title, text) => `<div class="cblock"><div class="cbhead"><span>${esc(title)}</span>${copyBtn(text, "copy")}</div><pre>${esc(text)}</pre></div>`;
  const claudeCode = `claude mcp add --transport http neuronary ${mcpUrl} --header "Authorization: Bearer ${tok}"`;
  const desktop = JSON.stringify({ mcpServers: { neuronary: { command: "npx", args: ["-y", "mcp-remote", mcpUrl, "--header", `Authorization:Bearer ${tok}`] } } }, null, 2);
  const curl = `# search (no token needed)\ncurl "${base}/recipes?q=evil"\n\n# publish\ncurl -X POST "${base}/recipes" \\\n  -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" \\\n  -d '{"name": "...", "description": "...", "model": "Qwen/Qwen3.5-4B", "recipe": "L13N7956-1.0 L14N8949+1.0",\n       "tags": ["persona"], "examples": [{"prompt": "...", "output": "..."}]}'`;
  const py = `# pip install requests; download clients/neuronary.py from the neuronary repo\nfrom neuronary import Neuronary\nnr = Neuronary(token="${tok}")\nnr.search("evil")\nnr.publish(name="...", description="...", model="Qwen/Qwen3.5-4B",\n           recipe="L13N7956-1.0 L14N8949+1.0", tags=["persona"],\n           examples=[{"prompt": "...", "output": "..."}])`;
  const shellLine = `mkdir -p ~/.neuronary && printf '%s' '${tok}' > ~/.neuronary/token && chmod 600 ~/.neuronary/token`;
  const agentLine = `Set up neuronary for me: read https://neuronary.org/agents.md`;
  const anon = u && u.anonymous;
  main.innerHTML = `<div class="pagewrap about agents">
    <h1>API & agents</h1>
    <p class="lead">Let Claude, the neuron explorer, or your own scripts search, download and publish recipes as you.
      Everything they post goes through the same checks and moderation as the site.</p>
    ${block("easiest: paste this to your agent; it walks you through the rest", agentLine)}

    <h2>Tokens</h2>
    ${anon ? `<p class="hidbanner">Tokens need a verified account. Sign in with Twitter, or link it from the account menu; your name and posts carry over.</p>` : `
    ${fresh ? `<div class="newtok"><div class="lab">your new token (shown once)</div><div class="idrow"><code class="mono">${esc(fresh)}</code>${copyBtn(fresh, "copy token")}</div></div>` : ""}
    <div class="tokform"><input data-tokname placeholder="name, e.g. claude code" maxlength="60"><button class="btn primary" data-tokmake>Create token</button></div>
    <ul class="toklist">${tokens.map((t) => `<li><b>${esc(t.name)}</b> <span class="mono dim">${esc(t.prefix)}…</span>
      <span class="faint">created ${esc(ago(t.created_at))}${t.last_used_at ? ` · used ${esc(ago(t.last_used_at))}` : " · never used"}</span>
      <button class="btn sbtn danger" data-tokrevoke="${t.id}">${I.trash}<span>Revoke</span></button></li>`).join("") || `<li class="faint">no tokens yet</li>`}</ul>`}

    <h2>Claude Code</h2>
    ${block("terminal", claudeCode)}
    <h2>Claude Desktop</h2>
    <p>Add this to <code>claude_desktop_config.json</code> (Settings → Developer → Edit config), then restart Claude.</p>
    ${block("claude_desktop_config.json", desktop)}
    <h2>Skill</h2>
    <p>The <a href="skill/neuronary/SKILL.md" target="_blank" rel="noopener">neuronary skill</a> teaches Claude the recipe format,
      dose units and the tools. Drop the <code>neuronary</code> folder into your skills directory (<code>~/.claude/skills/</code>).</p>
    <h2>Neuron explorer</h2>
    <p>The explorer's agent has neuronary tools (search, download, publish) once
      <a href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">neuron-explorer</a> is up to date.
      Give it a token one of two ways; it reads the file on every call, so no restart needed:</p>
    ${block("terminal", shellLine)}
    <h2>Python</h2>
    ${block("python", py)}
    <h2>HTTP</h2>
    ${block("curl", curl)}
    <p class="dim">Endpoints: <code>GET /recipes</code> (q, tag, model, neuron, author, sort, limit) · <code>GET /recipes/:id</code> ·
      <code>POST /recipes</code> · <code>PATCH /recipes/:id</code> · <code>POST /recipes/:id/comments</code> · <code>POST /recipes/:id/vote</code> · <code>GET /me</code></p>
  </div>`;
  const mk = $("[data-tokmake]", main);
  if (mk) mk.onclick = async () => {
    const name = $("[data-tokname]", main).value.trim() || "agent";
    mk.disabled = true;
    try { renderAgents(await store.createToken(name)); } catch (e) { flashError(e); mk.disabled = false; }
  };
  $$("[data-tokrevoke]", main).forEach((b) => (b.onclick = async () => {
    if (!confirm("Revoke this token? Agents using it stop working.")) return;
    try { await store.revokeToken(+b.dataset.tokrevoke); renderAgents(); } catch (e) { flashError(e); }
  }));
}

// ------------------------------------------------------------------ neuron page
function renderNeuron(key) {
  const q = parseNeuronQuery(key);
  if (!q) { main.innerHTML = `<div class="empty">Not a neuron id.</div>`; return; }
  const k = neuronKey(q);
  const uses = sortRecipes(RECIPES.filter((r) => r.neurons.some((n) => neuronKey(n) === k)), "top");
  const doses = uses.map((r) => r.neurons.find((n) => neuronKey(n) === k).dose);
  const models = [...new Set(uses.map((r) => r.model))];
  const range = doses.length ? (Math.min(...doses) === Math.max(...doses) ? doseStr(doses[0]) : `${doseStr(Math.min(...doses))} … ${doseStr(Math.max(...doses))}`) : "";
  document.title = `${k} · neuronary`;
  main.innerHTML = `<div class="nhead">
      <div class="idrow"><h1 class="rid">${k}</h1>${copyBtn(k, "copy neuron")}</div>
      <div class="meta">${uses.length} recipe${uses.length === 1 ? "" : "s"}${range ? ` &nbsp;·&nbsp; doses <span class="mono">${range}</span>` : ""}${models.length ? ` &nbsp;·&nbsp; <span class="mono">${models.map(esc).join(", ")}</span>` : ""}</div>
    </div>
    ${uses.length ? `<div class="grid">${uses.map((r) => cardHtml(r, [])).join("")}</div>` : `<div class="empty">No recipes use ${k} yet.</div>`}`;
}

// ------------------------------------------------------------------ browse
let openDd = null;
let filtersOpen = false; // mobile: filter dropdowns collapsed behind the funnel icon

function ddHtml(key, label, value, body) {
  return `<div class="dd ${value ? "active" : ""}" data-dd="${key}"><button type="button">${esc(value ? `${label}: ${value}` : label)}${I.chev}</button>
    ${openDd === key ? `<div class="pop">${body}</div>` : ""}</div>`;
}

function checklist(key, items, selected, find) {
  return `${find ? `<input type="text" data-find="${key}" placeholder="find" autocomplete="off">` : ""}
    <div data-list="${key}">${items.map(([v, n, label]) => `<label data-v="${esc(v)}"><input type="checkbox" data-key="${key}" value="${esc(v)}" ${selected.includes(v) ? "checked" : ""}>
    <span class="${key === "model" ? "mono" : ""}">${esc(label || v)}</span><span class="n">${n}</span></label>`).join("") || `<div class="lab">none</div>`}</div>
    ${selected.length ? `<div class="foot"><a href="#" data-clear="${key}">clear</a></div>` : ""}`;
}

function radios(key, opts, cur) {
  return opts.map(([v, label]) => `<label><input type="radio" name="${key}" data-key="${key}" value="${v}" ${String(cur || "") === v ? "checked" : ""}> ${esc(label)}</label>`).join("");
}

function renderBrowse(params) {
  const p = Object.fromEntries(params.entries());
  const view = p.view === "list" ? "list" : "cards";
  const sort = ["hot", "top", "new", "layer"].includes(p.sort) ? p.sort : "hot";
  document.body.className = view === "list" ? "list-mode" : "";
  const rs = sortRecipes(filterRecipes(p), sort);
  const tags = (p.tags || "").split(",").filter(Boolean);

  // facet counts come from the recipes matching everything except that facet
  const without = (k) => filterRecipes({ ...p, [k]: "" });
  const count = (rs2, f) => { const c = {}; for (const r of rs2) for (const v of f(r)) c[v] = (c[v] || 0) + 1; return c; };
  const mc = count(without("model"), (r) => [r.model]);
  const tcs = count(without("tags").filter((r) => tags.every((t) => r.tags.includes(t))), (r) => r.tags);
  const ac = count(without("author"), (r) => [r.author.handle]);
  const sel = (k) => (p[k] || "").split(",").filter(Boolean);
  const nLabel = { 1: "1", 2: "2", 3: "3+" }[p.n];
  const signLabel = { up: "only +", down: "only −", mixed: "mixed" }[p.sign];
  const models = sel("model");
  const authors = sel("author");
  const [lo, hi] = (p.layers || "").split("-");

  const nActive = ["model", "tags", "n", "sign", "layers", "author"].filter((k) => p[k]).length;
  const bar = `<div class="toolbar ${filtersOpen ? "open" : ""}">
    <span class="seg" id="sort">${["hot", "top", "new", "layer"].map((s) => `<button data-sort="${s}" class="${s === sort ? "on" : ""}">${s}</button>`).join("")}</span>
    <button class="ficon ${nActive ? "active" : ""}" data-ftoggle aria-label="filters" aria-expanded="${filtersOpen}">${I.filter}${nActive ? `<span class="badge">${nActive}</span>` : ""}</button>
    ${ddHtml("model", "model", models.length === 1 ? shortModel(models[0]) : models.length ? models.length : "",
      checklist("model", Object.entries(mc).sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, n]), models, true))}
    ${ddHtml("tags", "tags", tags.length === 1 ? tags[0] : tags.length || "",
      checklist("tags", Object.entries(tcs).sort((a, b) => b[1] - a[1]).map(([t, n]) => [t, n]), tags, true))}
    ${ddHtml("n", "neurons", nLabel, radios("n", [["", "any"], ["1", "1"], ["2", "2"], ["3", "3 or more"]], p.n))}
    ${ddHtml("sign", "sign", signLabel, radios("sign", [["", "any"], ["up", "only +"], ["down", "only −"], ["mixed", "mixed"]], p.sign))}
    ${ddHtml("layers", "layers", p.layers ? `${lo || 0}–${hi || "∞"}` : "",
      `<div class="lab">any neuron in layers</div><div class="range"><input type="text" inputmode="numeric" data-lo value="${esc(lo || "")}" placeholder="0">
       <span class="dim">to</span><input type="text" inputmode="numeric" data-hi value="${esc(hi || "")}" placeholder="∞"></div>
       <div class="foot"><a href="#" data-clear="layers">clear</a><a href="#" data-apply-layers>apply</a></div>`)}
    ${ddHtml("author", "author", authors.length === 1 ? "@" + authors[0] : authors.length || "",
      checklist("author", Object.entries(ac).sort((a, b) => b[1] - a[1]).map(([a, n]) => [a, n, "@" + a]), authors, true))}
    <span class="count">${rs.length} ${rs.length === 1 ? "recipe" : "recipes"}</span>
    <span class="seg viewtoggle">${[["cards", I.grid], ["list", I.rows]].map(([v, ic]) => `<button data-view="${v}" class="${v === view ? "on" : ""}" aria-label="${v}">${ic}</button>`).join("")}</span>
  </div>`;

  let body;
  if (!rs.length) body = `<div class="empty">No recipes match.</div>`;
  else if (view === "cards") body = `<div class="grid">${rs.map((r) => cardHtml(r, tags)).join("")}</div>`;
  else body = `<div class="list"><table><thead><tr><th></th><th>name</th><th>neurons</th><th class="hide-s">tags</th><th class="hide-s">model</th><th></th></tr></thead><tbody>
    ${rs.map((r) => `<tr class="row" data-open="${esc(r.id)}" data-href="#/r/${esc(r.id)}">
      <td class="vcol">${votesHtml(r)}</td>
      <td><div class="nm">${esc(r.name)}<span class="who">@${esc(r.author.handle)}</span></div><div class="ds">${esc(r.description)}</div></td>
      <td><span class="rid">${recipeHtml(r.neurons)}</span>${edgeMark(r.neurons, r.model)}</td>
      <td class="hide-s"><div class="tags">${r.tags.slice(0, 4).map((t) => `<span class="tag ${tags.includes(t) ? "on" : ""}">${esc(t)}</span>`).join("")}</div></td>
      <td class="hide-s model">${esc(shortModel(r.model))}</td>
      <td><span class="cmt">${I.bubble}${r.comments}</span></td></tr>`).join("")}</tbody></table></div>`;

  main.innerHTML = bar + body;
  wireBrowse(p);
}

function wireBrowse(p) {
  const set = (k, v) => { const q = { ...p, [k]: v }; go(browseHref(q)); };
  $$("[data-sort]").forEach((b) => (b.onclick = () => set("sort", b.dataset.sort)));
  const ft = $("[data-ftoggle]");
  if (ft) ft.onclick = (e) => { e.stopPropagation(); filtersOpen = !filtersOpen; openDd = null; renderBrowse(new URLSearchParams(Object.entries(p))); };
  $$("[data-view]").forEach((b) => (b.onclick = () => set("view", b.dataset.view === "cards" ? "" : b.dataset.view)));
  $$(".dd > button").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const k = b.parentElement.dataset.dd;
    openDd = openDd === k ? null : k;
    renderBrowse(new URLSearchParams(Object.entries(p)));
    const f = $(`.pop [data-find]`) || $(".pop input");
    if (f) f.focus();
  }));
  $$(".pop").forEach((pop) => pop.addEventListener("click", (e) => e.stopPropagation()));
  $$('.pop input[type=checkbox]').forEach((c) => (c.onchange = () => {
    const k = c.dataset.key;
    const vals = $$(`.pop input[data-key="${k}"]:checked`).map((x) => x.value);
    set(k, vals.join(","));
  }));
  $$('.pop input[type=radio]').forEach((c) => (c.onchange = () => { openDd = null; set(c.dataset.key, c.value); }));
  $$("[data-clear]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDd = null; set(a.dataset.clear, ""); }));
  const applyLayers = () => {
    const lo = $("[data-lo]").value.trim(), hi = $("[data-hi]").value.trim();
    openDd = null;
    set("layers", lo || hi ? `${lo}-${hi}` : "");
  };
  const al = $("[data-apply-layers]");
  if (al) {
    al.onclick = (e) => { e.preventDefault(); applyLayers(); };
    $$(".range input").forEach((i) => (i.onkeydown = (e) => e.key === "Enter" && applyLayers()));
  }
  $$("[data-find]").forEach((f) => (f.oninput = () => {
    const s = f.value.toLowerCase();
    $$(`[data-list="${f.dataset.find}"] label`).forEach((l) => (l.hidden = !l.dataset.v.toLowerCase().includes(s)));
  }));
  $$("tr.row").forEach((tr) => tr.addEventListener("auxclick", (e) => e.button === 1 && window.open(tr.dataset.href)));
}

document.addEventListener("click", () => {
  if (openDd) {
    openDd = null;
    const r = parseRoute();
    if (r.view === "browse") renderBrowse(r.p);
  }
});

// ------------------------------------------------------------------ recipe
function neuronUses(n) {
  const k = neuronKey(n);
  return RECIPES.filter((r) => r.neurons.some((x) => neuronKey(x) === k)).length;
}

function recipeHtmlBlock(r, { modal }) {
  const cat = (CFG.categories || []).find((c) => r.tags.includes(c.tag));
  const m = methodOf(r);
  const sk = setKey(r.neurons);
  const aka = RECIPES.filter((x) => x.id !== r.id && setKey(x.neurons) === sk).sort((a, b) => b.score - a.score);
  const keys = new Set(r.neurons.map(neuronKey));
  const related = RECIPES.filter((x) => x.id !== r.id && setKey(x.neurons) !== sk && x.neurons.some((n) => keys.has(neuronKey(n))))
    .sort((a, b) => b.score - a.score).slice(0, 6);
  const hasBase = (r.examples || []).some((e) => e.base_output);
  const studio = studioFile(r);
  const methodTxt = `${m.op}${m.apply_to !== "all_tokens" ? " · " + m.apply_to.replace("_", " ") : " · all tokens"}${m.op === "add" ? (m.normalization === "raw" ? " · raw units" : " · ×median resid") : ""}`;

  const examples = (r.examples || []).map((e, i) => `<div class="ex" data-ex="${i}">
      <div class="p">${esc(e.prompt)}</div>
      <div class="single"><div class="o md">${md(e.output)}</div></div>
      ${e.base_output ? `<div class="pair" hidden><div><div class="lab s">steered${e.scale && e.scale !== 1 ? " ×" + e.scale : ""}</div><div class="o md">${md(e.output)}</div></div>
        <div><div class="lab b">base</div><div class="o b-o md">${md(e.base_output)}</div></div></div>` : ""}
      ${e.scale && e.scale !== 1 ? `<div class="gen">doses ×${e.scale}</div>` : ""}
    </div>`).join("");

  return `<div class="rec">
    <div class="rhead">
      ${cat ? `<div class="crumb"><a href="#/c/${esc(cat.tag)}">${esc(cat.name)}</a> &nbsp;›&nbsp; ${esc(r.name)}</div>` : ""}
      ${r.hidden ? `<div class="hidbanner">${store.user() && store.user().admin ? "Hidden: only you and admins can see this recipe." : "Waiting for review: only you can see this recipe until a moderator approves it."}${store.user() && store.user().admin ? ` <button class="btn sbtn" data-ract="hide">${I.eyeoff}<span>Unhide</span></button>` : ""}</div>` : ""}
      <h1>${esc(r.name)}</h1>
      <div class="idrow"><span class="rid idline">${recipeHtml(r.neurons)}</span>${copyBtn(recipeStr(r.neurons), "copy recipe")}${edgeMark(r.neurons, r.model)}</div>
      <div class="meta">${r.author.url ? `<a href="${esc(r.author.url)}" target="_blank" rel="noopener">@${esc(r.author.handle)}</a>` : `<a href="${browseHref({ author: r.author.handle })}">@${esc(r.author.handle)}</a>`}
        &nbsp;·&nbsp; <a href="${browseHref({ model: r.model })}" class="mono">${esc(r.model)}</a>${r.date ? ` &nbsp;·&nbsp; ${esc(r.date.slice(0, 10))}` : ""}
        ${r.source ? ` &nbsp;·&nbsp; <a href="${esc(r.source)}" target="_blank" rel="noopener">source</a>` : ""}${r.origin === "local" ? ` &nbsp;·&nbsp; <span class="faint">only in this browser</span>` : ""}${r.origin === "demo" ? ` &nbsp;·&nbsp; <span class="faint">demo fixture</span>` : ""}
</div>
      ${recipeActions(r)}
      <div class="desc">${esc(r.description)}</div>
      <div class="tags">${tagsHtml(r.tags)}</div>
    </div>
    <div class="rbody">
      <section>
        <div class="sechead"><h2>Examples</h2><span class="faint mono">${(r.examples || []).length}</span>
          ${hasBase ? `<span class="seg" data-exmode><button class="on" data-m="s">steered</button><button data-m="b">vs base</button></span>` : ""}</div>
        ${examples || `<div class="faint">—</div>`}
      </section>
      <section>
        <div class="sechead"><h2>Comments</h2><span class="faint mono" data-ccount>${r.comments}</span></div>
        <div data-comments><div class="dim">…</div></div>
      </section>
    </div>
    <aside class="rail">
      <div class="vote v${r.myVote}" data-vote="${esc(r.id)}"><button class="upv" data-v="1" aria-label="upvote">${I.up}</button>
        <span class="n">${r.score}</span><button class="downv" data-v="-1" aria-label="downvote">${I.down}</button></div>
      <div class="copies">
        <button class="btn ibtn" data-act="json" title="copy the recipe as JSON">${I.copy}<span>JSON</span></button>
        <button class="btn ibtn" data-act="py" title="copy a Python script that runs it">${I.copy}<span>Python</span></button>
        ${studio ? `<button class="btn ibtn" data-act="studio" title="download a file Neuron Studio can import">${I.download}<span>Studio</span></button>` : ""}
      </div>
      <div class="blk"><div class="lab">neurons</div>
        ${sortNeurons(r.neurons).map((n) => { const u = neuronUses(n) - 1; return `<div class="nrow"><span class="rid">${neuronHtml(n)}</span>${copyBtn(neuronStr(n), "copy neuron")}
          ${u > 0 ? `<a class="in" href="#/n/${neuronKey(n)}">in ${u} other${u === 1 ? "" : "s"}</a>` : ""}</div>`; }).join("")}
      </div>
      <div class="blk"><div class="lab">method</div><div class="mono">${esc(methodTxt)}</div></div>
      ${samplingText(r) ? `<div class="blk"><div class="lab">recommended sampling</div><div class="mono">${esc(samplingText(r))}</div></div>` : ""}
      ${aka.length || (r.aliases || []).length ? `<div class="blk"><div class="lab">also known as</div>
        ${(r.aliases || []).map((a) => `<div class="alias"><span>${esc(a)}</span></div>`).join("")}
        ${aka.map((x) => `<div class="alias"><a href="#/r/${esc(x.id)}">${esc(x.name)}</a><span class="s">${x.score}</span></div>`).join("")}</div>` : ""}
      ${related.length ? `<div class="blk"><div class="lab">shares neurons with</div>
        ${related.map((x) => `<a class="rel" href="#/r/${esc(x.id)}"><span class="t">${esc(x.name)}</span><span class="rid">${recipeHtml(x.neurons)}</span></a>`).join("")}</div>` : ""}
      ${r.notes ? `<div class="blk"><div class="lab">notes</div><div class="notes">${linkify(r.notes)}</div></div>` : ""}
      ${r.conditional ? `<div class="blk"><div class="lab">conditional</div><pre>${esc(JSON.stringify(r.conditional, null, 2))}</pre></div>` : ""}
    </aside>
  </div>`;
}

async function loadRecipe(id) {
  const r = await store.get(id);
  if (!r) return null;
  const i = RECIPES.findIndex((x) => x.id === id);
  if (i >= 0) RECIPES[i] = { ...RECIPES[i], ...r };
  return r;
}

function recipeActions(r) {
  const out = [];
  const b = (act, icon, label, cls = "") => `<button class="btn sbtn ${cls}" data-ract="${act}">${icon}<span>${label}</span></button>`;
  if (store.canEdit && store.canEdit(r)) {
    out.push(`<button class="btn sbtn" data-ract="edit">${I.edit}<span>Edit</span></button>`);
  }
  const u = store.user();
  if (u && u.admin && store.mode === "supabase") out.push(b("hide", I.eyeoff, r.hidden ? "Unhide" : "Hide"));
  if (store.canEdit && store.canEdit(r) && r.origin !== "repo") out.push(b("delete", I.trash, "Delete", "danger")); // repo recipes would sync back
  if (store.mode === "supabase" && !(store.canEdit && store.canEdit(r))) out.push(b("report", I.flag, "Report", "quiet"));
  return out.length ? `<div class="ractions">${out.join("")}</div>` : "";
}

function wireRecipe(root, r) {
  $$("[data-ract]", root).forEach((b) => (b.onclick = async () => {
    const a = b.dataset.ract;
    try {
      if (a === "edit") {
        if (overlay.innerHTML) { closeModal(true); }
        return openEditor(r.id);
      }
      if (a === "delete") {
        if (!confirm(`Delete “${r.name}”? Votes and comments go with it.`)) return;
        await store.remove(r.id);
        RECIPES = RECIPES.filter((x) => x.id !== r.id);
        if (overlay.innerHTML) { closeModal(true); listShown = false; }
        location.hash = "#/";
      } else if (a === "hide") {
        await store.setHidden(r.id, !r.hidden);
        RECIPES = await store.list();
        b.querySelector("span").textContent = r.hidden ? "Hide" : "Unhide";
        r.hidden = !r.hidden;
      } else if (a === "report") {
        if (!signedIn()) return signInPrompt("report");
        const reason = prompt("What's wrong with this recipe?");
        if (!reason || !reason.trim()) return;
        await store.report({ recipeId: r.id, reason: reason.trim() });
        b.querySelector("span").textContent = "Reported";
        b.disabled = true;
      }
    } catch (e) { flashError(e); }
  }));
  const seg = $("[data-exmode]", root);
  if (seg) seg.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$("button", seg).forEach((x) => x.classList.toggle("on", x === b));
    const vs = b.dataset.m === "b";
    $$(".ex", root).forEach((ex) => {
      const pair = $(".pair", ex);
      if (!pair) return;
      pair.hidden = !vs;
      $(".single", ex).hidden = vs;
    });
  };
  $$("[data-act]", root).forEach((b) => (b.onclick = async () => {
    const a = b.dataset.act;
    if (a === "json") { if (await copyText(recipeJson(r))) flashBtn(b); }
    if (a === "py") { if (await copyText(pythonSnippet(r))) flashBtn(b); }
    if (a === "studio") { download(`${r.id}.neuron-studio.json`, JSON.stringify(studioFile(r), null, 2)); flashBtn(b); }
  }));
  renderComments(root, r);
}

function flashBtn(b) {
  const lab = b.querySelector("span") || b;
  if (!b.dataset.t) b.dataset.t = lab.textContent;
  b.classList.add("flash-ok");
  lab.textContent = b.dataset.act === "studio" ? "Saved" : "Copied";
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.classList.remove("flash-ok"); lab.textContent = b.dataset.t; }, 1100);
}

async function openModal(id) {
  document.body.classList.add("modal-open");
  overlay.innerHTML = `<div class="modal"><div class="sheet"><div class="dim">…</div></div></div>`;
  // closes with back, Escape, or a tap on the scrim around the sheet (no close button)
  const modal = $(".modal", overlay);
  modal.onclick = (e) => { if (e.target === modal) closeModalNav(); };
  swipeToClose(modal);
  let r;
  try { r = await loadRecipe(id); } catch (e) { flashError(e); }
  if (parseRoute().id !== id) return;
  const sheet = $(".sheet", overlay);
  if (!r) { sheet.innerHTML = `<div class="empty">No recipe called “${esc(id)}”.</div>`; return; }
  document.title = `${r.name} · neuronary`;
  sheet.innerHTML = `${recipeHtmlBlock(r, { modal: true })}`;
  wireRecipe(sheet, r);
}

// Touch: dragging the sheet down while it's scrolled to the top follows the finger, and past a threshold closes it.
// Also keeps Chrome's pull-to-refresh from firing on that drag.
function swipeToClose(modal) {
  let y0 = null, dy = 0;
  const sheet = () => $(".sheet", modal);
  modal.addEventListener("touchstart", (e) => {
    y0 = modal.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; dy = 0;
  }, { passive: true });
  modal.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) { y0 = modal.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; sheet().style.translate = ""; return; }
    e.preventDefault();
    const s = sheet(); s.style.transition = "none"; s.style.translate = `0 ${dy}px`;
  }, { passive: false });
  modal.addEventListener("touchend", () => {
    if (y0 == null) return;
    const s = sheet(); s.style.transition = "";
    if (dy > 90) { s.style.translate = "0 100vh"; setTimeout(closeModalNav, 140); }
    else s.style.translate = "";
    y0 = null; dy = 0;
  });
}

function closeModalNav() {
  if (modalPushed) history.back();
  else location.hash = lastListHash;
}

function closeModal(silent) {
  if (!overlay.innerHTML) return;
  overlay.innerHTML = "";
  document.body.classList.remove("modal-open");
  document.title = "neuronary";
  if (!silent) closeModalNav();
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlay.innerHTML) closeModalNav(); });

// comments
async function renderComments(root, r) {
  const box = $("[data-comments]", root);
  let list = [];
  try { list = await store.comments(r.id); } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const u = store.user();
  const top = list.filter((c) => !c.parent_id);
  const kids = (id) => list.filter((c) => c.parent_id === id);
  const one = (c) => `<li data-cid="${c.id}"${c.hidden ? ' style="opacity:.45"' : ""}>${avatarHtml(c.handle, c.avatar_url)}<div>
      <div class="h"><b>${esc(c.handle)}</b><span>${esc(ago(c.created_at))}</span></div>
      <div class="b">${esc(c.body)}</div>
      <div class="act">${!c.parent_id ? `<button data-reply="${c.id}">reply</button>` : ""}${(u && u.handle === c.handle) || (u && u.admin) ? `<button data-del="${c.id}">delete</button>` : ""}${u && u.admin && store.mode === "supabase" ? `<button data-hide="${c.id}" data-h="${c.hidden ? 0 : 1}">${c.hidden ? "unhide" : "hide"}</button>` : ""}${store.mode === "supabase" && !(u && u.handle === c.handle) ? `<button data-rep="${c.id}">report</button>` : ""}</div>
      ${!c.parent_id ? `<ul>${kids(c.id).map(one).join("")}</ul><div data-replybox="${c.id}"></div>` : ""}</div></li>`;
  box.innerHTML = `<div class="cbox"><textarea placeholder="${u ? "add a comment" : "sign in to comment"}" data-new></textarea>
      <button class="btn" data-post hidden>Post</button></div>
    ${store.mode === "supabase" ? `<div class="modnote">moderated by <a href="https://typesafe.ai" target="_blank" rel="noopener">jev</a></div>` : ""}
    <ul class="cmts">${top.map(one).join("")}</ul>`;
  const cc = $("[data-ccount]", root);
  if (cc) cc.textContent = list.length;
  const ta = $("[data-new]", box);
  const post = $("[data-post]", box);
  ta.onfocus = () => { if (!signedIn()) { ta.blur(); signInPrompt("comment"); } };
  ta.oninput = () => (post.hidden = !ta.value.trim());
  const send = async (body, parent, btn) => {
    btn.disabled = true;
    try {
      await store.comment(r.id, body, parent);
      const rr = RECIPES.find((x) => x.id === r.id);
      if (rr) rr.comments += 1;
      renderComments(root, r);
    } catch (e) { flashError(e); btn.disabled = false; }
  };
  post.onclick = () => send(ta.value.trim(), null, post);
  ta.onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && ta.value.trim()) send(ta.value.trim(), null, post); };
  $$("[data-reply]", box).forEach((b) => (b.onclick = () => {
    if (!signedIn()) return signInPrompt("comment");
    const slot = $(`[data-replybox="${b.dataset.reply}"]`, box);
    slot.innerHTML = `<div class="cbox" style="margin:10px 0 0"><textarea placeholder="reply"></textarea><button class="btn">Reply</button></div>`;
    const t = $("textarea", slot);
    t.focus();
    $("button", slot).onclick = (e) => t.value.trim() && send(t.value.trim(), +b.dataset.reply, e.currentTarget);
  }));
  $$("[data-hide]", box).forEach((b) => (b.onclick = async () => {
    try { await store.hideComment(+b.dataset.hide, b.dataset.h === "1"); renderComments(root, r); } catch (e) { flashError(e); }
  }));
  $$("[data-rep]", box).forEach((b) => (b.onclick = async () => {
    if (!signedIn()) return signInPrompt("report");
    const reason = prompt("What's wrong with this comment?");
    if (!reason || !reason.trim()) return;
    try { await store.report({ commentId: +b.dataset.rep, reason: reason.trim() }); b.textContent = "reported"; b.disabled = true; } catch (e) { flashError(e); }
  }));
  $$("[data-del]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this comment?")) return;
    try { await store.deleteComment(r.id, +b.dataset.del); renderComments(root, r); } catch (e) { flashError(e); }
  }));
}

// ------------------------------------------------------------------ auth
// Supabase has two X providers: "x" (OAuth 2.0) and the older "twitter" (OAuth 1.0a); use whichever is configured
const xProvider = () => (store.providers ? store.providers() : []).find((p) => p === "x" || p === "twitter");

function signedIn() {
  const u = store.user();
  return !!u && !u.needsHandle;
}

let popJustOpened = false; // a pop opened by a click must survive that same click reaching document
function closePops() { $$(".signin-pop, .me-pop").forEach((x) => x.remove()); }
document.addEventListener("click", () => { if (!popJustOpened) closePops(); });

function renderMe() {
  const u = store.user();
  const me = $("#me");
  if (u && !u.needsHandle) {
    me.innerHTML = `<button id="mebtn" aria-label="account">${avatarHtml(u.handle, u.avatar)}</button>`;
    $("#mebtn").onclick = (e) => { e.stopPropagation(); meMenu(u); };
  } else {
    me.innerHTML = `<button id="signin">${u ? "pick a name" : "sign in"}</button>`;
    $("#signin").onclick = (e) => { e.stopPropagation(); signInPrompt(); };
  }
}

function popAt(cls) {
  closePops();
  popJustOpened = true;
  setTimeout(() => (popJustOpened = false), 0);
  const pop = document.createElement("div");
  pop.className = "pop " + cls;
  pop.style.cssText = "position:fixed;top:60px;right:20px;left:auto;width:280px;z-index:70";
  pop.addEventListener("click", (e) => e.stopPropagation());
  document.body.appendChild(pop);
  return pop;
}

function meMenu(u) {
  const pop = popAt("me-pop");
  const canLinkX = store.mode === "supabase" && u.anonymous && !!xProvider();
  pop.innerHTML = `<div class="lab">signed in as <b style="color:var(--ink)">@${esc(u.handle)}</b>${u.admin ? " · admin" : ""}${store.mode === "local" ? " (this browser only)" : ""}</div>
    <a class="menu-i" href="${browseHref({ author: u.handle })}">your recipes</a>
    ${store.listTokens ? `<button class="menu-i" data-agents>API & agents</button>` : ""}
    ${u.admin && store.modQueue ? `<button class="menu-i" data-mod>moderation</button>` : ""}
    ${canLinkX ? `<button class="menu-i" data-link>link your X account</button>` : ""}
    <button class="menu-i danger" data-out>sign out</button>
    ${u.anonymous ? `<div class="lab" style="font-size:11.5px">This name lives in this browser's session. Signing out loses it${canLinkX ? " unless you link X first" : ""}.</div>` : ""}`;
  $$("a.menu-i", pop).forEach((x) => (x.onclick = closePops));
  const mb = $("[data-mod]", pop);
  if (mb) mb.onclick = () => { closePops(); renderMod(); };
  const ab = $("[data-agents]", pop);
  if (ab) ab.onclick = () => { closePops(); renderAgents(); };
  const l = $("[data-link]", pop);
  if (l) l.onclick = () => store.linkWith(xProvider()).catch(flashError);
  $("[data-out]", pop).onclick = async () => {
    if (u.anonymous && !confirm("Sign out? This anonymous name can't be recovered.")) return;
    closePops();
    await store.signOut();
  };
}

function signInPrompt(why, then = null) {
  const pop = popAt("signin-pop");
  const u = store.user();
  const x = store.mode === "supabase" && !u && xProvider();
  pop.innerHTML = `${why ? `<div class="lab">sign in to ${esc(why)}</div>` : ""}
    ${x ? `<button class="xbtn" data-x>${I.x}Sign in with Twitter</button><div class="lab">or pick a name</div>` : `<div class="lab">pick a name${store.mode === "local" ? " (kept in this browser)" : ""}</div>`}
    <input type="text" placeholder="name" autocomplete="off" maxlength="24" spellcheck="false">
    <div class="err" data-err></div>
    <div class="foot"><a href="#" data-cancel>cancel</a><a href="#" data-ok>continue</a></div>`;
  const inp = $("input", pop);
  if (!x) inp.focus();
  const err = $("[data-err]", pop);
  const ok = async () => {
    const h = inp.value.trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{2,24}$/.test(h)) { err.textContent = "2–24 letters, digits or _"; return; }
    err.textContent = "";
    try {
      if (u && u.needsHandle) await store.claimHandle(h); else await store.signIn(h);
      closePops();
      if (then) then();
    } catch (e) {
      err.textContent = /taken|duplicate|unique/i.test(e.message) ? "that name is taken" : e.message;
    }
  };
  const xb = $("[data-x]", pop);
  if (xb) xb.onclick = () => {
    if (editorOpen && !editing) sessionStorage.setItem("nr.reopenSubmit", "1");
    store.signInWith(xProvider()).catch(flashError);
  };
  $("[data-ok]", pop).onclick = (e) => { e.preventDefault(); ok(); };
  $("[data-cancel]", pop).onclick = (e) => { e.preventDefault(); sessionStorage.removeItem("nr.reopenSubmit"); closePops(); };
  inp.onkeydown = (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") closePops(); };
}

// ------------------------------------------------------------------ theme
$("#theme").innerHTML = I.theme;
$("#theme").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  localStorage.setItem("nr.theme", t);
};

// ------------------------------------------------------------------ submit
const DRAFT_KEY = "nr.draft";
const emptyDraft = () => ({ name: "", description: "", model: "Qwen/Qwen3.5-4B", tags: [], neurons: [{ layer: "", neuron: "", dose: "" }],
  op: "add", rep: "", temp: "", examples: [{ prompt: "", output: "", base_output: "" }], source: "", notes: "" });

let editing = null; // recipe id while editing an existing recipe
const draftKey = () => (editing ? `nr.draft.edit.${editing}` : DRAFT_KEY);

function loadDraft() {
  try { return { ...emptyDraft(), ...JSON.parse(localStorage.getItem(draftKey())) }; } catch { return emptyDraft(); }
}

function recipeToDraft(r) {
  const s = r.sampling || {};
  return {
    name: r.name, description: r.description, model: r.model, tags: [...r.tags],
    neurons: sortNeurons(r.neurons).map((n) => ({ layer: String(n.layer), neuron: String(n.neuron), dose: String(n.dose), ...(n.expert != null ? { expert: String(n.expert) } : {}) })),
    op: (r.method && r.method.op) || "add", rep: s.repetition_penalty ?? "", temp: s.temperature ?? "",
    examples: (r.examples && r.examples.length ? r.examples : [{ prompt: "", output: "" }]).map((e) => ({ prompt: e.prompt, output: e.output, base_output: e.base_output || "" })),
    source: r.source || "", notes: r.notes || "", _orig: { method: r.method || null, sampling: r.sampling || null, conditional: r.conditional || null, aliases: r.aliases || [], examples: r.examples || [] },
  };
}

let editorOpen = false;
let editorReturn = null; // scroll position of the page underneath

// submit / edit live in the main area without changing the URL; any navigation closes them
function openEditor(id = null) {
  closePops();
  if (!editorOpen) history.pushState({ editor: true }, "", location.href); // Back closes the form (no URL of its own)
  editorOpen = true;
  listShown = false; // the form replaces the list in main
  editorReturn = scrollY;
  document.body.className = "page-submit";
  scrollTo(0, 0);
  if (id) return startEdit(id);
  editing = null;
  renderSubmit();
}

window.addEventListener("popstate", (e) => {
  if (editorOpen && !(e.state && e.state.editor)) { editorOpen = false; editing = null; route(); }
});

function closeEditor() {
  if (history.state && history.state.editor) { history.back(); return; } // popstate re-routes
  editorOpen = false;
  editing = null;
  route().then(() => editorReturn != null && scrollTo(0, editorReturn));
}

async function startEdit(id) {
  main.innerHTML = `<div class="empty">…</div>`;
  let r = null;
  try { r = await loadRecipe(id); } catch (e) { flashError(e); }
  if (!r || !(store.canEdit && store.canEdit(r))) { main.innerHTML = `<div class="empty">You can't edit this recipe.</div>`; return; }
  editing = id;
  if (!localStorage.getItem(draftKey())) localStorage.setItem(draftKey(), JSON.stringify(recipeToDraft(r)));
  renderSubmit();
}

function draftToRecipe(d, id) {
  const neurons = d.neurons.filter((n) => n.layer !== "" || n.neuron !== "" || n.dose !== "").map((n) => {
    const x = { layer: Number(n.layer), neuron: Number(n.neuron), dose: Number(n.dose) };
    if (n.expert !== undefined && n.expert !== "") x.expert = Number(n.expert);
    return x;
  });
  const u = store.user();
  const r = {
    id, name: d.name.trim(), description: d.description.trim(), model: d.model.trim(), neurons,
    tags: d.tags, examples: d.examples.filter((e) => e.prompt.trim() || e.output.trim()).map((e) => {
      const o = { prompt: e.prompt.trim(), output: e.output.trim() };
      if (e.base_output && e.base_output.trim()) o.base_output = e.base_output.trim();
      return o;
    }),
    author: { handle: u ? u.handle : "anonymous", ...(u && u.url ? { url: u.url } : {}) },
    date: new Date().toISOString().slice(0, 10),
  };
  if (d.op === "mul") r.method = { op: "mul" };
  const sampling = {};
  if (String(d.rep).trim() !== "" && Number(d.rep) !== 1) sampling.repetition_penalty = Number(d.rep);
  if (String(d.temp).trim() !== "") sampling.temperature = Number(d.temp);
  if (Object.keys(sampling).length) r.sampling = sampling;
  if (d.source.trim()) r.source = d.source.trim();
  if (d.notes.trim()) r.notes = d.notes.trim();
  return r;
}

function validate(d) {
  const errs = {};
  if (!d.name.trim()) errs.name = "required";
  else if (d.name.length > 80) errs.name = "80 characters max";
  if (!d.description.trim()) errs.description = "required";
  else if (d.description.length > 600) errs.description = "600 characters max";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(d.model.trim())) errs.model = "a Hugging Face id like Qwen/Qwen3.5-4B";
  if (!d.tags.length) errs.tags = "at least one";
  const rows = d.neurons.filter((n) => n.layer !== "" || n.neuron !== "" || n.dose !== "");
  if (!rows.length) errs.neurons = "at least one neuron";
  else if (rows.some((n) => !/^\d+$/.test(String(n.layer)) || !/^\d+$/.test(String(n.neuron)) || !Number.isFinite(Number(n.dose)) || String(n.dose).trim() === ""))
    errs.neurons = "layer and neuron are whole numbers, dose a number";
  else {
    const keys = rows.map((n) => `${n.layer}:${n.expert ?? ""}:${n.neuron}`);
    if (new Set(keys).size !== keys.length) errs.neurons = "a neuron appears twice";
  }
  if (String(d.rep).trim() !== "" && !(Number(d.rep) >= 1 && Number(d.rep) <= 3)) errs.sampling = "rep pen between 1 and 3";
  if (String(d.temp).trim() !== "" && !(Number(d.temp) >= 0 && Number(d.temp) <= 5)) errs.sampling = "temperature between 0 and 5";
  const ex = d.examples.filter((e) => e.prompt.trim() || e.output.trim());
  if (!ex.length) errs.examples = "at least one example";
  else if (ex.some((e) => !e.prompt.trim() || !e.output.trim())) errs.examples = "each example needs a prompt and the steered output";
  return errs;
}

let submitGen = 0;
function renderSubmit() {
  const gen = ++submitGen;
  const live = () => gen === submitGen; // handlers on a replaced form (blur during re-render) must do nothing
  const d = loadDraft();
  const u = store.user();
  const tc = tagCounts();
  const models = [...new Set(["Qwen/Qwen3.5-4B", ...RECIPES.map((r) => r.model)])];

  main.innerHTML = `<div class="submit">
    <div class="panel">
      <h1>${editing ? "Edit recipe" : "New recipe"}</h1>
      ${!editing && store.mode === "supabase" && !signedIn() ? `<div class="signnote"><span>Sign in to publish. Your draft is kept while you do.</span><button class="btn sbtn" data-signin-top>Sign in</button></div>` : ""}
      <label class="f" data-f="name"><span>name</span><input data-k="name" value="${esc(d.name)}" maxlength="80"></label>
      <label class="f" data-f="description"><span>description</span><textarea data-k="description" maxlength="600">${esc(d.description)}</textarea></label>
      <div class="f" data-f="tags"><span>tags</span><div class="tagin" data-tagin>${d.tags.map((t) => `<span class="tag">${esc(t)}<button data-rmtag="${esc(t)}" aria-label="remove">×</button></span>`).join("")}
        <input data-tagtext placeholder="${d.tags.length ? "" : "persona, style, …"}" autocomplete="off"><div class="suggest" data-tagsug hidden></div></div></div>
      <label class="f" data-f="model"><span>model</span><input data-k="model" value="${esc(d.model)}" list="models" spellcheck="false" class="mono">
        <datalist id="models">${models.map((m) => `<option value="${esc(m)}">`).join("")}</datalist></label>
      <div class="f" data-f="neurons"><span>neurons</span>
        <input data-paste placeholder="paste: L13N7956-1.0 L14N8949+1.0" class="mono" spellcheck="false" style="width:100%;margin-bottom:10px">
        <div class="nrows">${d.neurons.map((n, i) => `<div class="nr" data-i="${i}">
          <input data-n="layer" value="${esc(n.layer)}" placeholder="layer" inputmode="numeric">
          <input data-n="neuron" value="${esc(n.neuron)}" placeholder="neuron" inputmode="numeric">
          <input data-n="dose" value="${esc(n.dose)}" placeholder="dose" inputmode="decimal" class="${Number(n.dose) > 0 ? "up" : Number(n.dose) < 0 ? "down" : ""}">
          <button class="x" data-rmn="${i}" aria-label="remove">×</button></div>`).join("")}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><button class="addlink" data-addn>+ neuron</button>
        <span class="seg" data-op><button class="${d.op !== "mul" ? "on" : ""}" data-op-v="add">add</button><button class="${d.op === "mul" ? "on" : ""}" data-op-v="mul">multiply</button></span></div>
      </div>
      <div class="f" data-f="sampling"><span>recommended sampling <span class="faint">optional</span></span>
        <div style="display:flex;gap:8px">
          <input data-k="rep" value="${esc(d.rep)}" placeholder="rep pen, e.g. 1.1" inputmode="decimal" class="mono" style="flex:1">
          <input data-k="temp" value="${esc(d.temp)}" placeholder="temperature (0 = greedy)" inputmode="decimal" class="mono" style="flex:1">
        </div></div>
      <label class="f"><span>source link</span><input data-k="source" value="${esc(d.source)}" placeholder="https://x.com/…" spellcheck="false"></label>
      <label class="f"><span>notes</span><textarea data-k="notes" placeholder="how you found it, what breaks it, doses that also work">${esc(d.notes)}</textarea></label>
    </div>
    <div class="panel">
      <h2>Examples<span class="faint">at least one</span></h2>
      <div class="exs">${d.examples.map((e, i) => `<div class="exf" data-ei="${i}">
        <div class="h"><span>${i + 1}</span>${d.examples.length > 1 ? `<button class="dim" data-rmex="${i}">remove</button>` : ""}</div>
        <label class="f"><span>prompt</span><input data-e="prompt" value="${esc(e.prompt)}"></label>
        <label class="f"><span>steered output</span><textarea class="o" data-e="output">${esc(e.output)}</textarea></label>
        <label class="f"><span>base output <span class="faint">optional, the unsteered reply</span></span><textarea data-e="base_output">${esc(e.base_output || "")}</textarea></label>
      </div>`).join("")}</div>
      <button class="addlink" data-addex>+ example</button>
      <div class="preview"><div class="dim" style="font-size:12px;margin-bottom:6px">recipe</div><div class="rid" data-preview></div></div>
      <div data-errsum class="err"></div>
      <div class="pub" data-pub></div>
    </div>
  </div>`;

  const save = () => localStorage.setItem(draftKey(), JSON.stringify(d));
  const refreshPreview = () => {
    const ns = d.neurons.filter((n) => n.layer !== "" && n.neuron !== "" && n.dose !== "" && Number.isFinite(Number(n.dose)))
      .map((n) => ({ layer: +n.layer, neuron: +n.neuron, dose: +n.dose }));
    $("[data-preview]").innerHTML = ns.length ? recipeHtml(ns) + edgeMark(ns, d.model) : `<span class="faint">—</span>`;
  };
  const showErrs = (errs, all) => {
    $$(".f[data-f]").forEach((f) => {
      const k = f.dataset.f;
      f.classList.toggle("bad", !!(all && errs[k]));
      let e = $(":scope > .err", f);
      if (all && errs[k]) { if (!e) { e = document.createElement("div"); e.className = "err"; f.appendChild(e); } e.textContent = errs[k]; }
      else if (e) e.remove();
    });
    $("[data-errsum]").textContent = all && errs.examples ? errs.examples : "";
  };

  $$("[data-k]").forEach((el) => (el.oninput = () => { d[el.dataset.k] = el.value; save(); }));
  $$(".nr").forEach((row) => $$("[data-n]", row).forEach((el) => (el.oninput = () => {
    d.neurons[+row.dataset.i][el.dataset.n] = el.value.trim();
    if (el.dataset.n === "dose") el.className = Number(el.value) > 0 ? "up" : Number(el.value) < 0 ? "down" : "";
    save(); refreshPreview();
  })));
  $$("[data-rmn]").forEach((b) => (b.onclick = () => { d.neurons.splice(+b.dataset.rmn, 1); if (!d.neurons.length) d.neurons.push({ layer: "", neuron: "", dose: "" }); save(); renderSubmit(); }));
  $("[data-addn]").onclick = () => { d.neurons.push({ layer: "", neuron: "", dose: "" }); save(); renderSubmit(); $$(".nr input")[d.neurons.length * 3 - 3].focus(); };
  $$("[data-op-v]").forEach((b) => (b.onclick = () => { d.op = b.dataset.opV; save(); renderSubmit(); }));
  const pasteIn = $("[data-paste]");
  const takePaste = (text) => {
    if (!live()) return;
    const ns = parseRecipeStr(text).filter((n) => Number.isFinite(n.dose));
    if (!ns.length) return;
    d.neurons = ns.map((n) => ({ layer: String(n.layer), neuron: String(n.neuron), dose: String(n.dose), ...(n.expert != null ? { expert: String(n.expert) } : {}) }));
    save(); renderSubmit();
  };
  pasteIn.onpaste = (e) => { e.preventDefault(); takePaste(e.clipboardData.getData("text")); };
  pasteIn.onchange = () => takePaste(pasteIn.value);
  pasteIn.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); takePaste(pasteIn.value); } };
  $$(".exf").forEach((f) => $$("[data-e]", f).forEach((el) => (el.oninput = () => { d.examples[+f.dataset.ei][el.dataset.e] = el.value; save(); })));
  $$("[data-rmex]").forEach((b) => (b.onclick = () => { d.examples.splice(+b.dataset.rmex, 1); save(); renderSubmit(); }));
  $("[data-addex]").onclick = () => { d.examples.push({ prompt: "", output: "", base_output: "" }); save(); renderSubmit(); };

  // tags
  const tin = $("[data-tagtext]");
  const tsug = $("[data-tagsug]");
  const addTag = (t) => {
    if (!live()) return;
    t = slugify(t).slice(0, 32);
    if (t && !d.tags.includes(t) && d.tags.length < 12) d.tags.push(t);
    save(); renderSubmit(); $("[data-tagtext]").focus();
  };
  tin.oninput = () => {
    const s = slugify(tin.value);
    const opts = Object.keys(tc).filter((t) => t.includes(s) && !d.tags.includes(t)).sort((a, b) => tc[b] - tc[a]).slice(0, 6);
    tsug.hidden = !tin.value.trim() || !opts.length;
    tsug.innerHTML = opts.map((t) => `<div class="row" data-t="${esc(t)}"><span class="kind">tag</span><span>${esc(t)}</span><span class="n">${tc[t]}</span></div>`).join("");
  };
  tin.onkeydown = (e) => {
    if ((e.key === "Enter" || e.key === ",") && tin.value.trim()) { e.preventDefault(); addTag(tin.value); }
    if (e.key === "Backspace" && !tin.value && d.tags.length) { d.tags.pop(); save(); renderSubmit(); $("[data-tagtext]").focus(); }
  };
  tin.onblur = () => setTimeout(() => { tsug.hidden = true; if (tin.value.trim()) addTag(tin.value); }, 150);
  tsug.onmousedown = (e) => { const row = e.target.closest("[data-t]"); if (row) { e.preventDefault(); tin.value = ""; addTag(row.dataset.t); } };
  $$("[data-rmtag]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); d.tags = d.tags.filter((t) => t !== b.dataset.rmtag); save(); renderSubmit(); }));

  // import
  const drop = $("[data-drop]");
  const fileIn = drop && $("input[type=file]", drop);
  const importText = (text) => {
    let o;
    try { o = JSON.parse(text); } catch { return flashError(new Error("not JSON")); }
    const st = fromStudio(o);
    const src = st || (Array.isArray(o.neurons) ? o : null);
    if (!src) return flashError(new Error("not a Neuron Studio or recipe file"));
    d.neurons = src.neurons.map((n) => ({ layer: String(n.layer), neuron: String(n.neuron), dose: String(n.dose) }));
    if (src.model) d.model = src.model;
    d.op = src.method && src.method.op === "mul" ? "mul" : "add";
    if (!st) {
      for (const k of ["name", "description", "source", "notes"]) if (o[k]) d[k] = o[k];
      if (o.sampling) { d.rep = o.sampling.repetition_penalty ?? ""; d.temp = o.sampling.temperature ?? ""; }
      if (Array.isArray(o.tags)) d.tags = o.tags;
      if (Array.isArray(o.examples) && o.examples.length) d.examples = o.examples.map((e) => ({ prompt: e.prompt || "", output: e.output || "", base_output: e.base_output || "" }));
    }
    save(); renderSubmit();
  };
  if (drop) {
  fileIn.onchange = () => fileIn.files[0] && fileIn.files[0].text().then(importText);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) f.text().then(importText); };
  }

  // publish slot
  const pub = $("[data-pub]");
  const ghNew = (r) => `https://github.com/${CFG.repo}/new/${CFG.branch || "main"}?filename=${encodeURIComponent(`recipes/${r.id}.json`)}&value=${encodeURIComponent(recipeJson(r))}`;
  const ghIssue = (r) => `https://github.com/${CFG.repo}/issues/new?template=recipe.yml&title=${encodeURIComponent("recipe: " + r.name)}&recipe=${encodeURIComponent(recipeJson(r))}`;
  const draftId = () => "new"; // the store assigns the real id
  const ready = async () => {
    const errs = validate(d);
    showErrs(errs, true);
    if (Object.keys(errs).length) { const f = $(".f.bad input, .f.bad textarea"); if (f) f.focus(); return null; }
    if (editing) {
      const r = draftToRecipe(d, editing);
      const o = d._orig || {};
      // keep fields the form doesn't show (method details, conditional, aliases, per-example metadata)
      if (o.method && r.method === undefined && (!o.method.op || o.method.op === "add")) r.method = o.method;
      if (o.method && r.method) r.method = { ...o.method, op: r.method.op };
      if (o.conditional) r.conditional = o.conditional;
      if (o.aliases && o.aliases.length) r.aliases = o.aliases;
      if (o.sampling) r.sampling = { ...o.sampling, ...(r.sampling || {}) };
      if (o.sampling && !d.rep && o.sampling.repetition_penalty) delete r.sampling.repetition_penalty;
      if (o.sampling && d.temp === "" && o.sampling.temperature != null) delete r.sampling.temperature;
      if (r.sampling && !Object.keys(r.sampling).length) delete r.sampling;
      r.examples = r.examples.map((e) => ({ ...((o.examples || []).find((x) => x.prompt === e.prompt && x.output === e.output) || {}), ...e }));
      return r;
    }
    return draftToRecipe(d, draftId());
  };

  if (editing) {
    pub.innerHTML = `<button class="btn primary" data-save>Save changes</button><button class="btn" data-discard>Cancel</button>`;
  } else if (store.mode === "supabase") {
    pub.innerHTML = signedIn() ? `<button class="btn primary" data-publish>Publish</button><span class="dim">as @${esc(u.handle)}</span>`
      : `<button class="btn primary" data-signin>Sign in to publish</button>`;
  } else {
    pub.innerHTML = `${CFG.repo ? `<button class="btn primary" data-pr>Open pull request</button><button class="btn" data-issue>Open issue</button>` : ""}
      <button class="btn ${CFG.repo ? "" : "primary"}" data-publish>Publish in this browser</button><button class="btn" data-dl>Download JSON</button>`;
  }
  const bind = (sel, f) => { const b = $(sel, pub); if (b) b.onclick = f; };
  // errors stay next to the button until the next attempt
  const pubErr = (t) => {
    let el = $("[data-puberr]", pub.parentNode);
    if (!el) { el = document.createElement("p"); el.className = "err puberr"; el.dataset.puberr = ""; el.setAttribute("role", "alert"); pub.after(el); }
    el.textContent = t; el.hidden = !t;
  };
  bind("[data-signin]", () => signInPrompt("publish"));
  const st = $("[data-signin-top]");
  if (st) st.onclick = (e) => { e.stopPropagation(); signInPrompt("publish"); };
  bind("[data-publish]", async (e) => {
    const b = e.currentTarget;
    if (!signedIn()) return signInPrompt("publish");
    const r = await ready();
    if (!r) return;
    b.disabled = true; b.textContent = "Publishing…";
    pubErr("");
    try {
      const id = await store.submit(r);
      localStorage.removeItem(DRAFT_KEY);
      RECIPES = await store.list();
      editorOpen = false;
      location.hash = "#/r/" + id;
    } catch (err) {
      console.error(err);
      b.disabled = false; b.textContent = "Publish";
      pubErr(errText(err));
    }
  });
  bind("[data-save]", async (e) => {
    const b = e.currentTarget;
    const r = await ready();
    if (!r) return;
    b.disabled = true; b.textContent = "Saving…";
    pubErr("");
    try {
      await store.update(editing, r);
      localStorage.removeItem(draftKey());
      const id = editing;
      editing = null;
      editorOpen = false;
      RECIPES = await store.list();
      if (location.hash === "#/r/" + id) route(); else location.hash = "#/r/" + id;
    } catch (err) { console.error(err); b.disabled = false; b.textContent = "Save changes"; pubErr(errText(err)); }
  });
  bind("[data-discard]", () => { localStorage.removeItem(draftKey()); editing = null; closeEditor(); });
  bind("[data-pr]", async () => { const r = await ready(); if (r) window.open(ghNew(r), "_blank", "noopener"); });
  bind("[data-issue]", async () => { const r = await ready(); if (r) window.open(ghIssue(r), "_blank", "noopener"); });
  bind("[data-dl]", async () => { const r = await ready(); if (r) download(`${r.id}.json`, recipeJson(r)); });
  refreshPreview();
}

// ------------------------------------------------------------------ boot
async function boot() {
  try {
    store = await createStore(CFG);
    RECIPES = await store.list();
  } catch (e) {
    main.innerHTML = `<div class="empty err">Couldn't load recipes: ${esc(e.message)}</div>`;
    return;
  }
  renderMe();
  store.onAuth(async () => {
    renderMe();
    RECIPES = await store.list();
    if (editorOpen) renderSubmit(); else route(); // signing in mid-form keeps you in the form
  });
  window.addEventListener("hashchange", route);
  await route();
  // back from an X sign-in started in the submit form: reopen it (the draft is in localStorage)
  const reopen = sessionStorage.getItem("nr.reopenSubmit");
  sessionStorage.removeItem("nr.reopenSubmit");
  if (reopen && store.returnedFromOAuth && signedIn()) openEditor();
}
boot();
