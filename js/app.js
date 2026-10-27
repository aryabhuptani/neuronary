import { createStore } from "./store.js";
import {
  esc, doseStr, neuronKey, neuronStr, sortNeurons, recipeStr, recipeHtml, neuronHtml, setKey, parseRecipeStr, parseNeuronQuery,
  methodOf, DEFAULT_METHOD, samplingText, recipeFile, recipeJson, pythonSnippet, studioFile, fromStudio, slugify, ago, avatarHtml, copyText, download,
} from "./format.js";

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
  bubble: '<svg width="15" height="14" viewBox="0 0 15 14" aria-hidden="true"><path d="M2.5 1.5h10a1.5 1.5 0 0 1 1.5 1.5v5.5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V10H2.5A1.5 1.5 0 0 1 1 8.5V3a1.5 1.5 0 0 1 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  chev: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  grid: '<svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><rect x="0" y="0" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="7.5" y="0" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="0" y="7.5" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1" fill="currentColor"/></svg>',
  rows: '<svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><rect y="0" width="14" height="2" rx="1" fill="currentColor"/><rect y="5" width="14" height="2" rx="1" fill="currentColor"/><rect y="10" width="14" height="2" rx="1" fill="currentColor"/></svg>',
  theme: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>',
};

// ------------------------------------------------------------------ routing
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const p = new URLSearchParams(qs || "");
  if (!parts.length) return { view: "home", p };
  if (parts[0] === "browse") return { view: "browse", p };
  if (parts[0] === "c" && parts[1]) {
    p.set("tags", parts[1]);
    return { view: "browse", p };
  }
  if (parts[0] === "r" && parts[1]) return { view: "recipe", id: parts[1], p };
  if (parts[0] === "submit") return { view: "submit", p };
  return { view: "notfound", p };
}

const browseHref = (p) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) s.set(k, Array.isArray(v) ? v.join(",") : v);
  const q = s.toString();
  return "#/browse" + (q ? "?" + q : "");
};

let listShown = false; // the main area holds home/browse, so a recipe can open as a modal over it
let modalPushed = false;
let lastListHash = "#/";

