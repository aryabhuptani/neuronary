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
    return h ? { handle: h, needsHandle: false, anonymous: false, admin: false } : null;
  }
  providers() { return []; }
  async claimHandle(h) { return this.signIn(h); }
  canEdit(r) { const u = this.user(); return !!u && r.origin === "local" && r.author.handle === u.handle; }
  async update(id, recipe) {
    const mine = LS.get("nr.local.recipes", []);
    const i = mine.findIndex((r) => r.id === id);
    if (i < 0) throw new Error("not allowed to edit this recipe");
    mine[i] = { ...mine[i], ...recipe, id, author: mine[i].author, created_at: mine[i].created_at };
    LS.set("nr.local.recipes", mine);
  }
  async remove(id) {
    LS.set("nr.local.recipes", LS.get("nr.local.recipes", []).filter((r) => r.id !== id));
  }
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
    const a = "abcdefghjkmnpqrstuvwxyz23456789";
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => a[x % a.length]).join("");
    mine.push({ ...recipe, id, created_at: new Date().toISOString() });
    LS.set("nr.local.recipes", mine);
    return id;
  }

  async idTaken(id) { return (await this.list()).some((r) => r.id === id); }
}

// ---------------------------------------------------------------- supabase
// ---------------------------------------------------------------- supabase
// The database holds every recipe (repo ones are synced in by scripts/sync_repo.py). Sign-in is X (OAuth) or an
// anonymous session plus a handle; anonymous users can link X later and keep everything.
const SUMMARY = "id,name,description,model,neurons,method,sampling,tags,aliases,author_handle,author_url,source,date,created_at,user_id,origin,hidden";

class SupabaseStore {
  mode = "supabase";
  constructor(cfg) { this.cfg = cfg; this.listeners = []; this.session = null; this.profile = null; }

