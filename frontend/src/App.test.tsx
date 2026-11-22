/**
 * App-level hash-routing tests — verifies the behaviors that motivated the
 * URL-based navigation: browser Back works across in-app navigations, module
 * navigation starts each page fresh (no prior visit's state), and deep links
 * (e.g. `#/intake/sellers/1`) address a module's sub-route directly.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { ADMIN_TOKEN } from "./mocks/tokens";
import { setToken } from "./api/client";

/** Clears the URL fragment so every test starts from a known route. */
function resetHash() {
  window.location.hash = "";
}

function renderApp() {
  setToken(ADMIN_TOKEN);
  render(<App />);
}

beforeEach(() => {
  resetHash();
});

afterEach(() => {
  setToken(null);
});

describe("App — hash routing", () => {
  /** Admin role lands on the Admin page (Event Setup section) by default. */
  it("lands admin users on the Admin page by default", async () => {
    renderApp();
    expect(
      await screen.findByRole("heading", { name: "Events" }),
    ).toBeInTheDocument();
    // The module's section tab bar identifies the Admin page.
    expect(screen.getByText("Swap 2026")).toBeInTheDocument();
  });

  /** Nav links swap modules and the URL fragment tracks the page. */
  it("navigates between modules via nav links, updating the URL", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Checkout" }));
    expect(await screen.findByText("Checkout — Swap 2026")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/pos");

    fireEvent.click(screen.getByRole("button", { name: "Intake" }));
    expect(
      await screen.findByRole("button", {
        name: /download non-vendor template/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#/intake");
  });

  /** The browser Back button moves between in-app pages (pushState history). */
  it("returns to the previous module on browser Back", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Checkout" }));
    expect(await screen.findByText("Checkout — Swap 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Intake" }));
    expect(
      await screen.findByRole("button", {
        name: /download non-vendor template/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Documentation" }));
    expect(
      await screen.findByRole("link", { name: "User Guide (PDF)" }),
    ).toBeInTheDocument();

    window.history.back();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /download non-vendor template/i }),
      ).toBeInTheDocument(),
    );

    window.history.back();
    await waitFor(() =>
      expect(screen.getByText("Checkout — Swap 2026")).toBeInTheDocument(),
    );
  });

  /** Navigating away and back remounts a module fresh — the Sellers section's
   * open state does not survive leaving and returning to Admin. */
  it("starts a module fresh when navigating away and back", async () => {
    renderApp();
    // Open Admin's Sellers section (list view).
    fireEvent.click(screen.getByRole("button", { name: /^sellers$/i }));
    expect(await screen.findByText("Jane Smith")).toBeInTheDocument();

    // Leave Admin entirely, then return.
    fireEvent.click(screen.getByRole("button", { name: "Checkout" }));
    expect(await screen.findByText("Checkout — Swap 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));

    // Back on Admin the URL is #/admin → the default section, not Sellers.
    expect(
      await screen.findByRole("heading", { name: "Events" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Jane Smith")).not.toBeInTheDocument();
  });

  /** A deep link addresses a module sub-route directly. */
  it("renders a deep-linked seller detail (#/intake/sellers/1)", async () => {
    window.location.hash = "#/intake/sellers/1";
    renderApp();
    // Detail data comes from the /sellers/:id handler (Jane Doe, code A001).
    expect(await screen.findByText(/Jane Doe/)).toBeInTheDocument();
    expect(window.location.hash).toBe("#/intake/sellers/1");
  });

  /** Browser Back from a deep-linked detail returns to that exact route. */
  it("browser Back returns from a deep link to its detail route", async () => {
    window.location.hash = "#/intake/sellers/1";
    renderApp();
    expect(await screen.findByText(/Jane Doe/)).toBeInTheDocument();

    // Navigate within the module (Search tab is unique), then go Back in history.
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    expect(
      await screen.findByText(/search intake items/i),
    ).toBeInTheDocument();

    window.history.back();
    await waitFor(() =>
      expect(screen.getByText(/Jane Doe/)).toBeInTheDocument(),
    );
    expect(window.location.hash).toBe("#/intake/sellers/1");
  });
});
