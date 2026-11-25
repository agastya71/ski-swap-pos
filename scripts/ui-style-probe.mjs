#!/usr/bin/env node
/**
 * Computed-style probe for the v1-vs-v2 A/B review (phase U2).
 *
 * Screenshots prove little without eyes on them, so this asserts the actual
 * contract: in v1 the shell must keep its original inline values (pixel
 * identity), in v2 the same elements must be driven by `.ui-v2` CSS. Prints a
 * table of property values per variant/viewport plus PASS/FAIL lines.
 *
 * Usage: node scripts/ui-style-probe.mjs [--base URL]
 */
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(n);
  return i === -1 ? d : args[i + 1];
};
const BASE = argOf("--base", "http://127.0.0.1:8001");
const PORT = 9334;
const PROFILE = "/tmp/ui-probe-profile";

const VIEWPORTS = [
  { w: 1280, h: 900, label: "desktop" },
  { w: 420, h: 900, label: "narrow" },
];

async function login() {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  if (!r.ok) throw new Error(`login failed ${r.status}`);
  return (await r.json()).access_token;
}

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
    c.#ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const p = c.#p.get(m.id);
      if (!p) return;
      c.#p.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
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

/**
 * Reads a set of computed properties off the shell elements, plus each shell
 * element's right edge so we can prove the shell itself never overflows.
 */
const PROBE = `(() => {
  const pick = (el, props) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const out = {
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === 'string' ? el.className : '',
      inline: el.getAttribute('style') || '',
      right: Math.round(r.right),
      width: Math.round(r.width),
    };
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  };
  const header = document.querySelector('header');
  const main = document.querySelector('main');
  const footer = document.querySelector('footer');
  const nav = document.querySelector('nav');
  const link = document.querySelector('nav button');
  const shell = document.body.firstElementChild;
  const actions = header && header.lastElementChild;
  const props = ['background-color','border-bottom-width','padding','min-height','display','flex-wrap','font-size','color','max-width','overflow-x'];
  // Widest descendant of the page content, to report (not fail on) page debt.
  let pageOverflow = 0;
  for (const el of document.querySelectorAll('main *')) {
    const r = el.getBoundingClientRect();
    if (r.right > pageOverflow) pageOverflow = Math.round(r.right);
  }
  return {
    v2root: document.documentElement.classList.contains('ui-v2'),
    shell: pick(shell, props),
    header: pick(header, props),
    nav: pick(nav, props),
    navlink: pick(link, [...props, 'border-bottom-width','border-bottom-color','cursor']),
    actions: pick(actions, props),
    main: pick(main, props),
    footer: pick(footer, props),
    docWidth: document.documentElement.clientWidth,
    pageOverflow,
  };
})()`;

function check(label, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  return cond;
}

