#!/usr/bin/env node
/**
 * Capture v1-vs-v2 screenshots for the UI overhaul A/B review (phase U2).
 *
 * Drives headless Chrome over the DevTools Protocol (no puppeteer dependency;
 * Node 24 has a global WebSocket). The SPA persists its JWT in
 * localStorage['auth_token'], so the script navigates to the app origin once,
 * injects a token minted via POST /auth/login, then reloads each target route.
 *
 * Usage: node scripts/ui-screenshots.mjs [--out DIR] [--base URL]
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};

const OUT = argOf("--out", "/tmp/ui-shots");
const BASE = argOf("--base", "http://127.0.0.1:8001");
const PORT = 9333;
const PROFILE = "/tmp/ui-shots-profile";

/** Routes to capture: hash route + label. */
const ROUTES = [
  { hash: "#/intake", label: "intake" },
  { hash: "#/admin", label: "admin" },
];

/** Viewports: desktop and a small phone. */
const VIEWPORTS = [
  { w: 1280, h: 900, label: "desktop" },
  { w: 420, h: 900, label: "narrow" },
];

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const { access_token } = await res.json();
  return access_token;
}

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async connect(wsUrl) {
    const cdp = new Cdp();
    cdp.#ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      cdp.#ws.onopen = res;
      cdp.#ws.onerror = rej;
    });
    cdp.#ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const p = cdp.#pending.get(msg.id);
      if (!p) return;
      cdp.#pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    };
    return cdp;
  }

  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.#pending.set(id, { res, rej }));
  }

  close() {
    this.#ws.close();
  }
}

async function waitForHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`Chrome DevTools never came up at ${url}`);
}

async function main() {
  const token = await login();
  await mkdir(OUT, { recursive: true });
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
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore", detached: false },
  );

  let exits = false;
  const shutdown = () => {
    if (!exits) {
      exits = true;
      chrome.kill("SIGKILL");
    }
  };

  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/json/version`);
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("no page target");
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    // Land on the app origin so localStorage is writable for that origin.
    await cdp.send("Page.navigate", { url: `${BASE}/` });
    await sleep(1200);
    await cdp.send("Runtime.evaluate", {
      expression: `localStorage.setItem('auth_token', ${JSON.stringify(token)}); true`,
    });

    const shots = [];
    for (const variant of ["v1", "v2"]) {
      for (const vp of VIEWPORTS) {
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width: vp.w,
          height: vp.h,
          deviceScaleFactor: 1,
          mobile: vp.w < 600,
        });
        for (const route of ROUTES) {
          const flag = variant === "v2" ? "?ui=v2" : "?ui=v1";
          const url = `${BASE}/${flag}${route.hash}`;
          await cdp.send("Page.navigate", { url });
          // SPA mount + data fetch; generous but bounded.
          await sleep(1800);
          const { data } = await cdp.send("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
          });
          const file = `${OUT}/${variant}-${vp.label}-${route.label}.png`;
          await writeFile(file, Buffer.from(data, "base64"));
          shots.push(file);
        }
      }
    }

    // Reset the variant flag so the profile does not leak v2 into other runs.
    await cdp.send("Runtime.evaluate", {
      expression: `localStorage.removeItem('ui-variant'); true`,
    });
    cdp.close();
    for (const f of shots) console.log(f);
  } finally {
    shutdown();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
