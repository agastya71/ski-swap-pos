/**
 * Import failure/warning reporting — one shared banner on every import surface.
 *
 * Requirement covered here: when an import goes wrong the intake user must see
 * WHICH rows failed and WHY, the import must still complete for the rows that
 * are valid, and rows that imported but look wrong must raise a warning. All
 * three upload surfaces (per-intake import, admin seller detail, worksheet
 * banner) render the same `ImportOutcome` component so the behaviour matches.
 *
 * @module ImportOutcome.test
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "../mocks/server";
import { setToken } from "../api/client";
import { ImportOutcome } from "./ImportOutcome";
import { ImportItemsButton } from "../intake/ImportItemsButton";
import type { ImportResult } from "../types";

const ADMIN_TOKEN = "test-admin-token";

function result(over: Partial<ImportResult> = {}): ImportResult {
  return { imported: 0, skipped: 0, errors: [], ...over };
}

describe("ImportOutcome", () => {
  it("shows the imported count and no lists when everything succeeded", () => {
    render(<ImportOutcome result={result({ imported: 4 })} />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/imported 4 items/i);
    expect(
      screen.queryByRole("list", { name: /skipped rows/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: /import warnings/i }),
    ).not.toBeInTheDocument();
  });

  it("lists every skipped row with its row number and reason", () => {
    render(
      <ImportOutcome
        result={result({
          imported: 2,
          skipped: 2,
          errors: [
            { row: 3, reason: "Missing required field: Description or Price" },
            { row: 4, reason: "Invalid Price value: 'TBD'" },
          ],
        })}
      />,
    );
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/imported 2 items/i);
    expect(banner).toHaveTextContent(/skipped 2 rows/i);
    // The user is told the skipped rows were NOT imported — not merely skipped.
    expect(banner).toHaveTextContent(/not imported/i);

    const list = screen.getByRole("list", { name: /skipped rows/i });
    expect(list).toHaveTextContent("Row 3: Missing required field");
    expect(list).toHaveTextContent("Row 4: Invalid Price value");
  });

  it("renders warnings for rows that DID import without marking them as errors", () => {
    render(
      <ImportOutcome
        result={result({
          imported: 2,
          warnings: [
            "2 row(s) match items this seller already had (same description, brand, size and price) — row 2, 3. They were imported; check for a duplicate re-upload.",
          ],
        })}
      />,
    );
    const warnings = screen.getByRole("list", { name: /import warnings/i });
    expect(warnings).toHaveTextContent(/duplicate re-upload/i);
    expect(
      screen.queryByRole("list", { name: /skipped rows/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onDismiss when the × button is clicked", () => {
    const onDismiss = vi.fn();
    render(<ImportOutcome result={result({ imported: 1 })} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss import result/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("accepts a caller-supplied heading (worksheet surface names the seller)", () => {
    render(
      <ImportOutcome
        result={result({ imported: 5 })}
        heading={<span>Jane Smith (JSMI1) — 5 item(s) imported</span>}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/Jane Smith \(JSMI1\)/);
  });
});

describe("ImportItemsButton — failure detail and partial import", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setToken(null);
  });

  it("shows the backend reason when the whole file is rejected", async () => {
    setToken(ADMIN_TOKEN);
    server.use(
      http.post("/intakes/:intakeId/items/import", () =>
        HttpResponse.json(
          { detail: "Invalid or unreadable xlsx file" },
          { status: 422 },
        ),
      ),
    );
    const { container } = render(
      <ImportItemsButton intakeId={1} onImported={vi.fn()} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "items.xlsx")] },
    });
    const alert = await screen.findByRole("alert");
    // Not "Import failed: Unprocessable Entity" — the actual reason.
    expect(alert).toHaveTextContent(/invalid or unreadable xlsx file/i);
  });

  it("renders the shared banner with per-row reasons on a partial import", async () => {
    setToken(ADMIN_TOKEN);
    const onImported = vi.fn();
    server.use(
      http.post("/intakes/:intakeId/items/import", () =>
        HttpResponse.json({
          imported: 2,
          skipped: 1,
          errors: [{ row: 4, reason: "Missing required field: Brand" }],
          warnings: ["1 row(s) match items this seller already had — row 2."],
        }),
      ),
    );
    const { container } = render(
      <ImportItemsButton intakeId={1} onImported={onImported} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "items.xlsx")] },
    });

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(/imported 2 items/i);
    expect(banner).toHaveTextContent("Row 4: Missing required field: Brand");
    expect(banner).toHaveTextContent(/duplicate re-upload|match items this seller already had/i);
    // The list refreshes even though the import was partial.
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
  });
});
