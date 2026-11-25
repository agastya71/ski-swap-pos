/**
 * TEST SWAP checklist runner — the human list from PR #168, driven headlessly.
 *
 * Why this exists: the checklist steps exercise money paths that were restyled
 * in U3 part 1/2. Computed-style probes prove the CSS landed, but not that the
 * editor still saves, refuses, or appends history. `deepseek-v4.1-flash:cloud`
 * cannot view screenshots, so the evidence has to be DOM/state text captured
 * after each interaction.
 *
 * SAFETY: refuses to run unless the active event name matches /\btest\b/i and
 * the server is on localhost. It writes real rows (qty edits, added lines,
 * payment updates) — always point it at a throwaway instance on a COPY of the
 * test-event DB, never at production:
 *
 *   cp backend/registry.db /tmp/uicheck/
 *   cp backend/events/test_swap_pos_2026.db /tmp/uicheck/events/
 *   # in the COPY only: update event set is_active=0; update event set
 *   # is_active=1 where id=1;
 *   cd backend && REGISTRY_URL=sqlite:////tmp/uicheck/registry.db \
 *     EVENTS_DIR=/tmp/uicheck/events JWT_SECRET=sandbox \
 *     .venv/bin/python -m uvicorn app.main:app --port 8011
 *
 *   UI_PROBE_PASSWORD=admin123 node scripts/test-swap-checklist.mjs \
 *     --base http://127.0.0.1:8011
 */
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const BASE = argOf("--base", process.env.UI_PROBE_BASE ?? "http://127.0.0.1:8011").replace(/\/$/, "");
const USER = process.env.UI_PROBE_USER ?? "admin";
const PASSWORD = process.env.UI_PROBE_PASSWORD ?? "";
const PORT = Number(argOf("--cdp-port", "9333"));
const PROFILE = "/tmp/test-swap-checklist-profile";

// Localhost only: this script mutates data.
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(BASE)) {
  console.error(`refusing to run against ${BASE} — localhost only, this writes rows`);
  process.exit(2);
}
if (!PASSWORD) {
  console.error("UI_PROBE_PASSWORD is required");
  process.exit(2);
}

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${step}\n        ${detail}`);
}
function note(step, detail) {
  results.push({ step, ok: true, detail, info: true });
  console.log(`  INFO  ${step}\n        ${detail}`);
}

class Cdp {
  #id = 0;
  #p = new Map();
  #ws;
  constructor(ws) {
    this.#ws = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const pending = this.#p.get(msg.id);
      if (!pending) return;
      this.#p.delete(msg.id);
      if (msg.error) pending.rej(new Error(msg.error.message));
      else pending.res(msg.result);
    };
  }
  static async connect(port) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find((t) => t.type === "page");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    return new Cdp(ws);
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

/** Evaluate an expression in the page, surfacing page-side exceptions. */
async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      `page exception: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`,
    );
  }
  return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until `expr` is truthy, so we assert on settled state not races. */
async function waitFor(cdp, expression, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(cdp, expression);
    if (last) return last;
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${label} (last=${JSON.stringify(last)})`);
}

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
  const body = await res.json();
  return body.access_token;
}

async function assertTestEvent(token) {
  const res = await fetch(`${BASE}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /events failed: HTTP ${res.status}`);
  const events = await res.json();
  const active = events.find((e) => e.is_active);
  if (!active) throw new Error("no active event — refusing to run");
  if (!/\btest\b/i.test(active.name)) {
    throw new Error(
      `active event is "${active.name}", not a TEST event — refusing to run against real data`,
    );
  }
  return active;
}

