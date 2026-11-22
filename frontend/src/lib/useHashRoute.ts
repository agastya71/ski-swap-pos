/**
 * Minimal hash-based router — no dependencies.
 *
 * The app's navigation state lives in the URL fragment (e.g. `#/intake/sellers`),
 * so every in-app navigation pushes a real browser history entry: the browser's
 * Back/Forward buttons move between in-app pages instead of leaving the site,
 * and every module/tab navigated to starts fresh (new mount → new state).
 *
 * Design notes:
 * - `history.pushState` with a hash-only URL doesn't fire `hashchange` or
 *   `popstate` in the pushing window, so `navigate` also notifies listeners
 *   directly. `popstate` covers Back/Forward and manual hash edits, while
 *   `hashchange` catches manual URL edits in browsers that dispatch it.
 *
 * @module useHashRoute
 */
import { useEffect, useState } from "react";

/** Listeners notified after history.pushState (which fires no event itself). */
const pushListeners = new Set<() => void>();

function notifyPush() {
  pushListeners.forEach((fn) => fn());
}

/** Reads the current location hash without the leading `#`. */
function readHash(): string {
  return window.location.hash.replace(/^#/, "");
}

/**
 * Navigates to `hash` (with or without the leading `#`) by pushing a browser
 * history entry. Back/Forward then traverse these entries in-app.
 */
export function navigate(hash: string) {
  const target = hash.startsWith("#") ? hash : `#${hash}`;
  if (window.location.hash === target) return;
  window.history.pushState(null, "", target);
  notifyPush();
}

/**
 * Returns the current location hash (without the leading `#`), updating on
 * Back/Forward (popstate), manual hash edits (hashchange), and navigate().
 */
export function useHashRoute(): string {
  const [hash, setHash] = useState(readHash);

  useEffect(() => {
    const sync = () => setHash(readHash());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    pushListeners.add(sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
      pushListeners.delete(sync);
    };
  }, []);

  return hash;
}
