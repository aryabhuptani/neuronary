// node dev/one_shot.mjs <url> <out.png> [width] [height]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lyra/Documents/claude/scratch/ClaudeAnimationBase/package.json");
const puppeteer = require("puppeteer-core");
const [url, out, w = 1200, h = 700] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h });
await p.goto(url, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 800));
await p.screenshot({ path: out });
await b.close();
