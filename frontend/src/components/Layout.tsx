/**
 * Application shell layout — renders the brand nav bar with the MYSL logo,
 * role-aware navigation links (Intake, Checkout, Admin, Documentation), the
 * signed-in username and role badge, a Sign Out button, and a footer. Wraps each
 * page's content in a full-height flex container.
 *
 * Styling is variant-aware (phase U2 of docs/ui-overhaul-ab-plan-2026-11-24.md):
 * v1 keeps the original inline styles unchanged (they live in layoutStyles.ts),
 * v2 renders the same DOM with `ui2-*` class names from `ui-v2-shell.css`
 * (responsive reflow, token spacing, 44px touch targets on coarse pointers,
 * visible focus). Only style/class attributes differ — element structure,
 * labels and roles are identical in both variants, so every behavioural test
 * covers both.
 */
import { useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { ChangePasswordModal } from "../auth/ChangePasswordModal";
import { useUiVariant } from "../lib/uiVariant";
import { V1, variantProps } from "./layoutStyles";

type Page = "intake" | "pos" | "admin" | "docs";

/** Shared nav-link styling for the v1 variant (active tab is underlined). */
function v1NavLinkStyle(active: boolean) {
  return {
    background: "none",
    border: "none",
    borderBottom: active ? "3px solid #2563eb" : "3px solid transparent",
    padding: "0 18px",
    height: 56,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    color: active ? "#2563eb" : "#374151",
    borderRadius: 0,
    letterSpacing: 0,
  } as const;
}

/**
 * Single navigation tab button used inside the Layout header.
 *
 * @param props.label - Text label for the nav link.
 * @param props.active - Whether this link represents the currently visible page.
 * @param props.onClick - Callback invoked when the user clicks the link.
 * @param props.v2 - Render the v2 class-based styling instead of inline styles.
 */
function NavLink({
  label,
  active,
  onClick,
  v2,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  v2: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={v2 ? "ui2-navlink" : undefined}
      style={v2 ? undefined : v1NavLinkStyle(active)}
    >
      {label}
    </button>
  );
}

/**
 * Full-page layout wrapper that renders the top nav bar and footer around page content.
 * Navigation links are shown or hidden based on the signed-in user's role.
 *
 * @param props.children - Page content rendered inside the main content area.
 * @param props.page - Currently active page identifier used to highlight the correct nav link.
 * @param props.onNavigate - Callback invoked with the target page when a nav link is clicked.
 */
export function Layout({
  children,
  page,
  onNavigate,
}: {
  children: ReactNode;
  page: Page;
  onNavigate: (p: Page) => void;
}) {
  const { decoded, signOut } = useAuth();
  const role = decoded?.role;
  const [showChangePw, setShowChangePw] = useState(false);
  const v2 = useUiVariant() === "v2";

  return (
    <div {...variantProps(v2, "ui2-shell", V1.shell)}>
      {/* Brand stripe */}
      <div {...variantProps(v2, "ui2-brand-stripe", V1.brandStripe)} />

      {/* Navigation bar */}
      <header {...variantProps(v2, "ui2-header", V1.header)}>
        {/* Logo */}
        <div {...variantProps(v2, "ui2-brand", V1.brand)}>
          ⛷&ensp;Ski Swap POS
        </div>

        {/* Nav links */}
        <nav {...variantProps(v2, "ui2-nav", V1.nav)}>
          {(role === "admin" || role === "intake" || role === "cashier_intake") && (
            <NavLink
              label="Intake"
              active={page === "intake"}
              onClick={() => onNavigate("intake")}
              v2={v2}
            />
          )}
          {(role === "admin" || role === "cashier" || role === "cashier_intake") && (
            <NavLink
              label="Checkout"
              active={page === "pos"}
              onClick={() => onNavigate("pos")}
              v2={v2}
            />
          )}
          {role === "admin" && (
            <NavLink
              label="Admin"
              active={page === "admin"}
              onClick={() => onNavigate("admin")}
              v2={v2}
            />
          )}
          {/* Documentation is available to every signed-in user. */}
          <NavLink
            label="Documentation"
            active={page === "docs"}
            onClick={() => onNavigate("docs")}
            v2={v2}
          />
        </nav>

        {/* User info + Sign Out */}
        <div {...variantProps(v2, "ui2-header-actions", V1.headerActions)}>
          <span {...variantProps(v2, "ui2-user-name", V1.userName)}>
            {decoded?.sub}
          </span>
          <span {...variantProps(v2, "ui2-role-badge", V1.roleBadge)}>
            {role}
          </span>
          <button
            onClick={() => setShowChangePw(true)}
            {...variantProps(v2, "ui2-btn-header", V1.headerButton)}
          >
            Change Password
          </button>
          <button onClick={signOut} {...variantProps(v2, "ui2-btn-header", V1.headerButton)}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Page content */}
      <main {...variantProps(v2, "ui2-main", V1.main)}>{children}</main>

      {/* Footer */}
      <footer {...variantProps(v2, "ui2-footer", V1.footer)}>
        <span>Minnesota Youth Ski League — Ski Swap POS</span>
        <span>myxc.org</span>
      </footer>

      {showChangePw && (
        <ChangePasswordModal onClose={() => setShowChangePw(false)} />
      )}
    </div>
  );
}
