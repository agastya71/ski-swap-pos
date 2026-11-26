/**
 * Structural guards for the UI overhaul's CSS wiring.
 *
 * Two failure modes have already cost real debugging time and both fail
 * SILENTLY — nothing throws, nothing logs, the page just renders without the
 * styles that were just written:
 *
 *  1. `@import` after any other statement. PostCSS drops the import and prints
 *     a warning that scrolls past. This happened twice: once when the imports
 *     were appended to the end of `index.css` (PR #165), and again when a
 *     `main` → branch merge re-ordered the file. Both times the built bundle
 *     simply lacked every `.ui2-*` rule while every test stayed green.
 *  2. A v2 stylesheet that is never imported. Rules sit in the repo looking
 *     authoritative while the browser never sees them.
 *
 * The fix for both is the same: assert the wiring, not the intention.
 *
 * Why a script and not a vitest test: Vitest stubs CSS imports to empty
 * strings, so `import.meta.glob('*.css', {query:'?raw'})` returns "" for every
 * file and any assertion built on it is vacuous.
 *
 *   node scripts/css-wiring-check.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..");
const SRC = join(REPO_ROOT, "frontend", "src");
const INDEX_CSS = join(SRC, "index.css");

const failures = [];
function fail(message) {
  failures.push(message);
  console.log(`  FAIL  ${message}`);
}
function pass(message) {
  console.log(`  PASS  ${message}`);
}

/** Every `.css` file under src/. */
function allCssFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) allCssFiles(full, out);
    else if (entry.endsWith(".css")) out.push(full);
  }
  return out;
}

const rel = (f) => relative(SRC, f).replace(/\\/g, "/");

/** Stylesheets that ship v2 rules. */
const v2Files = allCssFiles(SRC).filter((f) => /v2|ui2/i.test(rel(f)));

function checkImportsAreFirst() {
  const lines = readFileSync(INDEX_CSS, "utf8").split("\n");
  const importLines = [];
  let firstOther = -1;
  let inBlockComment = false;

  lines.forEach((raw, i) => {
    let line = raw;
    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end === -1) return;
      line = line.slice(end + 2);
      inBlockComment = false;
    }
    const start = line.indexOf("/*");
    if (start !== -1) {
      const end = line.indexOf("*/", start);
      if (end === -1) {
        inBlockComment = true;
        line = line.slice(0, start);
      } else {
        line = line.slice(0, start) + line.slice(end + 2);
      }
    }
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("@import")) importLines.push(i + 1);
    else if (firstOther === -1) firstOther = i + 1;
  });

  if (importLines.length === 0) {
    fail("frontend/src/index.css has no @import statements at all");
    return;
  }
  if (firstOther === -1) {
    pass(`all ${importLines.length} @import statements precede other rules`);
    return;
  }
  const lastImport = Math.max(...importLines);
  if (lastImport < firstOther) {
    pass(`all ${importLines.length} @import statements precede line ${firstOther}`);
  } else {
    fail(
      `frontend/src/index.css:${lastImport} @import comes AFTER line ${firstOther} — ` +
        `PostCSS will drop it and the rule's styles never reach the browser`,
    );
  }
}

function checkEveryV2SheetIsImported() {
  if (v2Files.length === 0) {
    fail("found no v2 stylesheets under frontend/src — filter is wrong");
    return;
  }
  const indexCss = readFileSync(INDEX_CSS, "utf8");
  const missing = [];
  for (const file of v2Files) {
    const specifier = "./" + relative(dirname(INDEX_CSS), file).replace(/\\/g, "/");
    if (!indexCss.includes(`'${specifier}'`) && !indexCss.includes(`"${specifier}"`)) {
      missing.push(rel(file));
    }
  }
  if (missing.length === 0) {
    pass(`all ${v2Files.length} v2 stylesheets are imported by index.css`);
  } else {
    fail(`v2 stylesheets exist but are never imported: ${missing.join(", ")}`);
  }
}

function checkV2RulesAreScoped() {
  const leaks = [];
  let ruleCount = 0;
  for (const file of v2Files) {
    const body = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectorRe = /(?:^|\})\s*([^{}@]+)\{/g;
    let m;
    while ((m = selectorRe.exec(body)) !== null) {
      const selector = m[1].trim();
      if (!selector || selector.startsWith("@")) continue;
      ruleCount++;
      if (selector.includes(".ui-v2") || selector.includes(".ui2-")) continue;
      leaks.push(`${rel(file)}: ${selector.slice(0, 70)}`);
    }
  }
  if (leaks.length === 0) {
    pass(`all ${ruleCount} v2 rules are scoped under .ui-v2 / .ui2-*`);
  } else {
    fail(
      `${leaks.length} unscoped rule(s) in v2 sheets would leak into v1:\n        ` +
        leaks.slice(0, 8).join("\n        "),
    );
  }
}

