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
// The fixture is committed so the contract is reproducible on any machine.
const FILE = new URL("./pos-css-check.fixture.html", import.meta.url).pathname;

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

  // TransactionEditor (U3 part 2)
  ["#editor", "borderTopWidth", "2px", "editor panel keeps its navy frame"],
  ["#editor", "borderTopColor", "rgb(30, 58, 138)", "editor frame uses --navy"],
  ["#editor", "borderRadius", "8px", "editor uses the card radius"],
  ["#editor", "backgroundColor", "rgb(248, 250, 252)", "editor ground is --gray-50"],
  ["#editor-title", "color", "rgb(30, 58, 138)", "editor title is navy"],
  ["#editor-title", "fontSize", "16px", "editor title uses the lg step"],
  ["#editor-meta", "fontSize", "12px", "meta line drops to the xs step"],
  ["#editor-error", "backgroundColor", "rgb(254, 242, 242)", "editor error is tinted red"],
  ["#editor-error", "color", "rgb(220, 38, 38)", "editor error text is --red"],
  ["#editor-notice", "color", "rgb(22, 101, 52)", "editor notice is green (not the v1 navy)"],
  ["#editor-table", "borderCollapse", "collapse", "editor line table collapses"],
  ["#editor-th-code", "fontSize", "12px", "editor header row is the xs step"],
  ["#editor-qty", "width", "72px", "editor qty matches the cart width"],
  ["#editor-qty", "textAlign", "right", "editor qty right-aligns"],
  ["#editor-price", "width", "96px", "editor price matches the cart width"],
  ["#editor-notes", "width", "200px", "editor notes keep their width"],
  ["#editor-remove", "color", "rgb(220, 38, 38)", "Remove is red, subordinate to Save"],
  ["#editor-remove", "minHeight", "32px", "Remove gets a real hit area"],
  ["#editor-dirty-cell", "backgroundColor", "rgb(255, 251, 235)", "a dirty row is tinted amber"],
  ["#editor-pending", "fontSize", "16px", "pending total uses the lg step"],
  ["#editor-field-label", "fontSize", "12px", "field labels are the xs step"],
  ["#editor-field-input", "minHeight", "44px", "editor fields hit the touch target"],
  ["#editor-history-empty", "fontStyle", "italic", "empty-history hint is italic"],
  ["#editor-history-detail", "color", "rgb(100, 116, 139)", "history detail is --gray-500"],

  // POSPage chrome (U3 part 2)
  ["#pos-page", "maxWidth", "900px", "POS page keeps its v1 width cap"],
  ["#pos-success", "backgroundColor", "rgb(240, 253, 244)", "success banner stays pale green"],
  ["#pos-success-title", "fontSize", "20px", "success title uses the xl step"],
  ["#pos-success-title", "color", "rgb(46, 125, 50)", "success title keeps the v1 green"],
  ["#pos-new-btn", "marginTop", "12px", "New Transaction keeps its offset"],
  ["#pos-error", "fontWeight", "600", "error banner stays semibold"],
  ["#pos-checkout", "flexWrap", "wrap", "checkout row wraps instead of overflowing"],
  ["#pos-sale-header", "cursor", "pointer", "sale header still reads as clickable"],
  ["#pos-sale-header", "minHeight", "44px", "sale header is a full-row target"],
  ["#pos-edit-hint", "fontSize", "12px", "edit hint is the xs step"],
  ["#pos-items", "borderCollapse", "collapse", "items table collapses"],
  ["#pos-item-note", "fontSize", "11px", "price-adj note keeps its tiny type"],

  // Intake seller-entry chrome (U4 part 1)
  ["#im-fieldset", "borderRadius", "8px", "intake fieldset takes the v2 radius"],
  ["#im-fieldset", "backgroundColor", "rgb(248, 250, 252)", "fieldset sits on the gray-50 ground"],
  ["#im-legend", "fontSize", "13px", "legend is the sm step"],
  ["#im-legend", "color", "rgb(71, 85, 105)", "legend is --gray-600"],
  ["#im-label", "fontSize", "13px", "field labels are the sm step"],
  ["#im-input", "minHeight", "44px", "field input hits the touch target"],
  ["#im-input", "fontSize", "16px", "field input is the lg step (no iOS zoom)"],
  ["#im-search", "minHeight", "44px", "seller search input hits the touch target"],
  ["#im-result", "minHeight", "44px", "each result row is a full touch target"],
  ["#im-result", "textAlign", "left", "result rows stay left-aligned"],
  ["#im-check", "minHeight", "44px", "checkbox row is a touch target"],
  ["#im-hint", "color", "rgb(100, 116, 139)", "inheritance hint is --gray-500"],
  ["#im-error", "color", "rgb(220, 38, 38)", "validation error is --red"],
  ["#im-error", "backgroundColor", "rgb(254, 242, 242)", "validation error sits on --red-light"],
  ["#im-tabbar", "borderBottomWidth", "1px", "tab bar uses a hairline, not a 2px rule"],
  ["#im-tab-active", "backgroundColor", "rgb(30, 58, 138)", "active tab is filled navy"],
  ["#im-tab-active", "minHeight", "44px", "tabs are touch targets"],
  ["#im-tab", "backgroundColor", "rgba(0, 0, 0, 0)", "inactive tab stays transparent"],
  ["#im-event", "color", "rgb(71, 85, 105)", "event name is --gray-600"],
  ["#im-ghost", "borderTopColor", "rgb(30, 58, 138)", "ghost action is navy-outlined"],
  ["#im-ghost", "borderRadius", "6px", "ghost action takes the sm radius"],
  ["#im-review", "backgroundColor", "rgb(255, 251, 235)", "duplicate review is amber-tinted"],
  ["#im-review-title", "color", "rgb(146, 64, 14)", "review title is the dark amber"],
  ["#im-candidate", "backgroundColor", "rgb(255, 255, 255)", "candidate rows sit on white"],
  ["#im-candidate-sub", "color", "rgb(100, 116, 139)", "candidate sub-line is --gray-500"],
  ["#im-primary", "backgroundColor", "rgb(30, 58, 138)", "primary action is navy"],
  ["#im-primary", "minHeight", "44px", "primary action meets the touch target"],
  ["#im-secondary", "backgroundColor", "rgb(255, 255, 255)", "secondary action stays white"],
  ["#im-new-btn", "marginTop", "8px", "Register New Seller keeps its offset"],

  // Intake items table + forms (U4 part 2)
  ["#ip-crumb-link", "minHeight", "32px", "breadcrumb link has a hit area"],
  ["#ip-crumb-text", "color", "rgb(15, 23, 42)", "current crumb text is --gray-900"],
  ["#it-title", "fontSize", "16px", "items heading is the lg step"],
  ["#it-printer", "fontSize", "14px", "printer select is the md step"],
  ["#it-code-toggle", "whiteSpace", "nowrap", "code-as-text label never wraps"],
  ["#it-table", "borderCollapse", "collapse", "items table stays collapsed"],
  ["#it-table", "fontSize", "14px", "items table body is the md step"],
  ["#it-cell-num", "textAlign", "right", "numeric cells right-align"],
  ["#it-cell-num", "fontVariantNumeric", "tabular-nums", "numeric cells use tabular figures"],
  ["#it-cell-nowrap", "whiteSpace", "nowrap", "action column never wraps"],
  ["#it-cell-nowrap", "display", "flex", "action cell is the button cluster container"],
  ["#it-row-open", "borderBottomStyle", "none", "open row drops its rule"],
  ["#it-panel-cell", "backgroundColor", "rgb(248, 250, 252)", "edit panel sits on gray-50"],
  ["#it-panel-cell", "borderBottomWidth", "1px", "edit panel closes with a hairline"],
  ["#it-edit-grid", "display", "grid", "edit fields lay out as a grid"],
  ["#it-edit-grid", "marginBottom", "12px", "edit grid keeps its spacing"],
  ["#it-edit-label", "color", "rgb(100, 116, 139)", "edit label is --gray-500"],
  ["#it-edit-input", "minHeight", "44px", "edit input hits the touch target"],
  ["#it-qty-input", "width", "130px", "quantity box widens past v1's 120px for the touch target"],
  ["#it-qty-error", "color", "rgb(220, 38, 38)", "quantity complaint is --red"],
  ["#it-save-error", "fontSize", "13px", "save error is the sm step"],
  ["#it-panel-actions", "gap", "8px", "panel actions are 8px apart"],
  ["#it-save", "backgroundColor", "rgb(30, 58, 138)", "Save is the primary action"],
  ["#it-panel-delete", "backgroundColor", "rgb(220, 38, 38)", "panel Delete is the danger action"],
  ["#if-grid", "display", "grid", "item form lays out as a grid"],
  ["#if-label", "fontSize", "13px", "item form label is the sm step"],
  ["#if-input", "minHeight", "44px", "item input hits the touch target"],
  ["#if-input", "fontSize", "16px", "item input avoids iOS zoom"],
  ["#if-counter", "color", "rgb(148, 163, 184)", "counter idles at --gray-400"],
  ["#if-counter-over", "color", "rgb(220, 38, 38)", "counter turns --red past 90 chars"],
  ["#if-price-note", "color", "rgb(180, 83, 9)", "price note keeps its amber"],
  ["#if-inherit", "fontSize", "12px", "inheritance note uses the xs step"],
  ["#if-error", "backgroundColor", "rgb(254, 242, 242)", "form error sits on --red-light"],
  ["#sp-query", "width", "320px", "search box keeps its 320px width"],
  ["#sp-label", "marginBottom", "3px", "search label keeps its 3px offset"],
  ["#sp-filter", "fontSize", "13px", "filter input is the sm step"],
  ["#sp-table", "borderCollapse", "collapse", "search results table stays collapsed"],
  ["#sp-empty", "color", "rgb(100, 116, 139)", "empty-state line uses --gray-500"],
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
    const inject = await cdp.send("Runtime.evaluate", {
      expression: `
        document.body.innerHTML = ${JSON.stringify(inner)};
        document.documentElement.classList.add('ui-v2');
        document.querySelectorAll('.ground').length;
      `,
      returnByValue: true,
    });
    if (inject.exceptionDetails) {
      throw new Error(`fixture injection failed: ${JSON.stringify(inject.exceptionDetails)}`);
    }
    console.log(`# fixture injected (${inject.result.value} root(s) found)`);
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
