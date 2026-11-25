import { render, screen, fireEvent } from "@testing-library/react";
import { AuthProvider } from "../auth/AuthContext";
import { setToken } from "../api/client";
import { UiVariantContext } from "../lib/uiVariant";
import { Layout } from "./Layout";

/** Build a structurally-valid (unsigned) JWT so jwt-decode can parse it. */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

function renderLayout(role: "admin" | "cashier" | "intake" | "cashier_intake" = "admin") {
  // setToken writes both the in-memory cache and localStorage ('auth_token')
  // — seeding localStorage directly is NOT seen by getToken()'s cache.
  setToken(fakeJwt({ sub: role, role, event_id: 1, exp: 9999999999 }));
  render(
    <AuthProvider>
      <Layout page="admin" onNavigate={() => {}}>
        <div />
      </Layout>
    </AuthProvider>,
  );
}

describe("Layout", () => {
  it("shows a Change Password button in the header", () => {
    renderLayout();
    expect(
      screen.getByRole("button", { name: /change password/i }),
    ).toBeInTheDocument();
  });

  it("opens the change password modal when the button is clicked", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/change password/i);
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });

  it("shows the Documentation tab to every signed-in role", () => {
    renderLayout("cashier");
    expect(
      screen.getByRole("button", { name: /documentation/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /checkout/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /intake/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^admin$/i }),
    ).not.toBeInTheDocument();
  });

  it("shows both Intake and Checkout tabs to the cashier_intake role", () => {
    renderLayout("cashier_intake");
    expect(
      screen.getByRole("button", { name: /intake/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /checkout/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /documentation/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^admin$/i }),
    ).not.toBeInTheDocument();
  });
});

/** Rendering helper for the v2 variant (phase U2 shell classes). */
function renderLayoutV2(role: "admin" | "cashier" | "intake" | "cashier_intake" = "admin") {
  setToken(fakeJwt({ sub: role, role, event_id: 1, exp: 9999999999 }));
  render(
    <UiVariantContext.Provider value="v2">
      <AuthProvider>
        <Layout page="admin" onNavigate={() => {}}>
          <div data-testid="page-body" />
        </Layout>
      </AuthProvider>
    </UiVariantContext.Provider>,
  );
}

describe("Layout v2 variant", () => {
  it("renders the same nav links and account actions as v1", () => {
    renderLayoutV2("admin");
    expect(screen.getByRole("button", { name: /intake/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /checkout/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^admin$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /documentation/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    // username and role badge both read "admin" for this fixture
    expect(screen.getAllByText("admin")).toHaveLength(2);
  });

  it("styles the shell with ui2 classes instead of inline styles", () => {
    renderLayoutV2();
    const main = screen.getByTestId("page-body").parentElement!;
    expect(main.tagName).toBe("MAIN");
    expect(main.className).toBe("ui2-main");
    expect(main.getAttribute("style")).toBeNull();

    const nav = screen.getByRole("navigation", { hidden: true });
    expect(nav.className).toBe("ui2-nav");

    const shell = main.parentElement!;
    expect(shell.className).toBe("ui2-shell");
    expect(shell.getAttribute("style")).toBeNull();
  });

  it("marks the active page with aria-current", () => {
    renderLayoutV2();
    expect(screen.getByRole("button", { name: /^admin$/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: /checkout/i })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("Layout v1 variant (regression)", () => {
  it("keeps the original inline styles and no ui2 classes", () => {
    renderLayout();
    const mainEl = document.querySelector("main")!;
    expect(mainEl.className).toBe("");
    expect(mainEl.getAttribute("style")).toContain("padding: 28px 32px");
    const shell = mainEl.parentElement!;
    expect(shell.className).toBe("");
    expect(shell.getAttribute("style")).toContain("background: rgb(248, 250, 252)");
  });
});