function checkCssVarsAreDefined() {
  // A referenced custom property that is never defined resolves to nothing and
  // the declaration is silently dropped by the browser — no build error, no
  // test failure. This has shipped twice (`--font-size-base` in U3, and
  // `--gray-600`/`--gray-800` in U4) before a computed-style probe noticed.
  const defined = new Set();
  const defineRe = /(--[a-z0-9-]+)\s*:/g;
  const allSheets = allCssFiles(SRC);
  for (const file of allSheets) {
    const body = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    let m;
    while ((m = defineRe.exec(body)) !== null) defined.add(m[1]);
  }

  const offenders = [];
  for (const file of v2Files) {
    const body = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const useRe = /var\(\s*(--[a-z0-9-]+)/g;
    let m;
    while ((m = useRe.exec(body)) !== null) {
      const name = m[1];
      if (!defined.has(name)) offenders.push(`${rel(file)}: ${name}`);
    }
  }

  if (offenders.length === 0) {
    pass(`every var() in the v2 sheets resolves to a defined custom property`);
  } else {
    fail(
      `${offenders.length} undefined CSS custom propert(ies) — the declaration is ` +
        `dropped silently by the browser:\n        ` +
        [...new Set(offenders)].slice(0, 10).join("\n        "),
    );
  }
}

function checkVariantFlagPlacement() {
  // `/next/` serves the v2-aware bundle but still defaults to v1: the flag has
  // to be in the query string, before the hash, or every v2 assertion in the
  // probe scripts fails for the wrong reason.
  const scripts = readdirSync(join(REPO_ROOT, "scripts"))
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => join(REPO_ROOT, "scripts", f));

  const offenders = [];
  for (const file of scripts) {
    const body = readFileSync(file, "utf8");
    // Line-scoped on purpose: a multi-line template literal would otherwise
    // match a /next/ URL and an unrelated #hash from two different strings.
    // A real navigation is a single-line template like `${BASE}/next/?ui=v2#/x`.
    const re = /`[^`\n]*\/next\/[^`\n]*#[^`\n]*`/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      const url = m[0];
      if (!url.includes("?ui=")) offenders.push(`${relative(REPO_ROOT, file)}: ${url}`);
    }
  }
  if (offenders.length === 0) {
    pass("no script navigates to /next/ with a hash but no ?ui= flag");
  } else {
    fail(
      `these URLs render v1 from a v2 bundle (flag must precede the hash):\n        ` +
        offenders.join("\n        "),
    );
  }
}


/**
 * Classes the components emit but no stylesheet defines.
 *
 * The mirror image of the var() problem: a `ui2-*` class with no rule renders
 * exactly like v1, so a conversion looks done while the v2 look never lands.
 * Found 3 of these in U4 part 2 (`ui2-pay-error`, `ui2-pos-result-remaining`,
 * `ui2-items-row--open`) plus one emitted under the wrong name.
 *
 * Template-literal class names (`ui2-btn--${variant}`) are collected as the
 * truncated prefix `ui2-btn--` and skipped; their concrete forms are covered by
 * the literal names in the same expression.
 */
function checkEmittedClassesAreStyled() {
  // Namespace markers that are deliberately rule-less: they group the
  // `--modifier` classes below them and carry no declarations of their own.
  const ALLOWED = new Set(["ui2-btn"]);

  const tsxFiles = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) tsxFiles.push(full);
    }
  })(SRC);

  const emitted = new Map();
  for (const file of tsxFiles) {
    const body = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    let m;
    const re = /ui2-[a-z0-9-]+/g;
    while ((m = re.exec(body)) !== null) {
      const name = m[0];
      if (name.endsWith("--")) continue; // truncated template prefix
      if (!emitted.has(name)) emitted.set(name, rel(file));
    }
  }

  const defined = new Set();
  for (const file of allCssFiles(SRC)) {
    const body = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    let m;
    const re = /\.(ui2-[a-z0-9-]+)/g;
    while ((m = re.exec(body)) !== null) defined.add(m[1]);
  }

  const offenders = [];
  for (const [name, file] of emitted) {
    if (ALLOWED.has(name) || defined.has(name)) continue;
    offenders.push(`${name} (emitted in ${file})`);
  }

  if (offenders.length === 0) {
    pass(`all ${emitted.size} emitted ui2-* classes have a rule`);
  } else {
    fail(
      `${offenders.length} ui2-* class(es) are emitted with no stylesheet rule — ` +
        "they render exactly like v1:\n        " +
        offenders.sort().join("\n        "),
    );
  }
}

console.log("# UI overhaul CSS wiring\n");
checkImportsAreFirst();
checkEveryV2SheetIsImported();
checkV2RulesAreScoped();
checkCssVarsAreDefined();
checkVariantFlagPlacement();
checkEmittedClassesAreStyled();

const failed = failures.length;
console.log(
  `\n${failed ? `${failed} FAILED` : "ALL CHECKS PASSED"} (${failed ? "see above" : "6 groups"})`,
);
process.exit(failed ? 1 : 0);
