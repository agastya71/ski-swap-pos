#!/usr/bin/env node
/**
 * Verifies the U3 POS v2 stylesheet actually applies, by rendering the built
 * /next stylesheet against markup that mirrors what the components emit in v2
 * (class names only, no inline styles).
 *
 * Why this exists: `frontend/src/index.css` silently dropped every v2 @import
 * once already (PostCSS: "@import must precede all other statements"), and
 * nothing in the test suite could see it — vitest has no CSS cascade. This
 * checks the built artifact instead: if a rule is missing, the computed value
 * falls back to the class-less default and the assertion fails.
 *
 * Usage: node scripts/pos-css-check.mjs [--base URL]
 */
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : "http://127.0.0.1:8001";
const PORT = 9336;
const PROFILE = "/tmp/pos-css-check-profile";
const FILE = "/tmp/pos-css-check.html";

/**
 * Asserts one computed value. `expect` is a plain object of CSS property ->
 * expected string, so a failure prints exactly which rule went missing.
 */
const CHECKS = [
  // LookupField
  ["#lk-input", "minHeight", "44px", "scan field grows to the 44px touch target"],
  ["#lk-input", "fontSize", "18px", "scan field keeps its large type"],
  ["#lk-input", "borderTopWidth", "2px", "scan field keeps the 2px primary border"],
  ["#lk-input", "borderRadius", "6px", "scan field uses the v2 small radius"],
  ["#lk-results", "position", "static", "results stay in document flow (#3)"],
  ["#lk-results", "maxHeight", "320px", "results list is capped"],
  ["#lk-row-hot", "backgroundColor", "rgb(219, 234, 254)", "highlighted row paints --blue-light"],
  ["#lk-row-hot", "minHeight", "44px", "result rows are tappable"],
  ["#lk-row-sold", "opacity", "0.45", "sold-out row dims"],
  ["#lk-row-sold", "pointerEvents", "none", "sold-out row is not clickable"],
  ["#lk-status", "textTransform", "uppercase", "sold badge is uppercase"],
  ["#lk-code", "fontWeight", "700", "item code is bold"],

  // Cart
  ["#cart", "borderCollapse", "collapse", "cart stays a collapsed table"],
  ["#th-qty", "textAlign", "right", "numeric header right-aligns"],
  ["#td-meta", "fontSize", "12px", "category sub-line uses the xs token"],
  ["#cart-qty", "width", "72px", "qty input widened from v1's 56px"],
  ["#cart-price", "width", "96px", "price input widened from v1's 80px"],
  ["#cart-qty", "textAlign", "right", "qty digits right-align"],
  ["#cart-price", "textAlign", "right", "price digits right-align"],
  ["#cart-remove", "minHeight", "32px", "remove button gets a real hit area"],
  ["#cart-total", "textAlign", "right", "total right-aligns"],
  ["#cart-total", "fontWeight", "700", "total is bold"],
  ["#cart-total", "fontSize", "20px", "total uses the xl token"],
  ["#cart-note", "maxWidth", "320px", "adjustment note is width-capped"],

  // PaymentForm
  ["#pay-cash", "minHeight", "44px", "tender input hits the 44px touch target"],
  ["#pay-cash", "width", "160px", "tender inputs share one normalised width"],
  ["#pay-cash", "textAlign", "right", "money right-aligns"],
  ["#pay-checknum", "width", "200px", "check number keeps its wider field"],
  ["#pay-notes", "boxSizing", "border-box", "notes keep their border-box width model"],
  ["#pay-ok", "backgroundColor", "rgb(240, 253, 244)", "covering tender is green"],
  ["#pay-ok", "color", "rgb(22, 101, 52)", "covering tender text is green"],
  ["#pay-short", "backgroundColor", "rgb(254, 242, 242)", "short tender is red"],
  ["#pay-short", "color", "rgb(185, 28, 28)", "short tender text is red"],
  ["#pay-change", "fontSize", "16px", "change due is larger than body text"],
  ["#pay-change", "fontWeight", "700", "change due is bold"],
  ["#pay-actions", "flexWrap", "wrap", "actions wrap instead of overflowing"],

  // ConfirmationScreen
  ["#confirm", "textAlign", "center", "receipt stays centred"],
  ["#confirm-mark", "fontSize", "48px", "tick keeps its size"],
  ["#confirm-total", "fontSize", "28px", "grand total stays dominant"],
  ["#confirm-new", "minHeight", "44px", "New Transaction hits the touch target"],
  ["#confirm-new", "backgroundColor", "rgb(30, 58, 138)", "New Transaction stays navy"],
  ["#confirm-new", "color", "rgb(255, 255, 255)", "New Transaction text stays white"],
];

