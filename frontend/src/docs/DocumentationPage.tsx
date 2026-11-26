/**
 * Documentation page — top-level module page with links to the user guide
 * files served by the backend at /docs/{filename} (user-guide.pdf and
 * user-guide.md). Available to every signed-in role.
 *
 * @module DocumentationPage
 */
import { useUiVariant } from "../lib/uiVariant";
import { DOCS_PAGE, variantProps } from "../uiStyles";

export function DocumentationPage() {
  const v2 = useUiVariant() === "v2";

  return (
    <div>
      <div {...variantProps(v2, "ui2-docs-panel", DOCS_PAGE.panel)}>
        <strong>Documentation</strong>
        <div {...variantProps(v2, "ui2-docs-blurb", DOCS_PAGE.blurb)}>
          Guides and reference material for the Ski Swap POS (opens in a new
          tab).
        </div>
        <div {...variantProps(v2, "ui2-docs-links", DOCS_PAGE.links)}>
          <a
            href="/docs/user-guide.pdf"
            target="_blank"
            rel="noreferrer"
            {...variantProps(v2, "ui2-docs-link", DOCS_PAGE.link)}
          >
            User Guide (PDF)
          </a>
          <a
            href="/docs/user-guide.md"
            target="_blank"
            rel="noreferrer"
            {...variantProps(v2, "ui2-docs-link", DOCS_PAGE.link)}
          >
            User Guide (Markdown)
          </a>
        </div>
      </div>
    </div>
  );
}