async function route() {
  const r = parseRoute();
  syncSearchBox(r);
  if (r.view === "recipe") {
    if (listShown && modalPushed) return openModal(r.id);
    closeModal(true);
    listShown = false;
    document.body.className = "page";
    return renderRecipePage(r.id);
  }
  const wasModal = !!overlay.innerHTML;
  closeModal(true);
  modalPushed = false;
  if (wasModal && listShown && location.hash === lastListHash) return; // back to the list underneath, untouched
  if (r.view === "home") { listShown = true; lastListHash = location.hash || "#/"; document.body.className = "page"; return renderHome(); }
  if (r.view === "browse") { listShown = true; lastListHash = location.hash; return renderBrowse(r.p); }
  listShown = false;
  if (r.view === "submit") { document.body.className = ""; return renderSubmit(); }
  document.body.className = "page";
  main.innerHTML = `<div class="empty">Nothing here. <a href="#/">neuronary</a></div>`;
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

// ------------------------------------------------------------------ common bits
function votesHtml(r, cls = "") {
  return `<span class="votes v${r.myVote} ${cls}" data-vote="${esc(r.id)}">
    <button class="upv" data-v="1" aria-label="upvote">${I.up}</button><span class="n">${r.score}</span><button class="downv" data-v="-1" aria-label="downvote">${I.down}</button></span>`;
}

const tagHref = (t) => browseHref({ tags: [t] });
const tagsHtml = (tags, on = []) => tags.map((t) => `<a class="tag ${on.includes(t) ? "on" : ""}" href="${tagHref(t)}">${esc(t)}</a>`).join("");
const shortModel = (m) => m.split("/").pop();

function cardHtml(r, on) {
  return `<a class="card" href="#/r/${esc(r.id)}" data-open="${esc(r.id)}">
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
  if (store.mode === "supabase" && !store.user()) return signInPrompt("vote");
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
  const cp = e.target.closest("[data-copy]");
  if (cp) {
    e.preventDefault();
    copyText(cp.dataset.copy).then((ok) => ok && flashCopied(cp));
  }
});

function flashCopied(el) {
  let f = el.querySelector(".copied-flash");
  if (!f) {
    f = document.createElement("span");
    f.className = "copied-flash";
    f.textContent = "copied";
    el.appendChild(f);
  }
  clearTimeout(f._t);
  f.hidden = false;
  f._t = setTimeout(() => (f.hidden = true), 1100);
}

function flashError(e) {
  console.error(e);
  const m = document.createElement("div");
  m.className = "err";
  m.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--bg);padding:8px 14px;border-radius:4px;box-shadow:var(--shadow);z-index:60";
  m.textContent = String(e.message || e);
  document.body.appendChild(m);
  setTimeout(() => m.remove(), 3500);
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
  else if (sort === "new") a.sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : y.score - x.score));
  else a.sort((x, y) => (y.score + 1) / Math.pow(ageH(y) + 2, 1.5) - (x.score + 1) / Math.pow(ageH(x) + 2, 1.5));
  return a;
}

// ------------------------------------------------------------------ home
function renderHome() {
  const tc = tagCounts();
  const cats = (CFG.categories || []).map((c) => {
    const rs = sortRecipes(RECIPES.filter((r) => r.tags.includes(c.tag)), "top");
    return `<a class="cat" href="#/c/${esc(c.tag)}"><div class="t">${esc(c.name)}<span class="n">${tc[c.tag] || 0}</span></div>
      <div class="sub">${rs.slice(0, 3).map((r) => esc(r.name)).join(", ") || "&nbsp;"}</div></a>`;
  }).join("");
  const rank = (rs) => `<ol class="rank">${rs.map((r, i) => `<li><a href="#/r/${esc(r.id)}" data-open="${esc(r.id)}">
      <span class="i">${i + 1}</span><span class="t">${esc(r.name)}</span><span class="rid">${recipeHtml(r.neurons)}</span><span class="s">${r.score}</span></a></li>`).join("")}</ol>`;
  const trending = sortRecipes(RECIPES, "hot").slice(0, 10);
  const fresh = sortRecipes(RECIPES, "new").slice(0, 10);
  main.innerHTML = `<div class="home">
    <h2>Categories</h2><div class="cats">${cats}</div>
    <div class="cols">
      <div><h2>Trending</h2>${rank(trending)}<a class="more" href="${browseHref({ sort: "hot" })}">all recipes</a></div>
      <div><h2>New</h2>${rank(fresh)}<a class="more" href="${browseHref({ sort: "new" })}">all new</a></div>
    </div></div>`;
}

// ------------------------------------------------------------------ browse
let openDd = null;

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
  const sort = ["hot", "top", "new"].includes(p.sort) ? p.sort : "hot";
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

  const bar = `<div class="toolbar">
    <span class="seg" id="sort">${["hot", "top", "new"].map((s) => `<button data-sort="${s}" class="${s === sort ? "on" : ""}">${s}</button>`).join("")}</span>
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
      <td><span class="rid">${recipeHtml(r.neurons)}</span></td>
      <td class="hide-s"><div class="tags">${r.tags.slice(0, 4).map((t) => `<span class="tag ${tags.includes(t) ? "on" : ""}">${esc(t)}</span>`).join("")}</div></td>
      <td class="hide-s model">${esc(shortModel(r.model))}</td>
      <td><span class="cmt">${I.bubble}${r.comments}</span></td></tr>`).join("")}</tbody></table></div>`;

  main.innerHTML = bar + body;
  wireBrowse(p);
}

function wireBrowse(p) {
  const set = (k, v) => { const q = { ...p, [k]: v }; go(browseHref(q)); };
  $$("[data-sort]").forEach((b) => (b.onclick = () => set("sort", b.dataset.sort)));
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
      <div class="single"><div class="o">${esc(e.output)}</div></div>
      ${e.base_output ? `<div class="pair" hidden><div><div class="lab s">steered${e.scale && e.scale !== 1 ? " ×" + e.scale : ""}</div><div class="o">${esc(e.output)}</div></div>
        <div><div class="lab b">base</div><div class="o b-o">${esc(e.base_output)}</div></div></div>` : ""}
      ${e.scale && e.scale !== 1 ? `<div class="gen">doses ×${e.scale}</div>` : ""}
    </div>`).join("");

  return `<div class="rec">
    <div class="rhead">
      ${cat ? `<div class="crumb"><a href="#/c/${esc(cat.tag)}">${esc(cat.name)}</a> &nbsp;›&nbsp; ${esc(r.name)}</div>` : ""}
      <h1>${esc(r.name)}</h1>
      <div class="rid idline copyable" data-copy="${esc(recipeStr(r.neurons))}" title="click to copy">${recipeHtml(r.neurons)}</div>
      <div class="meta">${r.author.url ? `<a href="${esc(r.author.url)}" target="_blank" rel="noopener">@${esc(r.author.handle)}</a>` : `<a href="${browseHref({ author: r.author.handle })}">@${esc(r.author.handle)}</a>`}
        &nbsp;·&nbsp; <a href="${browseHref({ model: r.model })}" class="mono">${esc(r.model)}</a>${r.date ? ` &nbsp;·&nbsp; ${esc(r.date.slice(0, 10))}` : ""}
        ${r.source ? ` &nbsp;·&nbsp; <a href="${esc(r.source)}" target="_blank" rel="noopener">source</a>` : ""}${r.origin === "local" ? ` &nbsp;·&nbsp; <span class="faint">only in this browser</span>` : ""}${r.origin === "demo" ? ` &nbsp;·&nbsp; <span class="faint">demo fixture</span>` : ""}</div>
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
        <button class="btn primary" data-act="json">Copy JSON</button>
        <button class="btn" data-act="py">Python</button>
        ${studio ? `<button class="btn" data-act="studio" title="download a file Neuron Studio can import">Studio</button>` : ""}
      </div>
      <div class="blk"><div class="lab">neurons</div>
        ${sortNeurons(r.neurons).map((n) => { const u = neuronUses(n) - 1; return `<div class="nrow copyable" data-copy="${esc(neuronStr(n))}" title="click to copy">
          <span class="rid">${neuronHtml(n)}</span>${u > 0 ? `<a class="in" href="${browseHref({ q: neuronKey(n) })}">in ${u} other${u === 1 ? "" : "s"}</a>` : ""}</div>`; }).join("")}
      </div>
      <div class="blk"><div class="lab">method</div><div class="mono">${esc(methodTxt)}</div></div>
      ${samplingText(r) ? `<div class="blk"><div class="lab">recommended sampling</div><div class="mono">${esc(samplingText(r))}</div></div>` : ""}
      ${aka.length || (r.aliases || []).length ? `<div class="blk"><div class="lab">also known as</div>
        ${(r.aliases || []).map((a) => `<div class="alias"><span>${esc(a)}</span></div>`).join("")}
        ${aka.map((x) => `<div class="alias"><a href="#/r/${esc(x.id)}">${esc(x.name)}</a><span class="s">${x.score}</span></div>`).join("")}</div>` : ""}
      ${related.length ? `<div class="blk"><div class="lab">shares neurons with</div>
        ${related.map((x) => `<a class="rel" href="#/r/${esc(x.id)}"><span class="t">${esc(x.name)}</span><span class="rid">${recipeHtml(x.neurons)}</span></a>`).join("")}</div>` : ""}
      ${r.notes ? `<div class="blk"><div class="lab">notes</div><div class="notes">${esc(r.notes)}</div></div>` : ""}
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

function wireRecipe(root, r) {
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
  b.classList.add("flash-ok");
  const t = b.textContent;
  if (!b.dataset.t) b.dataset.t = t;
  b.textContent = b.dataset.act === "studio" ? "Saved" : "Copied";
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.classList.remove("flash-ok"); b.textContent = b.dataset.t; }, 1100);
}

