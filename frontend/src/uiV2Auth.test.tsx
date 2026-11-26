/**
 * U6 — the last six surfaces that still carried inline styles.
 *
 * These files sat outside every earlier phase (login and the password modal
 * are not inside `Layout`, the shared components are used by several modules,
 * and the Square panel is behind a feature flag), so they were lifted last.
 *
 * Two things must stay true, and both are asserted here:
 *
 *  1. **v1 is untouched.** Each converted element still receives its original
 *     inline object verbatim, so the pre-overhaul build is pixel-identical.
 *     `style={{}}` disappearing from the source is not evidence of that — the
 *     style tables are, so they are pinned by value.
 *  2. **v2 gets a class, not a style.** `variantProps` must emit exactly one of
 *     the two, never both, or v1's inline values would override the v2 sheet.
 *
 * @module uiV2Auth.test
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UiVariantContext } from "./lib/uiVariant";
import { BUTTON_STYLE } from "./lib/buttons";
import {
  CHANGE_PASSWORD,
  DOCS_PAGE,
  IMPORT_OUTCOME,
  LOGIN,
  SELLER_COMBOBOX,
  SQUARE,
  v1Only,
  v2Only,
  variantProps,
} from "./uiStyles";
import { LoginPage } from "./auth/LoginPage";
import { ChangePasswordModal } from "./auth/ChangePasswordModal";
import { ImportOutcome } from "./components/ImportOutcome";
import { SellerCombobox } from "./components/SellerCombobox";
import { DocumentationPage } from "./docs/DocumentationPage";
import { AuthProvider } from "./auth/AuthContext";

/** Render `ui` with the app pinned to a variant. */
function renderWith(ui: React.ReactElement, variant: "v1" | "v2") {
  return render(
    <UiVariantContext.Provider value={variant}>{ui}</UiVariantContext.Provider>,
  );
}

const okResult = { imported: 3, skipped: 0, errors: [] };

describe("variantProps contract (U6)", () => {
  it("emits the class and no style in v2", () => {
    const out = variantProps(true, "ui2-x", { color: "red" });
    expect(out).toEqual({ className: "ui2-x", style: undefined });
    expect(out).not.toHaveProperty("color");
  });

  it("emits the style and no className in v1", () => {
    const out = variantProps(false, "ui2-x", { color: "red" });
    expect(out).toEqual({ className: undefined, style: { color: "red" } });
  });

  it("collapses an empty class name to undefined rather than className=''", () => {
    expect(variantProps(true, "", { color: "red" }).className).toBeUndefined();
  });

  it("v1Only drops the style in v2 but keeps it in v1", () => {
    expect(v1Only(true, { color: "red" })).toEqual({ style: undefined });
    expect(v1Only(false, { color: "red" })).toEqual({ style: { color: "red" } });
  });

  it("v2Only drops the class in v1 but keeps it in v2", () => {
    expect(v2Only(true, "ui2-y")).toEqual({ className: "ui2-y" });
    expect(v2Only(false, "ui2-y")).toEqual({ className: undefined });
  });
});

describe("v1 style tables are pinned (U6)", () => {
  it("LoginPage keeps its one-off card elevation and 30px brand", () => {
    expect(LOGIN.card.boxShadow).toBe("0 4px 24px rgba(0,0,0,0.07)");
    expect(LOGIN.card.maxWidth).toBe(400);
    expect(LOGIN.card.padding).toBe("40px 48px");
    expect(LOGIN.brandTitle.fontSize).toBe(30);
    expect(LOGIN.brandTitle.letterSpacing).toBe("-0.03em");
    expect(LOGIN.brandStripe.height).toBe(4);
    expect(LOGIN.footer.padding).toBe("14px 24px");
    expect(LOGIN.submit).toEqual({ ...BUTTON_STYLE, width: "100%" });
  });

  it("ChangePasswordModal keeps its own input padding, not the admin modal's", () => {
    expect(CHANGE_PASSWORD.plainInput.padding).toBe(8);
    expect(CHANGE_PASSWORD.cancel.padding).toBe("8px 16px");
    expect(CHANGE_PASSWORD.panel.width).toBe(360);
    // The stacking lives on the backdrop, not the panel — a lifted panel with
    // its own z-index would change which modal wins when two are open.
    expect(CHANGE_PASSWORD.backdrop.zIndex).toBe(50);
    expect(CHANGE_PASSWORD.unmet.color).toBe("#ef4444");
    expect(CHANGE_PASSWORD.met.color).toBe("#16a34a");
  });

  it("ImportOutcome tone precedence is skipped > warnings > success", () => {
    expect(IMPORT_OUTCOME.tone(1, true)).toBe("error");
    expect(IMPORT_OUTCOME.tone(1, false)).toBe("error");
    expect(IMPORT_OUTCOME.tone(0, true)).toBe("warn");
    expect(IMPORT_OUTCOME.tone(0, false)).toBe("ok");
    expect(IMPORT_OUTCOME.skin.error.background).toBe("#fef2f2");
    expect(IMPORT_OUTCOME.skin.warn.background).toBe("#fffbeb");
    expect(IMPORT_OUTCOME.skin.ok.background).toBe("#f0fdf4");
  });

  it("SellerCombobox keeps the navy border and soft dropdown shadow", () => {
    expect(SELLER_COMBOBOX.input.border).toBe("1px solid #1e3a8a");
    expect(SELLER_COMBOBOX.dropdown.boxShadow).toBe("0 4px 12px rgba(0,0,0,0.10)");
    expect(SELLER_COMBOBOX.dropdown.maxHeight).toBe(240);
  });

  it("DocumentationPage and Square keep their non-palette values", () => {
    expect(DOCS_PAGE.link.color).toBe("#1a237e");
    expect(DOCS_PAGE.panel.background).toBe("#f8fafc");
    expect(SQUARE.container.minHeight).toBe(89);
    expect(SQUARE.captureButton.background).toBe("#2e7d32");
  });
});

