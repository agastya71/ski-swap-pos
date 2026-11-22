/**
 * Root application component — mounts AuthProvider, the hash router, and
 * top-level routes mapping URL hash fragments (e.g. `#/intake`) to module pages.
 *
 * Navigation lives in the URL (`#/intake`, `#/pos`, `#/admin`, `#/docs`), so
 * the browser's Back/Forward buttons move between in-app pages, every page
 * navigated to mounts fresh, and a location can be shared/bookmarked.
 */
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { navigate, useHashRoute } from "./lib/useHashRoute";

import { IntakeModulePage } from "./intake/IntakeModulePage";
import { POSPage } from "./pos/POSPage";
import { AdminPage } from "./admin/AdminPage";
import { DocumentationPage } from "./docs/DocumentationPage";

type Page = "intake" | "pos" | "admin" | "docs";

const PAGES: Page[] = ["intake", "pos", "admin", "docs"];

/** Returns the default landing page for a given user role. */
function defaultPage(role: string): Page {
  if (role === "cashier" || role === "cashier_intake") return "pos";
  if (role === "intake") return "intake";
  return "admin";
}

/**
 * Resolves the module page for a hash fragment. Top-level hashes are exact
 * (`#/intake`, `#/pos`, ...); sub-routes like `#/admin/sellers/3` address their
 * parent module; anything unknown (including the empty hash) falls back to the
 * role's default landing page — a stale or hand-typo'd URL lands safely.
 */
function pageForHash(hash: string, role: string): Page {
  const top = hash.replace(/^\//, "").split("/")[0];
  if ((PAGES as string[]).includes(top)) return top as Page;
  return defaultPage(role);
}

/**
 * Inner application shell rendered after auth context is available.
 * Shows the login page when unauthenticated, otherwise renders the
 * role-appropriate page (driven by the URL hash) inside the shared Layout.
 *
 * The page container is keyed by the resolved module, so navigating between
 * modules (or leaving and re-entering one, e.g. via Back) always remounts it:
 * the module starts as if newly opened rather than resuming prior state.
 */
function AppInner() {
  const { decoded } = useAuth();
  const hash = useHashRoute();

  if (!decoded) return <LoginPage onLogin={() => {}} />;

  const activePage = pageForHash(hash, decoded.role);

  return (
    <Layout
      page={activePage}
      onNavigate={(p) => {
        navigate(`/${p}`);
      }}
    >
      {activePage === "intake" && (
        <ProtectedRoute roles={["admin", "intake", "cashier_intake"]}>
          <IntakeModulePage key="intake" />
        </ProtectedRoute>
      )}
      {activePage === "pos" && (
        <ProtectedRoute roles={["admin", "cashier", "cashier_intake"]}>
          <POSPage key="pos" />
        </ProtectedRoute>
      )}
      {activePage === "admin" && (
        <ProtectedRoute roles={["admin"]}>
          <AdminPage key="admin" />
        </ProtectedRoute>
      )}
      {activePage === "docs" && (
        <ProtectedRoute roles={["admin", "cashier", "intake", "cashier_intake"]}>
          <DocumentationPage key="docs" />
        </ProtectedRoute>
      )}
    </Layout>
  );
}

/**
 * Top-level component that wraps the entire app in {@link AuthProvider}
 * and renders {@link AppInner}.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