async function renderRecipePage(id) {
  main.innerHTML = `<div class="pagewrap"><div class="dim">…</div></div>`;
  let r;
  try { r = await loadRecipe(id); } catch (e) { flashError(e); }
  if (!r) { main.innerHTML = `<div class="pagewrap"><div class="empty">No recipe called “${esc(id)}”.</div></div>`; return; }
  document.title = `${r.name} · neuronary`;
  main.innerHTML = `<div class="pagewrap">${recipeHtmlBlock(r, { modal: false })}</div>`;
  wireRecipe(main, r);
}

async function openModal(id) {
  document.body.classList.add("modal-open");
  overlay.innerHTML = `<div class="modal"><div class="sheet"><button class="x" aria-label="close">×</button><div class="dim">…</div></div></div>`;
  const modal = $(".modal", overlay);
  modal.onclick = (e) => { if (e.target === modal) closeModalNav(); };
  $(".x", overlay).onclick = closeModalNav;
  let r;
  try { r = await loadRecipe(id); } catch (e) { flashError(e); }
  if (parseRoute().id !== id) return;
  const sheet = $(".sheet", overlay);
  if (!r) { sheet.innerHTML = `<button class="x" aria-label="close">×</button><div class="empty">No recipe called “${esc(id)}”.</div>`; $(".x", sheet).onclick = closeModalNav; return; }
  document.title = `${r.name} · neuronary`;
  sheet.innerHTML = `<button class="x" aria-label="close">×</button>${recipeHtmlBlock(r, { modal: true })}`;
  $(".x", sheet).onclick = closeModalNav;
  wireRecipe(sheet, r);
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
  const one = (c) => `<li data-cid="${c.id}">${avatarHtml(c.handle)}<div>
      <div class="h"><b>${esc(c.handle)}</b><span>${esc(ago(c.created_at))}</span></div>
      <div class="b">${esc(c.body)}</div>
      <div class="act">${!c.parent_id ? `<button data-reply="${c.id}">reply</button>` : ""}${u && u.handle === c.handle ? `<button data-del="${c.id}">delete</button>` : ""}</div>
      ${!c.parent_id ? `<ul>${kids(c.id).map(one).join("")}</ul><div data-replybox="${c.id}"></div>` : ""}</div></li>`;
  box.innerHTML = `<div class="cbox"><textarea placeholder="${u ? "add a comment" : "sign in to comment"}" data-new></textarea>
      <button class="btn" data-post hidden>Post</button></div>
    <ul class="cmts">${top.map(one).join("")}</ul>`;
  const cc = $("[data-ccount]", root);
  if (cc) cc.textContent = list.length;
  const ta = $("[data-new]", box);
  const post = $("[data-post]", box);
  ta.onfocus = () => { if (!store.user()) { ta.blur(); signInPrompt("comment"); } };
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
    if (!store.user()) return signInPrompt("comment");
    const slot = $(`[data-replybox="${b.dataset.reply}"]`, box);
    slot.innerHTML = `<div class="cbox" style="margin:10px 0 0"><textarea placeholder="reply"></textarea><button class="btn">Reply</button></div>`;
    const t = $("textarea", slot);
    t.focus();
    $("button", slot).onclick = (e) => t.value.trim() && send(t.value.trim(), +b.dataset.reply, e.currentTarget);
  }));
  $$("[data-del]", box).forEach((b) => (b.onclick = async () => {
    try { await store.deleteComment(r.id, +b.dataset.del); renderComments(root, r); } catch (e) { flashError(e); }
  }));
}

