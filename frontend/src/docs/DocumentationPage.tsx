/**
 * Documentation page — top-level module page with links to the user guide
 * files served by the backend at /docs/{filename} (user-guide.pdf and
 * user-guide.md). Available to every signed-in role.
 *
 * @module DocumentationPage
 */
export function DocumentationPage() {
  return (
    <div>
      <div
        style={{
          marginTop: 24,
          padding: 12,
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          background: "#f8fafc",
          fontSize: 13,
        }}
      >
        <strong>Documentation</strong>
        <div style={{ marginTop: 4, color: "#475569" }}>
          Guides and reference material for the Ski Swap POS (opens in a new
          tab).
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 16 }}>
          <a
            href="/docs/user-guide.pdf"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#1a237e" }}
          >
            User Guide (PDF)
          </a>
          <a
            href="/docs/user-guide.md"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#1a237e" }}
          >
            User Guide (Markdown)
          </a>
        </div>
      </div>
    </div>
  );
}