async function main() {
  const token = await login();
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

  let failures = 0;
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
      } catch {}
      await sleep(250);
    }
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const cdp = await Cdp.connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: `${BASE}/` });
    await sleep(1200);
    await cdp.send("Runtime.evaluate", {
      expression: `localStorage.setItem('auth_token', ${JSON.stringify(token)}); true`,
    });

    const results = {};
    for (const variant of ["v1", "v2"]) {
      for (const vp of VIEWPORTS) {
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width: vp.w,
          height: vp.h,
          deviceScaleFactor: 1,
          mobile: vp.w < 600,
        });
        await cdp.send("Page.navigate", { url: `${BASE}/?ui=${variant}#/intake` });
        await sleep(1800);
        const { result } = await cdp.send("Runtime.evaluate", {
          expression: PROBE,
          returnByValue: true,
        });
        results[`${variant}/${vp.label}`] = result.value;
        console.log(`\n=== ${variant} / ${vp.label} (${vp.w}x${vp.h}) ===`);
        console.log(JSON.stringify(result.value, null, 1));
      }
    }

    console.log("\n=== assertions ===");
    const d1 = results["v1/desktop"];
    const d2 = results["v2/desktop"];
    const n1 = results["v1/narrow"];
    const n2 = results["v2/narrow"];

    failures += !check("v1 root has no .ui-v2 class", d1.v2root === false);
    failures += !check("v2 root has .ui-v2 class", d2.v2root === true);

    // v1 keeps its inline styles verbatim (pixel identity).
    failures += !check(
      "v1 main inline padding is the original 28px 32px",
      d1.main?.inline.includes("padding: 28px 32px"),
      d1.main?.inline,
    );
    failures += !check(
      "v1 header keeps white background + hairline border",
      d1.header?.["background-color"] === "rgb(255, 255, 255)" &&
        d1.header?.["border-bottom-width"] === "1px",
      `${d1.header?.["background-color"]} / ${d1.header?.["border-bottom-width"]}`,
    );
    failures += !check(
      "v1 active nav link keeps 3px bottom border",
      d1.navlink?.["border-bottom-width"] === "3px",
      d1.navlink?.["border-bottom-width"],
    );

    // v2 has no inline styles on the shell elements: everything is CSS.
    failures += !check("v2 header carries no inline style attribute", d2.header?.inline === "", d2.header?.inline);
    failures += !check("v2 main carries no inline style attribute", d2.main?.inline === "", d2.main?.inline);
    failures += !check(
      "v2 navlink is class-driven; active state uses background + aria-current, not a border",
      d2.navlink?.cls.includes("ui2-navlink") &&
        d2.navlink?.["border-bottom-width"] === "0px" &&
        d2.navlink?.["background-color"] === "rgb(219, 234, 254)",
      `${d2.navlink?.cls} / border ${d2.navlink?.["border-bottom-width"]} / bg ${d2.navlink?.["background-color"]}`,
    );
    failures += !check(
      "v2 main is width-capped at 1600px, v1 is not",
      d2.main?.["max-width"] === "1600px" && d1.main?.["max-width"] === "none",
      `v2=${d2.main?.["max-width"]} v1=${d1.main?.["max-width"]}`,
    );

    // Responsive win, scoped to the shell: at 420px every v2 shell element
    // must stay inside the viewport. v1 is the baseline and is EXPECTED to
    // overflow here (nowrap header + fixed 28/32px padding push the shell to
    // 819px on a 420px screen); we report it rather than fail on it, because
    // v1 must stay pixel-identical. Overflow from page bodies is U3/U4/U5.
    const widest = (r) =>
      Math.max(r.header?.right ?? 0, r.nav?.right ?? 0, r.actions?.right ?? 0, r.main?.right ?? 0, r.footer?.right ?? 0);
    failures += !check(
      "v2 narrow: every shell element stays within the 420px viewport",
      widest(n2) <= n2.docWidth,
      `widest shell edge ${widest(n2)} vs ${n2.docWidth}`,
    );
    console.log(
      `INFO  v1 narrow shell edge ${widest(n1)}px vs ${n1.docWidth}px viewport — the unresponsive baseline U2 replaces`,
    );

    // v2 narrow: nav drops to its own row instead of overflowing.
    failures += !check(
      "v2 narrow: header wraps (nav on its own row)",
      n2.header?.["flex-wrap"] === "wrap",
      n2.header?.["flex-wrap"],
    );
    failures += !check(
      "v1 narrow: header keeps its original nowrap single row",
      n1.header?.["flex-wrap"] === "nowrap",
      n1.header?.["flex-wrap"],
    );

    console.log(
      `\nINFO  page-content overflow at 420px (deferred to U3/U4/U5): v1 ${n1.pageOverflow}px, v2 ${n2.pageOverflow}px vs viewport ${n2.docWidth}px`,
    );

    await cdp.send("Runtime.evaluate", {
      expression: `localStorage.removeItem('ui-variant'); true`,
    });
    cdp.close();
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    if (failures) process.exitCode = 1;
  } finally {
    chrome.kill("SIGKILL");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