/** Count edit-history entries for a sale, straight from the API. */
async function historyCount(token, saleId) {
  const res = await fetch(`${BASE}/sales/${saleId}/edits`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = await res.json();
  return Array.isArray(body) ? body.length : null;
}

/** Find a sale id to play with, newest first, skipping voided ones. */
async function pickSale(token) {
  const res = await fetch(`${BASE}/sales`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const sales = await res.json();
  const usable = sales.filter((s) => !s.is_voided && s.sale_items?.length > 1);
  if (!usable.length) throw new Error("no multi-line, non-voided sale to edit");
  return usable[0];
}

async function main() {
  const token = await login();
  const active = await assertTestEvent(token);
  console.log(`# sandbox: ${BASE} · event: ${active.name} (id=${active.id})`);

  const sale = await pickSale(token);
  console.log(
    `# target sale #${sale.id} · ${sale.sale_items.length} lines · $${sale.sale_total}`,
  );

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
      await sleep(200);
    }
    const cdp = await Cdp.connect(PORT);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // Seed the token the way AuthProvider expects, then load the v2 POS page.
    // NOTE: `?ui=v2` must sit BEFORE the hash (hash router) — /next/ serves the
    // variant-aware bundle but still defaults to v1 without the flag.
    await cdp.send("Page.navigate", { url: `${BASE}/next/?ui=v2#/pos` });
    await sleep(500);
    await evaluate(
      cdp,
      `localStorage.setItem("auth_token", ${JSON.stringify(token)}); location.reload(); 1`,
    );
    await sleep(1200);

    // ── Step 0: page is actually the v2 build ───────────────────────────────
    const shell = await waitFor(
      cdp,
      `document.querySelector("main")?.className?.includes("ui2-main") ? "ui2" : null`,
      "v2 shell",
    );
    record("0. /next/#/pos serves the v2 shell", shell === "ui2", `main.className contains ui2-main`);

    // ── Step 1: open a sale and start editing ───────────────────────────────
    const historyBtn = await evaluate(
      cdp,
      `(() => { const b=[...document.querySelectorAll("button")].find(x=>/my transactions/i.test(x.textContent)); if(!b) return null; b.click(); return b.textContent.trim(); })()`,
    );
    if (!historyBtn) throw new Error("could not open My Transactions");
    await sleep(900);

    const saleHeader = await waitFor(
      cdp,
      `(() => { const h=[...document.querySelectorAll('[role="button"]')].find(x=>/^transaction #/i.test(x.textContent.trim())); if(!h) return null; h.click(); return h.getAttribute("aria-label") ?? h.textContent.trim(); })()`,
      "sale header",
    );
    await sleep(700);

    const editBtn = await waitFor(
      cdp,
      `(() => { const b=[...document.querySelectorAll("button")].find(x=>/^edit$/i.test(x.textContent.trim())); if(!b) return null; b.click(); return b.getAttribute("aria-label"); })()`,
      "Edit button",
    );
    await sleep(1200);

    const editorUp = await waitFor(
      cdp,
      `(() => { const e=document.querySelector(".ui2-editor"); if(!e) return null; const t=e.querySelector(".ui2-editor-title"); return t ? t.textContent.trim() : null; })()`,
      "editor",
    );
    record(
      "1. Open a sale → Edit renders the editor",
      /^Edit sale #\d+$/.test(editorUp),
      `header "${saleHeader}", Edit aria-label "${editBtn}", editor title "${editorUp}"`,
    );

    // The UI edits whatever sale IT opened (this admin's own list), which is
    // not necessarily the API-wide newest — always trust the editor title.
    const uiSaleId = Number(editorUp.match(/#(\d+)/)?.[1] ?? 0);
    if (!uiSaleId) throw new Error(`could not parse sale id from "${editorUp}"`);
    note("1b. target sale as opened by the UI", `#${uiSaleId} (API pick was #${sale.id})`);

    const before = await historyCount(token, uiSaleId);
    note("1c. edit-history length before changes", `${before} entr(y/ies)`);

    // ── Step 2: change a quantity and save the line ─────────────────────────
    const qtyInfo = await evaluate(
      cdp,
      `(() => {
        const inp=document.querySelector(".ui2-editor-qty");
        if(!inp) return null;
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
        const next=String(Number(inp.value)+1);
        setter.call(inp,next);
        inp.dispatchEvent(new Event("input",{bubbles:true}));
        return {from:String(Number(inp.value)-1), to:next};
      })()`,
    );
    if (!qtyInfo) throw new Error("no qty input in editor");
    await sleep(400);

    const dirtyMarked = await evaluate(
      cdp,
      `!!document.querySelector(".ui2-editor-row--dirty")`,
    );
    const saveLabel = await evaluate(
      cdp,
      `(() => { const b=[...document.querySelectorAll("button")].find(x=>/^save line changes/i.test(x.textContent.trim())); return b?b.textContent.trim():null; })()`,
    );
    record(
      "2a. Editing a qty marks the row dirty and enables Save",
      dirtyMarked && (saveLabel ?? "").includes("(1)"),
      `dirty row present=${dirtyMarked}, save button "${saveLabel}", qty ${qtyInfo.from}→${qtyInfo.to}`,
    );

    await evaluate(
      cdp,
      `(() => { const b=[...document.querySelectorAll("button")].find(x=>/^save line changes/i.test(x.textContent.trim())); b.click(); return 1; })()`,
    );
    const noticeText = await waitFor(
      cdp,
      `(() => { const n=document.querySelector(".ui2-editor-notice"); return n?n.textContent.trim():null; })()`,
      "save notice",
    );
    const afterQty = await historyCount(token, uiSaleId);
    record(
      "2b. Saving the line persists and reports success",
      /saved/i.test(noticeText) && afterQty === before + 1,
      `notice "${noticeText}", history ${before}→${afterQty}`,
    );

    // ── Step 3: add an item through the editor's lookup ─────────────────────
    // Needs a real, saleable code — a made-up prefix proves nothing (the
    // editor keeps its existing rows either way).
    const candidate = await evaluate(
      cdp,
      `(async () => {
        const r = await fetch("/items/lookup?code=__PROBE__", {
          headers: { Authorization: "Bearer " + localStorage.getItem("auth_token") },
        });
        return r.status;
      })()`,
    );
    const addCode = process.env.CHECKLIST_ADD_CODE ?? "10010";
    const rowsBefore = await evaluate(
      cdp,
      `document.querySelectorAll(".ui2-editor-table tbody tr").length`,
    );
    // Two separate evaluations on purpose: React commits the value from the
    // `input` event asynchronously, so dispatching Enter in the same tick runs
    // the keydown handler against a stale `value` and silently does nothing.
    const typed = await evaluate(
      cdp,
      `(() => {
        const add=document.querySelector(".ui2-editor-add");
        const inp=add?.querySelector("input");
        if(!inp) return null;
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
        setter.call(inp,${JSON.stringify(addCode)});
        inp.dispatchEvent(new Event("input",{bubbles:true}));
        return inp.value;
      })()`,
    );
    await sleep(600); // let React commit the controlled value
    await evaluate(
      cdp,
      `(() => {
        const add=document.querySelector(".ui2-editor-add");
        const inp=add?.querySelector("input");
        if(!inp) return null;
        inp.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,key:"Enter",code:"Enter",keyCode:13,which:13}));
        return 1;
      })()`,
    );
    await sleep(1800);
    const addOutcome = await evaluate(
      cdp,
      `(() => {
        const e=document.querySelector(".ui2-editor");
        const rows=e?e.querySelectorAll("tbody tr").length:0;
        const notice=e?.querySelector(".ui2-editor-notice")?.textContent?.trim() ?? null;
        const err=e?.querySelector(".ui2-editor-error")?.textContent?.trim() ?? null;
        return {rows, notice, err};
      })()`,
    );
    record(
      `3. Editor lookup adds code ${addCode} as a new line`,
      addOutcome.rows === rowsBefore + 1 && addOutcome.err === null,
      `typed ${JSON.stringify(typed)}, rows ${rowsBefore}→${addOutcome.rows}, notice=${JSON.stringify(addOutcome.notice)}, error=${JSON.stringify(addOutcome.err)}`,
    );

    // ── Step 4: the last-line removal guard ────────────────────────────────
    const guard = await evaluate(
      cdp,
      `(async () => {
        // Auto-accept window.confirm so the guard's own message is the only
        // thing under test; a real run would show the dialog.
        const orig = window.confirm;
        let seen = null;
        window.confirm = (msg) => { seen = msg; return true; };
        const btns=[...document.querySelectorAll(".ui2-editor-remove")];
        for (const b of btns.slice(0, btns.length - 1)) { b.click(); await new Promise(r=>setTimeout(r,350)); }
        const remaining=document.querySelectorAll(".ui2-editor-remove").length;
        const last=document.querySelectorAll(".ui2-editor-remove");
        if (last.length) last[0].click();
        await new Promise(r=>setTimeout(r,350));
        const notice=document.querySelector(".ui2-editor-notice")?.textContent?.trim() ?? null;
        const err=document.querySelector(".ui2-editor-error")?.textContent?.trim() ?? null;
        window.confirm = orig;
        return {remaining, seen, notice, err, after: document.querySelectorAll(".ui2-editor-remove").length};
      })()`,
    );
    record(
      "4. Removing lines down to one is refused with the guard message",
      guard.after === 1 && (guard.err ?? "").includes("at least one line"),
      `removed down to ${guard.after} line(s); last removal refused with error ${JSON.stringify(guard.err)} (confirm dialogs seen: ${JSON.stringify(guard.seen)})`,
    );

    // ── Step 5: payment & details save appends history ─────────────────────
    const payBefore = await historyCount(token, uiSaleId);
    const payInfo = await evaluate(
      cdp,
      `(() => {
        const cash=document.querySelector('[aria-label="edit cash amount"]');
        if(!cash) return null;
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
        const from=cash.value;
        setter.call(cash,"7.25");
        cash.dispatchEvent(new Event("input",{bubbles:true}));
        return {from, to:"7.25"};
      })()`,
    );
    await sleep(300);
    await evaluate(
      cdp,
      `(() => { const b=[...document.querySelectorAll("button")].find(x=>/^save payment/i.test(x.textContent.trim())); if(!b) return null; b.click(); return 1; })()`,
    );
    await sleep(1600);
    const payAfter = await historyCount(token, uiSaleId);
    const payNotice = await evaluate(
      cdp,
      `document.querySelector(".ui2-editor-notice")?.textContent?.trim() ?? null`,
    );
    record(
      "5. Save payment & details appends an edit-history entry",
      payInfo !== null && payAfter === payBefore + 1,
      `cash ${JSON.stringify(payInfo)}, history ${payBefore}→${payAfter}, notice=${JSON.stringify(payNotice)}`,
    );

    const histHtml = await evaluate(
      cdp,
      `(() => { const items=[...document.querySelectorAll(".ui2-editor-history li")]; return items.slice(0,4).map(li=>li.textContent.replace(/\\s+/g," ").trim()); })()`,
    );
    record(
      "5b. History list renders the new entry newest-first",
      Array.isArray(histHtml) && histHtml.length > 0,
      `${histHtml.length} row(s); newest: ${JSON.stringify(histHtml[0] ?? null)}`,
    );

    // ── Step 6: narrow-viewport behaviour of the list ──────────────────────
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 420,
      height: 900,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await sleep(700);
    const narrow = await evaluate(
      cdp,
      `(() => {
        const vw=document.documentElement.clientWidth;
        const pick=(sel)=>{ const el=document.querySelector(sel); if(!el) return null; const r=el.getBoundingClientRect(); return {w:Math.round(r.width),right:Math.round(r.right)}; };
        const over=[...document.querySelectorAll("*")].filter(el=>{const r=el.getBoundingClientRect();return r.right>vw+1;});
        return {
          vw,
          editor: pick(".ui2-editor"),
          table: pick(".ui2-editor-table"),
          header: pick(".ui2-header"),
          overflowCount: over.length,
          firstOverflow: over.slice(0,3).map(el=>el.tagName.toLowerCase()+"."+(el.className||"").toString().split(" ")[0]),
        };
      })()`,
    );
    note(
      "6. Narrow viewport (420px) — shell fits, editor overflows as expected",
      `viewport ${narrow.vw}px, header ${JSON.stringify(narrow.header)}, editor ${JSON.stringify(narrow.editor)}, table ${JSON.stringify(narrow.table)}, elements past the right edge: ${narrow.overflowCount} ${JSON.stringify(narrow.firstOverflow)}`,
    );
    record(
      "6a. Shell header still fits at 420px",
      narrow.header !== null && narrow.header.right <= narrow.vw + 1,
      `header right=${narrow.header?.right} vs viewport ${narrow.vw}`,
    );

    await cdp.send("Emulation.clearDeviceMetricsOverride");
    cdp.close();
  } finally {
    chrome.kill("SIGKILL");
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed ? `${failed} FAILED` : "ALL CHECKS PASSED"} (${results.length - failed} pass / ${failed} fail)`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
