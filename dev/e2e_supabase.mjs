// End-to-end in Supabase mode, through the real UI: pick a name (anonymous session), vote, comment, reply, publish,
// edit, delete. Fails on console errors. Cleans up the test user with the service role key.
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node dev/e2e_supabase.mjs [base-url]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lyra/Documents/claude/scratch/ClaudeAnimationBase/package.json");
const puppeteer = require("puppeteer-core");

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const OUT = "C:/Users/Lyra/Documents/neuron-recipes/work/e2e";
const SB = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
(await import("fs")).mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Math.random().toString(16).slice(2, 7);
const handle = `e2e_${tag}`;
let rid = null; // assigned by the database on publish
let batchIds = []; // from the batch-import step
const fails = [];
const check = (name, ok, detail = "") => { console.log((ok ? "ok   " : "FAIL ") + name + (!ok && detail ? `  [${detail}]` : "")); if (!ok) fails.push(name); };

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "e2e report" : undefined));
const clear = (sel) => page.$eval(sel, (el) => { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const waitFor = async (fn, ms = 8000, ...args) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, ...args)) return true; await sleep(150); } return false; };

let userId = null;
// a repo-origin fixture recipe (no owner) to vote and comment on; deleted at the end
const FIX = "fix" + Math.random().toString(16).slice(2, 7);
await fetch(`${SB}/rest/v1/recipes`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ id: FIX, name: "Test fixture", description: "temporary test fixture", model: "Qwen/Qwen3.5-4B",
    neurons: [{ layer: 13, neuron: 7956, dose: -1 }, { layer: 14, neuron: 8949, dose: 1 }], tags: ["test"],
    examples: [{ prompt: "hi", output: "yo" }], author_handle: "fixture", origin: "repo" }) });