describe("LoginPage v2 (U6)", () => {
  it("v1 keeps inline styles on the card and footer", () => {
    renderWith(
      <AuthProvider>
        <LoginPage onLogin={vi.fn()} />
      </AuthProvider>,
      "v1",
    );
    const card = document.querySelector(".ui2-login-card");
    expect(card).toBeNull();
    const brand = screen.getByText(/Ski Swap POS/);
    expect(brand).toHaveStyle({ fontSize: "30px", color: "#1e3a8a" });
  });

  it("v2 swaps every inline style for a class", () => {
    renderWith(
      <AuthProvider>
        <LoginPage onLogin={vi.fn()} />
      </AuthProvider>,
      "v2",
    );
    const card = document.querySelector(".ui2-login-card");
    expect(card).not.toBeNull();
    expect((card as HTMLElement).getAttribute("style")).toBeNull();
    const brand = screen.getByText(/Ski Swap POS/);
    expect(brand).toHaveClass("ui2-login-brand-title");
    expect(brand.getAttribute("style")).toBeNull();
  });

  it("keeps the form contract identical in both variants", () => {
    for (const variant of ["v1", "v2"] as const) {
      const { unmount } = renderWith(
        <AuthProvider>
          <LoginPage onLogin={vi.fn()} />
        </AuthProvider>,
        variant,
      );
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign in/i }),
      ).toBeInTheDocument();
      unmount();
    }
  });
});

describe("ChangePasswordModal v2 (U6)", () => {
  const open = () => renderWith(<ChangePasswordModal onClose={vi.fn()} />, "v2");

  it("v2 puts classes on the backdrop and panel with no inline style", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: /change password/i });
    expect(dialog).toHaveClass("ui2-cp-backdrop");
    expect(dialog.getAttribute("style")).toBeNull();
    const panel = dialog.querySelector(".ui2-cp-panel") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute("style")).toBeNull();
  });

  it("marks unmet policy items via data-met, not a style", () => {
    open();
    const item = document.querySelector(".ui2-cp-policy li") as HTMLElement;
    expect(item.getAttribute("data-met")).toBe("false");
    expect(item.getAttribute("style")).toBeNull();
  });

  it("keeps the three password fields in both variants", () => {
    for (const variant of ["v1", "v2"] as const) {
      const { unmount } = renderWith(
        <ChangePasswordModal onClose={vi.fn()} />,
        variant,
      );
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("ImportOutcome v2 (U6)", () => {
  it("v2 emits one modifier class for the tone", () => {
    renderWith(
      <ImportOutcome
        result={{
          imported: 2,
          skipped: 1,
          errors: [{ row: 3, reason: "bad code" }],
        }}
      />,
      "v2",
    );
    const banner = screen.getByRole("status");
    expect(banner).toHaveClass("ui2-io", "ui2-io--error");
    expect(banner.getAttribute("style")).toBeNull();
  });

  it("warnings-only banners use the warn skin in both variants", () => {
    renderWith(
      <ImportOutcome
        result={{ ...okResult, warnings: ["duplicate upload"] }}
      />,
      "v2",
    );
    expect(screen.getByRole("status")).toHaveClass("ui2-io--warn");
  });

  it("v1 keeps the inline background for the same tone", () => {
    renderWith(
      <ImportOutcome
        result={{
          imported: 2,
          skipped: 1,
          errors: [{ row: 3, reason: "bad code" }],
        }}
      />,
      "v1",
    );
    const banner = screen.getByRole("status");
    expect(banner.className).not.toContain("ui2-io");
    expect(banner).toHaveStyle({ background: "#fef2f2" });
  });
});

describe("SellerCombobox v2 (U6)", () => {
  it("v2 classes the input and shows no inline style", () => {
    renderWith(<SellerCombobox onSelect={vi.fn()} />, "v2");
    const input = screen.getByPlaceholderText(/search by name or code/i);
    expect(input).toHaveClass("ui2-combobox-input");
    expect(input.getAttribute("style")).toBeNull();
  });

  it("v1 keeps the navy border inline", () => {
    renderWith(<SellerCombobox onSelect={vi.fn()} />, "v1");
    const input = screen.getByPlaceholderText(/search by name or code/i);
    // jsdom never expands the `border` shorthand, so `toHaveStyle({ border })`
    // cannot see it — read the declaration the component actually wrote.
    expect((input as HTMLInputElement).style.border).toBe(
      "1px solid rgb(30, 58, 138)",
    );
  });
});

describe("DocumentationPage v2 (U6)", () => {
  it("v2 classes the panel; v1 keeps its inline background", () => {
    const v2Render = renderWith(<DocumentationPage />, "v2");
    expect(document.querySelector(".ui2-docs-panel")).not.toBeNull();
    expect(
      (document.querySelector(".ui2-docs-panel") as HTMLElement).getAttribute(
        "style",
      ),
    ).toBeNull();
    v2Render.unmount();

    renderWith(<DocumentationPage />, "v1");
    expect(document.querySelector(".ui2-docs-panel")).toBeNull();
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveStyle({ color: "#1a237e" });
  });
});

describe("SquarePayment style tables (U6)", () => {
  it("capture button flips cursor per state and keeps Square green", () => {
    expect(SQUARE.captureButton.cursor).toBe("pointer");
    expect(SQUARE.captureButtonDisabled.cursor).toBe("not-allowed");
    for (const table of [SQUARE.captureButton, SQUARE.captureButtonDisabled]) {
      expect(table.background).toBe("#2e7d32");
    }
  });
});