// ------------------------------------------------------------------ auth
function renderMe() {
  const u = store.user();
  const me = $("#me");
  if (u) {
    me.innerHTML = `<button id="mebtn" title="@${esc(u.handle)}: sign out">${avatarHtml(u.handle)}</button>`;
    $("#mebtn").onclick = async () => { if (confirm(`Sign out @${u.handle}?`)) { await store.signOut(); } };
  } else {
    me.innerHTML = `<button id="signin">sign in</button>`;
    $("#signin").onclick = () => signInPrompt();
  }
}

function signInPrompt(why) {
  if (store.mode === "supabase") return store.signIn();
  // local mode: just a handle, kept in this browser
  const prev = $(".signin-pop");
  if (prev) prev.remove();
  const pop = document.createElement("div");
  pop.className = "pop signin-pop";
  pop.style.cssText = "position:fixed;top:60px;right:20px;left:auto;width:260px;z-index:70";
  pop.innerHTML = `<div class="lab">${why ? `to ${esc(why)}, ` : ""}pick a handle (kept in this browser)</div>
    <input type="text" placeholder="@handle" autocomplete="off"><div class="foot"><a href="#" data-cancel>cancel</a><a href="#" data-ok>sign in</a></div>`;
  document.body.appendChild(pop);
  const inp = $("input", pop);
  inp.focus();
  const ok = async () => { const h = inp.value.trim().replace(/^@/, ""); if (!h) return; await store.signIn(h); pop.remove(); };
  $("[data-ok]", pop).onclick = (e) => { e.preventDefault(); ok(); };
  $("[data-cancel]", pop).onclick = (e) => { e.preventDefault(); pop.remove(); };
  inp.onkeydown = (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") pop.remove(); };
  pop.addEventListener("click", (e) => e.stopPropagation());
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

function loadDraft() {
  try { return { ...emptyDraft(), ...JSON.parse(localStorage.getItem(DRAFT_KEY)) }; } catch { return emptyDraft(); }
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
      <h1>New recipe</h1>
      <label class="drop" data-drop>import a Neuron Studio or recipe .json<input type="file" accept=".json,application/json" hidden></label>
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
        <button class="addlink" data-addn>+ neuron</button>
        <span class="seg" style="margin-left:14px" data-op><button class="${d.op !== "mul" ? "on" : ""}" data-op-v="add">add</button><button class="${d.op === "mul" ? "on" : ""}" data-op-v="mul">multiply</button></span>
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
      <div class="preview"><div class="dim" style="font-size:12px;margin-bottom:6px">id</div><div class="rid" data-preview></div></div>
      <div data-errsum class="err"></div>
      <div class="pub" data-pub></div>
    </div>
  </div>`;

  const save = () => localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  const refreshPreview = () => {
    const ns = d.neurons.filter((n) => n.layer !== "" && n.neuron !== "" && n.dose !== "" && Number.isFinite(Number(n.dose)))
      .map((n) => ({ layer: +n.layer, neuron: +n.neuron, dose: +n.dose }));
    $("[data-preview]").innerHTML = ns.length ? recipeHtml(ns) : `<span class="faint">—</span>`;
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
  const fileIn = $("input[type=file]", drop);
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
  fileIn.onchange = () => fileIn.files[0] && fileIn.files[0].text().then(importText);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) f.text().then(importText); };

  // publish slot
  const pub = $("[data-pub]");
  const ghNew = (r) => `https://github.com/${CFG.repo}/new/${CFG.branch || "main"}?filename=${encodeURIComponent(`recipes/${r.id}.json`)}&value=${encodeURIComponent(recipeJson(r))}`;
  const ghIssue = (r) => `https://github.com/${CFG.repo}/issues/new?template=recipe.yml&title=${encodeURIComponent("recipe: " + r.name)}&recipe=${encodeURIComponent(recipeJson(r))}`;
  const freeId = async (name) => {
    const base = slugify(name);
    let id = base;
    for (let k = 2; await store.idTaken(id); k++) id = `${base}-${k}`;
    return id;
  };
  const ready = async () => {
    const errs = validate(d);
    showErrs(errs, true);
    if (Object.keys(errs).length) { const f = $(".f.bad input, .f.bad textarea"); if (f) f.focus(); return null; }
    return draftToRecipe(d, await freeId(d.name));
  };

  if (store.mode === "supabase") {
    pub.innerHTML = u ? `<button class="btn primary" data-publish>Publish</button><span class="dim">as @${esc(u.handle)}</span>`
      : `<button class="btn primary" data-signin>Sign in to publish</button>`;
  } else {
    pub.innerHTML = `${CFG.repo ? `<button class="btn primary" data-pr>Open pull request</button><button class="btn" data-issue>Open issue</button>` : ""}
      <button class="btn ${CFG.repo ? "" : "primary"}" data-publish>Publish in this browser</button><button class="btn" data-dl>Download JSON</button>`;
  }
  const bind = (sel, f) => { const b = $(sel, pub); if (b) b.onclick = f; };
  bind("[data-signin]", () => signInPrompt("publish"));
  bind("[data-publish]", async (e) => {
    const b = e.currentTarget;
    if (store.mode === "local" && !store.user()) return signInPrompt("publish");
    const r = await ready();
    if (!r) return;
    b.disabled = true; b.textContent = "Publishing…";
    try {
      await store.submit(r);
      localStorage.removeItem(DRAFT_KEY);
      RECIPES = await store.list();
      location.hash = "#/r/" + r.id;
    } catch (err) {
      b.disabled = false; b.textContent = "Publish failed: retry";
      flashError(err);
    }
  });
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
  store.onAuth(async () => { renderMe(); RECIPES = await store.list(); route(); });
  window.addEventListener("hashchange", route);
  route();
}
boot();