class Cdp {
  #ws;
  #id = 0;
  #p = new Map();
  static async connect(u) {
    const c = new Cdp();
    c.#ws = new WebSocket(u);
    await new Promise((res, rej) => {
      c.#ws.onopen = res;
      c.#ws.onerror = rej;
    });
    c.#ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const p = c.#p.get(msg.id);
      if (!p) return;
      c.#p.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.#p.set(id, { res, rej }));
  }
  close() {
    this.#ws.close();
  }
}

async function main() {
  // The built /next stylesheet filename is hashed; read it from the served HTML.
  const nextHtml = await (await fetch(`${BASE}/next/`)).text();
  const cssMatch = nextHtml.match(/assets\/(index-[^"]+\.css)/);
  if (!cssMatch) throw new Error(`no stylesheet referenced by ${BASE}/next/ — build it first`);
  const cssFile = cssMatch[1];
  const cssBody = await (await fetch(`${BASE}/next/assets/${cssFile}`)).text();
  console.log(`# built stylesheet: ${cssFile} (${(cssBody.length / 1024).toFixed(2)} kB)`);

  const { readFileSync } = await import("node:fs");
  const template = readFileSync(FILE, "utf8");

  await rm(PROFILE, { recursive: true, force: true });
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
      } catch {
        /* not up yet */
      }
      await sleep(250);
    }
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === "page");
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    // file:// cannot load a cross-origin stylesheet from the dev server, so
    // serve the fixture over the app origin instead: the /next/ bundle is what
    // we are testing, and this page lives beside it.
    await cdp.send("Page.navigate", { url: `${BASE}/next/?pos-css-check=1` });
    await sleep(400);

    // Inject the fixture into the real page so it inherits .ui-v2 and the built
    // stylesheet already loaded by the app bundle.
    const body = template.replace("BUILT_CSS", cssFile);
    const inner = body.match(/<body>([\s\S]*)<\/body>/)[1];
    await cdp.send("Runtime.evaluate", {
      expression: `
        document.body.innerHTML = ${JSON.stringify(inner)};
        document.documentElement.classList.add('ui-v2');
        true;
      `,
    });
    await sleep(300);

    const expr = `
      (() => {
        const out = [];
        for (const [sel, prop, want, label] of ${JSON.stringify(CHECKS)}) {
          const el = document.querySelector(sel);
          if (!el) { out.push([sel, prop, 'MISSING ELEMENT', want, label]); continue; }
          const got = getComputedStyle(el)[prop];
          out.push([sel, prop, got, want, label]);
        }
        return out;
      })()
    `;
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
    });

    let fails = 0;
    for (const [sel, prop, got, want, label] of result.value) {
      const ok = got === want;
      if (!ok) fails++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${sel} ${prop}=${got}${ok ? "" : ` (want ${want})`} — ${label}`);
    }
    cdp.close();
    console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : `${fails} CHECK(S) FAILED`} (${CHECKS.length} assertions)`);
    if (fails) process.exitCode = 1;
  } finally {
    chrome.kill("SIGKILL");
  }
}

main();
