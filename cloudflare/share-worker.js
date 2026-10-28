// Cloudflare Worker on neuronary.org/r/* : real share links with their own preview card.
// GitHub Pages serves one static index.html, so every #/r/... link looked identical on X and Discord. This Worker
// answers /r/<id> with that same page plus recipe-specific title/description/og:image (rendered by the Supabase `og`
// function). In a browser, the app then moves to its usual #/r/<id> route.
// Deploy: scripts/deploy_worker.py (route neuronary.org/r/*).
const API = "https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1";
const SITE = "https://neuronary.org";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clip = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/r\/([a-z0-9-]{1,64})\/?$/);
    if (!m) return fetch(req);
    const id = m[1];
    // this route only covers /r/*, so "/" comes from GitHub Pages
    const [page, rec] = await Promise.all([
      fetch(SITE + "/", { cf: { cacheTtl: 60 } }),
      fetch(`${API}/api/recipes/${id}`, { cf: { cacheTtl: 60 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    let html = await page.text();
    if (rec && rec.name) {
      const title = `${rec.name} · neuronary`;
      const desc = clip(`${rec.recipe} on ${String(rec.model).split("/").pop()}. ${rec.description}`, 280);
      const img = `${API}/og?id=${encodeURIComponent(id)}`;
      const link = `${SITE}/r/${id}`;
      const set = (re, tag) => { html = re.test(html) ? html.replace(re, tag) : html.replace("</head>", tag + "\n</head>"); };
      set(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
      set(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}">`);
      set(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(link)}">`);
      set(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}">`);
      set(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(desc)}">`);
      set(/<meta property="og:image" [^>]*>/, `<meta property="og:image" content="${esc(img)}">`);
      set(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(img)}">`);
      html = html.replace("</head>", `<link rel="canonical" href="${esc(link)}">\n</head>`);
    }
    // assets in index.html are relative: resolve them from the site root, not /r/
    html = html.replace("<head>", '<head>\n<base href="/">');
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
  },
};
