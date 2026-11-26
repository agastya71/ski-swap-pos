/*
 * MD3 press ripple (Material skin, PR 1 of the UI Material pass).
 *
 * One delegated pointerdown listener on <document>, guarded to only act when
 * the root carries .ui-v2 — inert in v1, exactly like the v2 token sheet.
 * Ripple state lives entirely in the DOM (a transient <span>), so no React
 * re-renders and no changes to any component tree.
 *
 * Rules honored:
 * - keyboard activation does NOT ripple (focus ring already covers it)
 * - reduced-motion: animation is suppressed globally by ui-v2.css; here we
 *   also skip creating the span at all, so nothing is left to clean up
 * - radius is taken from the element, so pill buttons ripple as pills
 */

const RIPPLE_SELECTOR = ".ui-v2 button, .ui-v2 [role='button']";

let installed = false;

export function installRipple(doc: Document = document): void {
  if (installed) return;
  installed = true;
  doc.addEventListener(
    "pointerdown",
    (event: PointerEvent) => {
      // pointercancel/up removes the span; reduced-motion skips creation.
      const root = doc.documentElement;
      if (!root.classList.contains("ui-v2")) return;
      if (root.classList.contains("ui2-reduced-motion")) return;
      const target = (event.target as Element | null)?.closest?.(RIPPLE_SELECTOR) as HTMLElement | null;
      if (!target || (target as HTMLButtonElement).disabled || target.getAttribute("aria-disabled") === "true") return;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const size = Math.max(rect.width, rect.height) * 2;
      const span = doc.createElement("span");
      span.className = "ui2-ripple";
      span.style.width = `${size}px`;
      span.style.height = `${size}px`;
      span.style.left = `${event.clientX - rect.left - size / 2}px`;
      span.style.top = `${event.clientY - rect.top - size / 2}px`;
      target.append(span);
      span.addEventListener("animationend", () => span.remove());
    },
    { passive: true },
  );
}

/** Hook for future teardown (the real listener is app-global and permanent). */
export function uninstallRipple(): void {
  installed = false;
}