try {
  await page.goto(BASE + "#/browse", { waitUntil: "networkidle0" });
  check("loads recipes from the database", await waitFor(() => document.querySelectorAll(".card").length > 0));
  check("fixture is there", !!(await page.$(`.card[data-open="${FIX}"]`)));

  // vote while signed out -> sign-in prompt -> pick a name
  await page.click(`.card[data-open="${FIX}"] .votes button[data-v="1"]`);
  check("signed-out vote asks to sign in", await waitFor(() => !!document.querySelector(".signin-pop")));
  await page.type(".signin-pop input", "x");
  await page.click(".signin-pop [data-ok]");
  check("short name rejected inline", await waitFor(() => /2–24/.test(document.querySelector(".signin-pop [data-err]").textContent)));
  await clear(".signin-pop input");
  await page.type(".signin-pop input", handle);
  await page.click(".signin-pop [data-ok]");
  check("signed in with a name", await waitFor(() => !!document.querySelector("#mebtn")));
  userId = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.includes("auth-token")); return k && JSON.parse(localStorage[k]).user.id; });
  await shot("signed_in");
  await page.waitForNetworkIdle({ idleTime: 500 }); // signing in reloads the list to show your votes

  await page.click(`.card[data-open="${FIX}"] .votes button[data-v="1"]`);
  check("vote counts", await waitFor((f) => document.querySelector(`.card[data-open="${f}"] .votes`).classList.contains("v1"), 8000, FIX));
  await page.waitForNetworkIdle({ idleTime: 500 });
  await page.reload({ waitUntil: "networkidle0" });
  check("vote persists after reload", await waitFor((f) => document.querySelector(`.card[data-open="${f}"] .votes`)?.classList.contains("v1"), 8000, FIX));

  // comment + reply in the popup
  await page.click(`.card[data-open="${FIX}"]`);
  await waitFor(() => !!document.querySelector(".modal [data-new]"));
  await page.click(".modal [data-new]");
  await page.type(".modal [data-new]", "e2e comment");
  await page.click(".modal [data-post]");
  check("comment posts", await waitFor(() => [...document.querySelectorAll(".modal .cmts .b")].some((b) => b.textContent === "e2e comment")));
  await page.click(".modal [data-reply]");
  await page.type(".modal [data-replybox] textarea", "e2e reply");
  await page.click(".modal [data-replybox] button");
  check("reply posts", await waitFor(() => [...document.querySelectorAll(".modal .cmts ul .b")].some((b) => b.textContent === "e2e reply")));
  await shot("popup_comments");
  check("fixture isn't editable by a normal user", !(await page.$('.modal .ractions [data-ract="edit"]')));
  await page.keyboard.press("Escape");

  // publish
  await page.evaluate(() => localStorage.removeItem("nr.draft"));
  await page.goto(BASE + "#/", { waitUntil: "networkidle0" });
  await page.reload({ waitUntil: "networkidle0" });
  await page.click("[data-submit]");
  check("submit opens without changing the url", await waitFor(() => !!document.querySelector('[data-k="name"]')) && (await page.evaluate(() => location.hash)) === "#/");
  await page.type('[data-k="name"]', `E2E recipe ${tag}`);
  await page.type('[data-k="description"]', "made by the end-to-end test");
  await page.type("[data-tagtext]", "test,");
  await page.type("[data-paste]", "L09N1123+0.6 L18N0302-0.5");
  await page.keyboard.press("Enter");
  await sleep(200);
  await page.type('[data-k="rep"]', "1.1");
  await page.type('[data-e="prompt"]', "Hello?");
  await page.type('[data-e="output"]', "Arr.");
  await shot("submit");
  await page.click("[data-publish]");
  check("publish lands on the recipe", await waitFor(() => /^#\/r\/[a-z0-9]{8}$/.test(location.hash), 10000), await page.evaluate(() => location.hash));
  rid = (await page.evaluate(() => location.hash)).slice(4);
  check("recipe page shows sampling", await waitFor(() => /rep pen 1\.1/.test(document.body.textContent)));
  check("publish says so", await waitFor(() => /Published/.test(document.querySelector(".okflash")?.textContent || ""), 5000));
  check("author is the picked name", await waitFor((h) => document.querySelector(".meta")?.textContent.includes("@" + h), 8000, handle));
  await shot("published");

  // edit
  await page.click('.ractions [data-ract="edit"]');
  await waitFor(() => !!document.querySelector('[data-k="name"]'));
  await clear('[data-k="name"]');
  await page.type('[data-k="name"]', `E2E edited ${tag}`);
  await page.click("[data-save]");
  check("edit saves", await waitFor((t) => document.querySelector("h1")?.textContent === `E2E edited ${t}`, 10000, tag));
  check("edit kept the id", await page.evaluate(() => location.hash) === `#/r/${rid}`);

  // remix: pre-filled form, and the duplicate-neurons warning points at the original
  await page.click('.ractions [data-ract="remix"]');
  check("remix opens a pre-filled form", await waitFor(() => document.querySelector('[data-k="name"]')?.value === "" && document.querySelectorAll(".nr").length === 2, 5000));
  check("duplicate neurons warned", await waitFor((t) => (document.querySelector("[data-dupe]")?.textContent || "").includes(`E2E edited ${t}`), 5000, tag),
    await page.evaluate(() => document.querySelector("[data-dupe]")?.textContent));
  await page.click("[data-discard]").catch(() => {});
  await page.goto(BASE + "#/r/" + rid, { waitUntil: "networkidle0" });
  await waitFor(() => !!document.querySelector(".modal .rec"), 8000);

  // the form keeps its inputs (no full re-render on tag/neuron changes); comma tags; quota line; batch import
  await page.keyboard.press("Escape");
  await waitFor(() => !document.querySelector(".modal"), 5000);
  await page.click("[data-submit]");
  await waitFor(() => !!document.querySelector('[data-k="name"]'));
  await page.evaluate(() => { window.__nameEl = document.querySelector('[data-k="name"]'); });
  await page.type("[data-tagtext]", "alpha, beta, gamma");
  await page.click('[data-k="description"]');
  await page.type("[data-paste]", "L10N5+0.525");
  await page.keyboard.press("Enter");
  await sleep(200);
  check("comma-separated tags become chips", await waitFor(() => ["alpha", "beta", "gamma"].every((t) => [...document.querySelectorAll("[data-chips] .tag")].some((c) => c.firstChild.textContent === t)), 3000),
    await page.evaluate(() => document.querySelector("[data-chips]")?.textContent));
  check("inputs survive tag/neuron edits", await page.evaluate(() => window.__nameEl.isConnected));
  check("dose shows 3 decimals", await page.evaluate(() => /\+0\.525/.test(document.querySelector("[data-preview]").textContent)));
  check("quota line", await waitFor(() => /left today/.test(document.querySelector("[data-quota]")?.textContent || ""), 8000),
    await page.evaluate(() => document.querySelector("[data-quota]")?.textContent));
  check("fields have accessible names", await page.evaluate(() => [...document.querySelectorAll(".submit input:not([type=file]), .submit textarea")]
    .every((el) => el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"))));
  const batch = [1, 2].map((i) => ({ name: `E2E batch ${i} ${tag}`, description: "batch import test", model: "Qwen/Qwen3.5-4B", tags: ["test"],
    neurons: [{ layer: 9, neuron: 1000 + i, dose: 0.5 }], examples: [{ prompt: "Hi", output: "Hello." }] }));
  batch.push({ name: "broken", neurons: [] });
  const fs = await import("fs");
  const bf = "C:/Users/Lyra/AppData/Local/Temp/e2e_batch.json";
  fs.writeFileSync(bf, JSON.stringify(batch));
  const fin = await page.$("[data-importfile]");
  await fin.uploadFile(bf);
  check("batch import lists items", await waitFor(() => document.querySelectorAll(".blist li").length === 3, 3000));
  await page.click("[data-bgo]");
  check("batch publishes the valid ones", await waitFor(() => /Done: 2 published/.test(document.querySelector("[data-bsum]")?.textContent || ""), 20000),
    await page.evaluate(() => document.querySelector("[data-bsum]")?.textContent + " " + document.querySelector(".blist")?.textContent));
  batchIds = await page.evaluate(() => [...document.querySelectorAll(".blist a")].map((a) => a.getAttribute("href").slice(4)));
  await page.click("[data-bcancel]");
  await page.goto(BASE + "#/r/" + rid, { waitUntil: "networkidle0" });
  await waitFor(() => !!document.querySelector('.ractions [data-ract="delete"]'), 10000);
  await sleep(600); // let the sheet finish loading so the button isn't replaced under the click

  // delete
  await page.click('.ractions [data-ract="delete"]');
  check("delete goes back to browse", await waitFor(() => location.hash === "#/", 10000));
  check("deleted recipe is gone", await waitFor((rid) => !document.querySelector(`.card[data-open="${rid}"]`), 8000, rid));
  await shot("after_delete");
} finally {
  await browser.close();
  if (SB && SERVICE) {
    const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
    await fetch(`${SB}/rest/v1/recipes?id=eq.${FIX}`, { method: "DELETE", headers: h });
    if (rid) await fetch(`${SB}/rest/v1/recipes?id=eq.${rid}`, { method: "DELETE", headers: h });
    for (const b of batchIds) await fetch(`${SB}/rest/v1/recipes?id=eq.${b}`, { method: "DELETE", headers: h });
    if (userId) {
      await fetch(`${SB}/rest/v1/comments?user_id=eq.${userId}`, { method: "DELETE", headers: h });
      const r = await fetch(`${SB}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: h });
      console.log("deleted test user:", r.status);
    }
  }
}
check("no console errors", errors.length === 0, errors.join(" | "));
console.log(`\n${fails.length} failure(s)`);
process.exit(fails.length ? 1 : 0);
