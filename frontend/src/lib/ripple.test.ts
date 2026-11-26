/*
 * Ripple unit tests — jsdom: pointerdown on a v2 root creates one transient
 * span inside the pressed element; v1 roots and the reduced-motion flag
 * suppress creation entirely. The animation itself is verified in a real
 * Chrome via the manual CDP probe (see docs/ui-verification-pitfalls).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installRipple } from "./ripple";


/** jsdom has no layout engine: every getBoundingClientRect is all-zero. */
function withRect(el: HTMLElement, rect: { width: number; height: number }): void {
  el.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: rect.width, bottom: rect.height,
    width: rect.width, height: rect.height, toJSON() { return this; },
  } as DOMRect);
}

function press(el: Element): void {
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
}

describe("installRipple", () => {
  let cleanup: (() => void)[] = [];

  beforeEach(() => {
    cleanup = [];
    document.documentElement.className = "";
  });
  afterEach(() => {
    for (const fn of cleanup) fn();
    cleanup = [];
  });

  function listenOnce(): void {
    // installRipple is idempotent for the document; each test re-applies the root class
    installRipple();
    cleanup.push(() => {
      document.querySelectorAll(".ui2-ripple").forEach((n) => n.remove());
    });
  }

  it("appends a .ui2-ripple span sized to the pressed element", () => {
    document.documentElement.classList.add("ui-v2");
    listenOnce();
    const btn = document.createElement("button");
    withRect(btn, { width: 120, height: 44 });
    document.body.appendChild(btn);
    press(btn);
    const span = btn.querySelector(".ui2-ripple");
    expect(span).not.toBeNull();
    expect(span!.classList.contains("ui2-ripple")).toBe(true);
        // geometry: 2x the larger axis, centered on the press point (clientX=0 → left = 0 − 240/2)
    expect((span as HTMLElement).style.width).toBe("240px");
    expect((span as HTMLElement).style.height).toBe("240px");
    const left = (span as HTMLElement).style.left;
    const top = (span as HTMLElement).style.top;
    expect(left).toBe("-120px"); // pressX(0) − 240/2 with default clientX=0
    expect(top).toBe("-120px"); // pressY(0) − 240/2
  });

  it("does not ripple in v1 (no .ui-v2 root)", () => {
    listenOnce();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    press(btn);
    expect(btn.querySelector(".ui2-ripple")).toBeNull();
  });

  it("respects the reduced-motion flag (no span at all)", () => {
    document.documentElement.classList.add("ui-v2", "ui2-reduced-motion");
    listenOnce();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    press(btn);
    expect(btn.querySelector(".ui2-ripple")).toBeNull();
  });

  it("skips disabled buttons", () => {
    document.documentElement.classList.add("ui-v2");
    listenOnce();
    const btn = document.createElement("button") as HTMLButtonElement;
    btn.disabled = true;
    document.body.appendChild(btn);
    press(btn);
    expect(btn.querySelector(".ui2-ripple")).toBeNull();
  });

  it("does not double-install", () => {
    document.documentElement.classList.add("ui-v2");
    // jsdom has no layout: only a rect-stubbed button ripples (same as above).
    const btn = document.createElement("button");
    withRect(btn, { width: 120, height: 44 });
    installRipple();
    installRipple(); // second call must be a no-op (module flag)
    document.body.appendChild(btn);
    press(btn);
    const spans = btn.querySelectorAll(".ui2-ripple");
    expect(spans.length).toBe(1);
  });
});
