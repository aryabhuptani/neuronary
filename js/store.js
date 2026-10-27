// Data layer. Two backends behind one interface:
//   LocalStore    - recipes from recipes/*.json, votes/comments/submissions in this browser's localStorage. Zero setup.
//   SupabaseStore - same repo recipes, plus submissions, votes, comments and sign-in in Supabase (see supabase/schema.sql).
// Both merge the repo's recipes (added by pull request) with user submissions, keyed by recipe id.

const LS = {
  get(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function normalize(r, origin) {
  return {
    ...r,
    author: typeof r.author === "string" ? { handle: r.author } : r.author || { handle: "anonymous" },
    date: r.date || r.created_at || "",
    tags: r.tags || [],
    origin,
    score: r.score ?? 0,
    comments: r.comments ?? r.comment_count ?? 0,
    myVote: 0,
  };
}

async function loadRepo(demo) {
  const idx = await fetchJson("recipes/index.json");
  const out = idx.recipes.map((r) => normalize(r, "repo"));
  if (demo) {
    try {
      const fx = await fetchJson("dev/fixtures.json");
      for (const r of fx.recipes) out.push(normalize(r, "demo"));
    } catch { /* no fixtures */ }
  }
  return out;
}

async function loadFull(r) {
  if (r.examples) return r;
  const full = await fetchJson(`recipes/${r.id}.json`);
  return { ...r, ...full, author: r.author, origin: r.origin, score: r.score, comments: r.comments, myVote: r.myVote };
}

// ---------------------------------------------------------------- local
class LocalStore {
  mode = "local";
  constructor(cfg) { this.cfg = cfg; this.listeners = []; }

  async init() {
    this.demo = new URLSearchParams(location.search).has("demo") || LS.get("nr.demo", false);
    this.repo = await loadRepo(this.demo);
  }

  user() {
    const h = LS.get("nr.handle", null);
    return h ? { handle: h } : null;
  }
  canSignIn() { return true; }
  async signIn(handle) {
    LS.set("nr.handle", String(handle).replace(/^@/, "").trim());
    this.listeners.forEach((f) => f(this.user()));
  }
  async signOut() {
    localStorage.removeItem("nr.handle");
    this.listeners.forEach((f) => f(null));
  }
  onAuth(f) { this.listeners.push(f); }

  _decorate(r) {
    const votes = LS.get("nr.votes", {});
    const cm = LS.get("nr.comments", {});
    const v = votes[r.id] || 0;
    return { ...r, score: (r.score || 0) + v, myVote: v, comments: (r.comments || 0) + (cm[r.id] || []).length };
  }

  async list() {
    const mine = LS.get("nr.local.recipes", []).map((r) => normalize(r, "local"));
    return [...this.repo, ...mine].map((r) => this._decorate(r));
  }

  async get(id) {
    const all = await this.list();
    const r = all.find((x) => x.id === id);
    if (!r) return null;
    return r.origin === "repo" ? loadFull(r) : r;
  }

  async vote(id, v) {
    const votes = LS.get("nr.votes", {});
    if (v) votes[id] = v; else delete votes[id];
    LS.set("nr.votes", votes);
  }

  async comments(id) { return LS.get("nr.comments", {})[id] || []; }

  async comment(id, body, parentId = null) {
    const u = this.user();
    if (!u) throw new Error("sign in to comment");
    const cm = LS.get("nr.comments", {});
    const c = { id: Date.now(), parent_id: parentId, handle: u.handle, body, created_at: new Date().toISOString() };
    (cm[id] = cm[id] || []).push(c);
    LS.set("nr.comments", cm);
    return c;
  }

  async deleteComment(id, cid) {
    const cm = LS.get("nr.comments", {});
    cm[id] = (cm[id] || []).filter((c) => c.id !== cid && c.parent_id !== cid);
    LS.set("nr.comments", cm);
  }

  async submit(recipe) {
    const mine = LS.get("nr.local.recipes", []);
    mine.push({ ...recipe, created_at: new Date().toISOString() });
    LS.set("nr.local.recipes", mine);
    return recipe.id;
  }

  async idTaken(id) { return (await this.list()).some((r) => r.id === id); }
}

// ---------------------------------------------------------------- supabase
class SupabaseStore {
  mode = "supabase";
  constructor(cfg) { this.cfg = cfg; this.listeners = []; this.session = null; }

  async init() {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    this.sb = createClient(this.cfg.supabaseUrl, this.cfg.supabaseAnonKey);
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    this.sb.auth.onAuthStateChange((_e, s) => {
      this.session = s;
      this.listeners.forEach((f) => f(this.user()));
    });
    this.repo = await loadRepo(false);
  }

  user() {
    const u = this.session && this.session.user;
    if (!u) return null;
    const m = u.user_metadata || {};
    return { id: u.id, handle: m.user_name || m.preferred_username || m.name || (u.email || "user").split("@")[0], url: m.user_name ? `https://x.com/${m.user_name}` : undefined };
  }
  canSignIn() { return true; }
  async signIn(provider) {
    await this.sb.auth.signInWithOAuth({ provider: provider || this.cfg.authProviders?.[0] || "twitter", options: { redirectTo: location.href } });
  }
  async signOut() { await this.sb.auth.signOut(); }
  onAuth(f) { this.listeners.push(f); }

  async list() {
    const [{ data: subs, error: e1 }, { data: stats, error: e2 }] = await Promise.all([
      this.sb.from("recipes").select("id,name,description,model,neurons,method,sampling,tags,author_handle,author_url,source,created_at,aliases"),
      this.sb.from("recipe_stats").select("recipe_id,score,comments"),
    ]);
    if (e1 || e2) throw e1 || e2;
    let mine = {};
    const u = this.user();
    if (u) {
      const { data } = await this.sb.from("votes").select("recipe_id,value").eq("user_id", u.id);
      mine = Object.fromEntries((data || []).map((v) => [v.recipe_id, v.value]));
    }
    const st = Object.fromEntries((stats || []).map((s) => [s.recipe_id, s]));
    const repoIds = new Set(this.repo.map((r) => r.id));
    const dbRecipes = (subs || []).filter((r) => !repoIds.has(r.id)).map((r) =>
      normalize({ ...r, author: { handle: r.author_handle, url: r.author_url || undefined }, date: r.created_at }, "db"));
    return [...this.repo, ...dbRecipes].map((r) => ({
      ...r, score: st[r.id]?.score ?? 0, comments: st[r.id]?.comments ?? 0, myVote: mine[r.id] || 0,
    }));
  }

  async get(id) {
    const all = await this.list();
    const r = all.find((x) => x.id === id);
    if (!r) return null;
    if (r.origin === "repo") return loadFull(r);
    const { data, error } = await this.sb.from("recipes").select("*").eq("id", id).single();
    if (error) throw error;
    return { ...r, examples: data.examples, notes: data.notes, conditional: data.conditional };
  }

  async vote(id, v) {
    const u = this.user();
    if (!u) throw new Error("sign in to vote");
    if (!v) {
      const { error } = await this.sb.from("votes").delete().eq("recipe_id", id).eq("user_id", u.id);
      if (error) throw error;
    } else {
      const { error } = await this.sb.from("votes").upsert({ recipe_id: id, user_id: u.id, value: v });
      if (error) throw error;
    }
  }

  async comments(id) {
    const { data, error } = await this.sb.from("comments").select("id,parent_id,author_handle,body,created_at,user_id")
      .eq("recipe_id", id).order("created_at");
    if (error) throw error;
    return (data || []).map((c) => ({ ...c, handle: c.author_handle }));
  }

  async comment(id, body, parentId = null) {
    const u = this.user();
    if (!u) throw new Error("sign in to comment");
    const { data, error } = await this.sb.from("comments")
      .insert({ recipe_id: id, user_id: u.id, author_handle: u.handle, body, parent_id: parentId }).select().single();
    if (error) throw error;
    return { ...data, handle: data.author_handle };
  }

  async deleteComment(_id, cid) {
    const { error } = await this.sb.from("comments").delete().eq("id", cid);
    if (error) throw error;
  }

  async submit(recipe) {
    const u = this.user();
    if (!u) throw new Error("sign in to publish");
    const row = {
      id: recipe.id, name: recipe.name, description: recipe.description, model: recipe.model, neurons: recipe.neurons,
      method: recipe.method || null, sampling: recipe.sampling || null, conditional: recipe.conditional || null, tags: recipe.tags, examples: recipe.examples,
      aliases: recipe.aliases || [], source: recipe.source || null, notes: recipe.notes || null,
      user_id: u.id, author_handle: u.handle, author_url: u.url || null,
    };
    const { error } = await this.sb.from("recipes").insert(row);
    if (error) throw error;
    return recipe.id;
  }

  async idTaken(id) {
    if (this.repo.some((r) => r.id === id)) return true;
    const { data } = await this.sb.from("recipes").select("id").eq("id", id).maybeSingle();
    return !!data;
  }
}

export async function createStore(cfg) {
  const s = cfg.supabaseUrl && cfg.supabaseAnonKey ? new SupabaseStore(cfg) : new LocalStore(cfg);
  await s.init();
  return s;
}
