// Walks the site in headless Chrome, screenshots each screen, and fails on console errors.
//   node dev/shots.mjs [base-url] [out-dir]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lyra/Documents/claude/scratch/ClaudeAnimationBase/package.json");
const puppeteer = require("puppeteer-core");

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const OUT = process.argv[3] || "C:/Users/Lyra/Documents/neuron-recipes/work/shots";
const fs = await import("fs");
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--hide-scrollbars"],
});
const errors = [];
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("requestfailed", (r) => { if (!r.url().includes("fonts.g")) errors.push("requestfailed: " + r.url()); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name, { w = 1440, h = 900, full = false } = {}) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await sleep(350);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("shot", name);
}
async function goto(hash, { demo = true, theme = "light" } = {}) {
  const url = BASE + (demo ? "?demo" : "") + hash;
  await page.evaluateOnNewDocument((t) => localStorage.setItem("nr.theme", t), theme);
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(300);
}

for (const theme of ["light", "dark"]) {
  const t = theme === "dark" ? "_dark" : "";
  await page.setViewport({ width: 1440, height: 900 });
  await goto("#/", { theme });
  await shot("home" + t);
  await goto("#/browse", { theme });
  await shot("cards" + t);
  await goto("#/browse?view=list&tags=persona", { theme });
  await shot("list" + t);
  await goto("#/browse", { theme });
  await page.click('[data-dd="model"] > button');
  await shot("filter_model" + t);
  await page.click("body");
  await goto("#/browse", { theme });
  await page.click('.card[data-open="evil"]');
  await sleep(500);
  await shot("popup" + t);
  // copy the id line, vote
  await page.click(".modal .idline");
  await page.click('.modal .vote button[data-v="1"]');
  await shot("popup_voted" + t);
  await page.keyboard.press("Escape");
  await sleep(300);
  await goto("#/r/evil", { theme });
  await shot("page" + t, { full: true });
  await goto("#/submit", { theme });
  await shot("submit" + t);
}

// search + suggestions
await goto("#/browse");
await page.click("#q");
await page.type("#q", "emo");
await sleep(200);
await shot("search_suggest");
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
await sleep(400);
await shot("search_tag");
await goto("#/browse?q=L14N8949");
await shot("search_neuron");

// submit flow: paste an id, fill, publish locally
await page.evaluateOnNewDocument(() => { localStorage.setItem("nr.handle", JSON.stringify("tester")); localStorage.removeItem("nr.draft"); });
await goto("#/submit");
await page.type('[data-k="name"]', "Test recipe");
await page.type('[data-k="description"]', "A recipe made by the screenshot script.");
await page.type("[data-tagtext]", "persona,");
await page.type("[data-paste]", "L09N1123+0.6 L18N0302-0.5");
await page.keyboard.press("Enter");
await sleep(200);
await page.type('[data-e="prompt"]', "Hello?");
await page.type('[data-e="output"]', "Arr.");
await shot("submit_filled");
await page.click("[data-publish]");
await sleep(800);
await shot("after_publish");
console.log("hash after publish:", await page.evaluate(() => location.hash));

// mobile
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await goto("#/browse");
await shot("m_cards", { w: 390, h: 844 });
await page.click('.card[data-open="evil"]');
await sleep(500);
await shot("m_popup", { w: 390, h: 844 });
await goto("#/submit");
await shot("m_submit", { w: 390, h: 844 });

await browser.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
