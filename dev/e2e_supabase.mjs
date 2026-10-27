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
const rid = `e2e-recipe-${tag}`;
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
try {
  await page.goto(BASE + "#/browse", { waitUntil: "networkidle0" });
  check("loads recipes from the database", await waitFor(() => document.querySelectorAll(".card").length > 0));
  check("evil is there", !!(await page.$('.card[data-open="evil"]')));

  // vote while signed out -> sign-in prompt -> pick a name
  await page.click('.card[data-open="evil"] .votes button[data-v="1"]');
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

  await page.click('.card[data-open="evil"] .votes button[data-v="1"]');
  check("vote counts", await waitFor(() => document.querySelector('.card[data-open="evil"] .votes').classList.contains("v1")));
  await page.waitForNetworkIdle({ idleTime: 500 });
  await page.reload({ waitUntil: "networkidle0" });
  check("vote persists after reload", await waitFor(() => document.querySelector('.card[data-open="evil"] .votes')?.classList.contains("v1")));

  // comment + reply in the popup
  await page.click('.card[data-open="evil"]');
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
  check("evil isn't editable by a normal user", !(await page.$('.modal .ractions a[href^="#/edit/"]')));
  await page.keyboard.press("Escape");

  // publish
  await page.evaluate(() => localStorage.removeItem("nr.draft"));
  await page.goto(BASE + "#/submit", { waitUntil: "networkidle0" });
  await page.reload({ waitUntil: "networkidle0" });
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
  check("publish lands on the recipe", await waitFor((rid) => location.hash === `#/r/${rid}`, 10000, rid), await page.evaluate(() => location.hash));
  check("recipe page shows sampling", await waitFor(() => /rep pen 1\.1/.test(document.body.textContent)));
  check("author is the picked name", await waitFor((h) => document.querySelector(".meta")?.textContent.includes("@" + h), 8000, handle));
  await shot("published");

  // edit
  await page.click('.ractions a[href^="#/edit/"]');
  await waitFor(() => !!document.querySelector('[data-k="name"]'));
  await clear('[data-k="name"]');
  await page.type('[data-k="name"]', `E2E edited ${tag}`);
  await page.click("[data-save]");
  check("edit saves", await waitFor((t) => document.querySelector("h1")?.textContent === `E2E edited ${t}`, 10000, tag));
  check("edit kept the id", await page.evaluate(() => location.hash) === `#/r/${rid}`);

  // delete
  await page.click('.ractions [data-ract="delete"]');
  check("delete goes back to browse", await waitFor(() => location.hash === "#/browse", 10000));
  check("deleted recipe is gone", await waitFor((rid) => !document.querySelector(`.card[data-open="${rid}"]`), 8000, rid));
  await shot("after_delete");
} finally {
  await browser.close();
  if (SB && SERVICE) {
    const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
    await fetch(`${SB}/rest/v1/recipes?id=eq.${rid}`, { method: "DELETE", headers: h });
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