  async init() {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
    // PKCE: OAuth comes back as ?code=... (not #access_token=..., which the hash router would read as a page)
    this.sb = createClient(this.cfg.supabaseUrl, this.cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } });
    const { data, error } = await this.sb.auth.getSession();
    if (error) throw error;
    // clean the OAuth leftovers out of the address bar and go back to the page sign-in started from
    const qs = new URLSearchParams(location.search);
    if (qs.has("code") || qs.has("error") || qs.has("error_description")) {
      if (qs.get("error_description")) console.error("sign-in failed:", qs.get("error_description"));
      const back = sessionStorage.getItem("nr.returnTo") || "#/";
      sessionStorage.removeItem("nr.returnTo");
      history.replaceState(null, "", location.pathname + back);
    }
    this.session = data.session;
    await this._loadProfile();
    // fail fast if the API is unreachable, so createStore can fall back
    const { error: e2 } = await this.sb.from("recipes").select("id").limit(1);
    if (e2) throw e2;
    this.sb.auth.onAuthStateChange(async (_e, s) => {
      const before = this.session && this.session.user && this.session.user.id;
      const after = s && s.user && s.user.id;
      this.session = s;
      if (before !== after) {
        await this._loadProfile();
        this.listeners.forEach((f) => f(this.user()));
      }
    });
  }

  async _loadProfile() {
    const u = this.session && this.session.user;
    this.profile = null;
    if (!u) return;
    const { data } = await this.sb.from("profiles").select("handle,x_handle,is_admin,avatar_url").eq("id", u.id).maybeSingle();
    this.profile = data || null;
  }

  // null when signed out. needsHandle: signed in but no handle picked yet.
  user() {
    const u = this.session && this.session.user;
    if (!u) return null;
    const p = this.profile;
    return {
      id: u.id, handle: p ? p.handle : null, needsHandle: !p, admin: !!(p && p.is_admin),
      anonymous: !!u.is_anonymous, url: p && p.x_handle ? `https://x.com/${p.x_handle}` : undefined,
      avatar: p ? p.avatar_url : null,
    };
  }
  providers() { return this.cfg.authProviders || []; }
  // return to the bare site URL (a #route there would collide with the OAuth response); remember the route ourselves
  _returnUrl() {
    sessionStorage.setItem("nr.returnTo", location.hash || "#/");
    return location.origin + location.pathname;
  }
  async signInWith(provider) {
    const { error } = await this.sb.auth.signInWithOAuth({ provider, options: { redirectTo: this._returnUrl() } });
    if (error) throw error;
  }
  async linkWith(provider) {
    const { error } = await this.sb.auth.linkIdentity({ provider, options: { redirectTo: this._returnUrl() } });
    if (error) throw error;
  }
  // anonymous session + handle
  async signIn(handle) {
    if (!this.session) {
      const { data, error } = await this.sb.auth.signInAnonymously();
      if (error) throw error;
      this.session = data.session;
    }
    await this.claimHandle(handle);
  }
  async claimHandle(handle) {
    const { error } = await this.sb.rpc("claim_handle", { h: String(handle).replace(/^@/, "").trim() });
    if (error) throw new Error(error.message);
    await this._loadProfile();
    this.listeners.forEach((f) => f(this.user()));
  }
  async signOut() {
    await this.sb.auth.signOut();
    this.session = null;
    this.profile = null;
    this.listeners.forEach((f) => f(null));
  }
  onAuth(f) { this.listeners.push(f); }

  _row(r) {
    return normalize({ ...r, author: { handle: r.author_handle, url: r.author_url || undefined }, date: r.date || r.created_at },
      r.origin === "repo" ? "repo" : "db");
  }

  async list() {
    const u = this.user();
    const [{ data: rows, error: e1 }, { data: stats, error: e2 }, mine] = await Promise.all([
      this.sb.from("recipes").select(SUMMARY).limit(5000),
      this.sb.from("recipe_stats").select("recipe_id,score,comments").limit(5000),
      u ? this.sb.from("votes").select("recipe_id,value").eq("user_id", u.id) : Promise.resolve({ data: [] }),
    ]);
    if (e1 || e2) throw e1 || e2;
    const st = Object.fromEntries((stats || []).map((s) => [s.recipe_id, s]));
    const mv = Object.fromEntries((mine.data || []).map((v) => [v.recipe_id, v.value]));
    return (rows || []).map((r) => ({ ...this._row(r), score: st[r.id]?.score ?? 0, comments: st[r.id]?.comments ?? 0, myVote: mv[r.id] || 0 }));
  }

  async get(id) {
    const { data, error } = await this.sb.from("recipes").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const u = this.user();
    const [{ data: st }, mine] = await Promise.all([
      this.sb.from("recipe_stats").select("score,comments").eq("recipe_id", id).maybeSingle(),
      u ? this.sb.from("votes").select("value").eq("recipe_id", id).eq("user_id", u.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { ...this._row(data), score: st?.score ?? 0, comments: st?.comments ?? 0, myVote: mine.data?.value || 0 };
  }

  _need() {
    const u = this.user();
    if (!u || u.needsHandle) throw Object.assign(new Error("sign in first"), { needSignIn: true });
    return u;
  }

  async vote(id, v) {
    const u = this._need();
    const q = v ? this.sb.from("votes").upsert({ recipe_id: id, user_id: u.id, value: v })
      : this.sb.from("votes").delete().eq("recipe_id", id).eq("user_id", u.id);
    const { error } = await q;
    if (error) throw error;
  }

  async comments(id) {
    const { data, error } = await this.sb.from("comments").select("id,parent_id,author_handle,body,created_at,user_id,hidden")
      .eq("recipe_id", id).order("created_at");
    if (error) throw error;
    const ids = [...new Set((data || []).map((c) => c.user_id).filter(Boolean))];
    let av = {};
    if (ids.length) {
      const { data: ps } = await this.sb.from("profiles").select("id,avatar_url").in("id", ids);
      av = Object.fromEntries((ps || []).map((p) => [p.id, p.avatar_url]));
    }
    return (data || []).map((c) => ({ ...c, handle: c.author_handle, avatar_url: av[c.user_id] || null }));
  }

  async comment(id, body, parentId = null) {
    this._need();
    const { data, error } = await this.sb.from("comments").insert({ recipe_id: id, body, parent_id: parentId }).select().single();
    if (error) throw new Error(error.message);
    return { ...data, handle: data.author_handle };
  }

  async deleteComment(_id, cid) {
    const { error } = await this.sb.from("comments").delete().eq("id", cid);
    if (error) throw error;
  }

  async hideComment(cid, hidden = true) {
    const { error } = await this.sb.from("comments").update({ hidden }).eq("id", cid);
    if (error) throw error;
  }

  async report({ recipeId = null, commentId = null, reason }) {
    this._need();
    const { error } = await this.sb.from("reports").insert({ recipe_id: recipeId, comment_id: commentId, reason });
    if (error) throw error;
  }

  _fields(recipe) {
    return {
      name: recipe.name, description: recipe.description, model: recipe.model, neurons: recipe.neurons,
      method: recipe.method || null, sampling: recipe.sampling || null, conditional: recipe.conditional || null,
      tags: recipe.tags, examples: recipe.examples, aliases: recipe.aliases || [], source: recipe.source || null,
      notes: recipe.notes || null,
    };
  }

  async submit(recipe) {
    this._need();
    // the database assigns the id
    const { data, error } = await this.sb.from("recipes").insert({ ...this._fields(recipe), author_handle: "" }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  async update(id, recipe) {
    const { data, error } = await this.sb.from("recipes").update(this._fields(recipe)).eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error("not allowed to edit this recipe");
  }

  async remove(id) {
    const { data, error } = await this.sb.from("recipes").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || !data.length) throw new Error("not allowed to delete this recipe");
  }

  async setHidden(id, hidden) {
    const { error } = await this.sb.from("recipes").update({ hidden }).eq("id", id);
    if (error) throw error;
  }

  canEdit(r) {
    const u = this.user();
    return !!u && !u.needsHandle && (u.admin || (!!r.user_id && r.user_id === u.id));
  }

  // admin: recent moderation decisions and user reports, with the posts they're about
  async modQueue() {
    const [{ data: log, error: e1 }, { data: reports, error: e2 }] = await Promise.all([
      this.sb.from("moderation_log").select("*").order("created_at", { ascending: false }).limit(100),
      this.sb.from("reports").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (e1 || e2) throw e1 || e2;
    const cids = [...new Set([...log.filter((l) => l.kind === "comment").map((l) => +l.target_id), ...reports.filter((r) => r.comment_id).map((r) => r.comment_id)])];
    const rids = [...new Set([...log.filter((l) => l.kind === "recipe").map((l) => l.target_id), ...reports.filter((r) => r.recipe_id).map((r) => r.recipe_id)])];
    const [{ data: cs }, { data: rs }] = await Promise.all([
      cids.length ? this.sb.from("comments").select("id,recipe_id,author_handle,body,hidden").in("id", cids) : Promise.resolve({ data: [] }),
      rids.length ? this.sb.from("recipes").select("id,name,author_handle,description,hidden").in("id", rids) : Promise.resolve({ data: [] }),
    ]);
    return { log, reports, comments: Object.fromEntries((cs || []).map((c) => [String(c.id), c])), recipes: Object.fromEntries((rs || []).map((r) => [r.id, r])) };
  }

  async clearReport(id) {
    const { error } = await this.sb.from("reports").delete().eq("id", id);
    if (error) throw error;
  }

  async resolveReview(logId) {
    const { error } = await this.sb.from("moderation_log").update({ resolved_at: new Date().toISOString() }).eq("id", logId);
    if (error) throw error;
  }

  // ---- API tokens (for agents)
  apiBase() { return `${this.cfg.supabaseUrl}/functions/v1/api`; }
  async listTokens() {
    const { data, error } = await this.sb.from("api_tokens").select("id,name,prefix,created_at,last_used_at,revoked_at")
      .is("revoked_at", null).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async createToken(name) {
    const { data, error } = await this.sb.rpc("create_api_token", { token_name: name });
    if (error) throw new Error(error.message);
    return data;
  }
  async revokeToken(id) {
    const { error } = await this.sb.rpc("revoke_api_token", { token_id: id });
    if (error) throw error;
  }

  async idTaken(id) {
    const { data } = await this.sb.from("recipes").select("id").eq("id", id).maybeSingle();
    return !!data;
  }
}

export async function createStore(cfg) {
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
    const s = new SupabaseStore(cfg);
    try {
      await s.init();
      return s;
    } catch (e) {
      console.error("supabase unavailable, falling back to local mode", e);
    }
  }
  const s = new LocalStore(cfg);
  await s.init();
  return s;
}
