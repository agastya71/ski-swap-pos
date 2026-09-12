/**
 * Tests for {@link ItemList} — covers item display, the delete flow (including the
 * sold-item guard that disables the button), per-item and bulk label printing,
 * the empty-state message when no items are present, and the inline edit panel.
 *
 * @module ItemList.test
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { server } from "../mocks/server";
import { http, HttpResponse } from "msw";
import { ItemList } from "./ItemList";
import type { Item } from "../types";

const ITEM: Item = {
  id: 1,
  intake_id: 5,
  seller_id: 1,
  code: "A001-001",
  category: "Skis",
  brand: "Rossignol",
  type: null,
  description: "Red skis",
  color: null,
  size: "160",
  uom: null,
  gender_age: null,
  year: null,
  used: true,
  price: 75,
  quantity: 1,
  remaining: 1,
  barcode_39: null,
  label_line_2: null,
  label_line_3: null,
  donate_unsold: false,
  status: "available",
  label_printed: false,
  is_deleted: false,
  vendor_item_id: null,
  created_at: "2026-04-04T10:00:00",
};
const LABEL_PRINTED: Item = { ...ITEM, label_printed: true };

/** Tests covering the ItemList component's rendering and user interaction behaviour. */
describe("ItemList", () => {
  /** Verifies that item code, category, and formatted price are all visible in the table. */
  it("shows item code, category and price", () => {
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    expect(screen.getByText("A001-001")).toBeInTheDocument();
    expect(screen.getByText("Skis")).toBeInTheDocument();
    // Price cell + Total Price cell + footer total all show $75.00.
    expect(screen.getAllByText("$75.00").length).toBe(3);
  });

  /** Verifies that an Edit button is rendered for each item row. */
  it("shows Edit button for each item", () => {
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  /** Verifies that clicking Edit opens a panel pre-filled with the item's current values. */
  it("clicking Edit opens a panel with pre-filled description and price", () => {
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByDisplayValue("Red skis")).toBeInTheDocument();
    expect(screen.getByDisplayValue("75")).toBeInTheDocument();
  });

  /** Verifies that clicking Save issues PATCH /items/:id with the updated fields and notifies the parent. */
  it("clicking Save calls PATCH /items/:id and triggers onItemsChanged", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.patch("/items/:id", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ITEM);
      }),
    );
    const onItemsChanged = vi.fn();
    render(
      <ItemList items={[ITEM]} intakeId={5} onItemsChanged={onItemsChanged} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByDisplayValue("75"), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(onItemsChanged).toHaveBeenCalledTimes(1));
    expect(capturedBody).toMatchObject({ price: 80 });
  });

  /** Verifies that clicking Cancel closes the panel without making an API call. */
  it("clicking Cancel closes the panel without calling the API", async () => {
    let patchCalled = false;
    server.use(
      http.patch("/items/:id", () => {
        patchCalled = true;
        return HttpResponse.json(ITEM);
      }),
    );
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByDisplayValue("Red skis")).not.toBeInTheDocument();
    expect(patchCalled).toBe(false);
  });

  /** Verifies that opening a second edit panel closes the first. */
  it("opening a second Edit panel closes the first", () => {
    const item2: Item = {
      ...ITEM,
      id: 2,
      code: "A001-002",
      description: "Blue boots",
      brand: "Salomon",
    };
    render(
      <ItemList items={[ITEM, item2]} intakeId={5} onItemsChanged={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /edit/i })[0]);
    expect(screen.getByDisplayValue("Red skis")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /edit/i })[1]);
    expect(screen.queryByDisplayValue("Red skis")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Blue boots")).toBeInTheDocument();
  });

  /** Verifies that clicking Delete in the edit panel calls DELETE /items/:id and notifies the parent. */
  it("Delete in edit panel calls DELETE /items/:id and triggers onItemsChanged", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.delete("/items/:id", () => new HttpResponse(null, { status: 204 })),
    );
    const onItemsChanged = vi.fn();
    render(
      <ItemList items={[ITEM]} intakeId={5} onItemsChanged={onItemsChanged} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => expect(onItemsChanged).toHaveBeenCalledTimes(1));
  });

  /** Verifies that the Delete button inside the edit panel is disabled for printed items. */
  it("Delete button is disabled in edit panel when label is printed", () => {
    render(
      <ItemList
        items={[LABEL_PRINTED]}
        intakeId={5}
        onItemsChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeDisabled();
  });

  /** Verifies a per-row Delete button is visible (tester feedback: "Not seeing a
   *  Delete button") and disabled with an explanatory tooltip when blocked. */
  it("shows a per-row Delete button, disabled with a tooltip for label-printed items", () => {
    render(
      <ItemList
        items={[LABEL_PRINTED]}
        intakeId={5}
        onItemsChanged={vi.fn()}
      />,
    );
    const rowDelete = screen.getByRole("button", { name: "Delete A001-001" });
    expect(rowDelete).toBeDisabled();
    expect(rowDelete).toHaveAttribute(
      "title",
      "Cannot delete after labels are printed",
    );
  });

  /** Verifies the per-row Delete flows through the confirm dialog to DELETE /items/:id. */
  it("per-row Delete confirms then deletes", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.delete("/items/:id", () => new HttpResponse(null, { status: 204 })),
    );
    const onItemsChanged = vi.fn();
    render(
      <ItemList items={[ITEM]} intakeId={5} onItemsChanged={onItemsChanged} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete A001-001" }));
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("A001-001"),
    );
    await waitFor(() => expect(onItemsChanged).toHaveBeenCalledTimes(1));
  });

  /** Verifies declining the per-row Delete confirmation does not delete anything. */
  it("per-row Delete does nothing when confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    server.use(
      http.delete("/items/:id", () => new HttpResponse(null, { status: 204 })),
    );
    const onItemsChanged = vi.fn();
    render(
      <ItemList items={[ITEM]} intakeId={5} onItemsChanged={onItemsChanged} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete A001-001" }));
    expect(onItemsChanged).not.toHaveBeenCalled();
  });

  /** Verifies that clicking Print All Labels (per item) issues a POST to /items/:id/label. */
  it("print all labels button (per item) calls POST /items/:id/label", async () => {
    let called = false;
    server.use(
      http.post("/items/:id/label", () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /print all labels for/i }),
    );
    await waitFor(() => expect(called).toBe(true));
  });

  /** Verifies that a specified label count issues a POST with ?copies=N. */
  it("print button with a specified count calls POST /items/:id/label?copies=N", async () => {
    let called2 = false;
    let labelUrl = "";
    server.use(
      http.post("/items/:id/label", ({ request }) => {
        called2 = true;
        labelUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/label count for/i), {
      target: { value: "3" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /print the specified number/i }),
    );
    await waitFor(() => expect(called2).toBe(true));
    expect(labelUrl).toContain("copies=3");
  });

  /** Verifies that the Print Labels for All Items button issues a POST to /intakes/:id/labels. */
  it("shows Print Labels for All Items button that calls POST /intakes/:id/labels", async () => {
    let called = false;
    server.use(
      http.post("/intakes/:id/labels", () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /print labels for all items/i }),
    );
    await waitFor(() => expect(called).toBe(true));
  });

  /** Verifies the code-as-text checkbox adds ?code_as_text=true to per-item prints. */
  it("code-as-text checkbox sends code_as_text=true on per-item prints", async () => {
    let labelUrl = "";
    server.use(
      http.post("/items/:id/label", ({ request }) => {
        labelUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/print item code as text/i));
    fireEvent.click(
      screen.getByRole("button", { name: /print all labels for/i }),
    );
    await waitFor(() => expect(labelUrl).toContain("code_as_text=true"));
    expect(labelUrl).not.toContain("copies=");
  });

  /** Verifies code-as-text combines with an explicit copies count. */
  it("code-as-text checkbox keeps ?copies=N on specified-count prints", async () => {
    let labelUrl = "";
    server.use(
      http.post("/items/:id/label", ({ request }) => {
        labelUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/print item code as text/i));
    fireEvent.change(screen.getByLabelText(/label count for/i), {
      target: { value: "3" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /print the specified number/i }),
    );
    await waitFor(() => expect(labelUrl).toContain("copies=3"));
    expect(labelUrl).toContain("code_as_text=true");
  });

  /** Verifies code-as-text applies to the bulk intake label print too. */
  it("code-as-text checkbox sends code_as_text=true on Print Labels for All Items", async () => {
    let labelsUrl = "";
    server.use(
      http.post("/intakes/:id/labels", ({ request }) => {
        labelsUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/print item code as text/i));
    fireEvent.click(
      screen.getByRole("button", { name: /print labels for all items/i }),
    );
    await waitFor(() => expect(labelsUrl).toContain("code_as_text=true"));
  });

  /** Verifies the default (unchecked) print URL has no code_as_text param. */
  it("default prints send no code_as_text param", async () => {
    let labelUrl = "";
    server.use(
      http.post("/items/:id/label", ({ request }) => {
        labelUrl = request.url;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", { name: /print all labels for/i }),
    );
    await waitFor(() => expect(labelUrl).toContain("/label"));
    expect(labelUrl).not.toContain("code_as_text");
  });

  /** Verifies that the empty-state paragraph is shown when the items array is empty. */
  it("shows empty message when no items", () => {
    render(<ItemList items={[]} intakeId={5} onItemsChanged={vi.fn()} />);
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });
});

/** Delete button is also disabled for sold items (not just printed ones). */
it("Delete button is disabled when item has been sold", () => {
  const sold: Item = { ...ITEM, status: "sold", quantity: 0 };
  render(<ItemList items={[sold]} intakeId={5} onItemsChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
  expect(screen.getByRole("button", { name: /^delete$/i })).toBeDisabled();
});

/** Quantity column shows the on-hand quantity (and the footer totals). */
it("shows the on-hand quantity column", () => {
  const multi = { ...ITEM, quantity: 5 };
  render(<ItemList items={[multi]} intakeId={5} onItemsChanged={vi.fn()} />);
  // Qty = 5, On Hand = 5, footer units = 5.
  expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(2);
  // The line Total Price and the footer sum both show 75 x 5 = $375.00.
  expect(screen.getAllByText("$375.00").length).toBe(2);
});

/** Adjusting quantity calls PATCH /items/:id/quantity with the signed delta. */
it("Adjust quantity calls PATCH /items/:id/quantity and refreshes", async () => {
  let captured: { adjustment?: number } = {};
  server.use(
    http.patch("/items/:id/quantity", async ({ request }) => {
      captured = (await request.json()) as { adjustment?: number };
      return HttpResponse.json({ ...ITEM, quantity: 8 });
    }),
  );
  const onItemsChanged = vi.fn();
  render(
    <ItemList
      items={[{ ...ITEM, quantity: 5 }]}
      intakeId={5}
      onItemsChanged={onItemsChanged}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
  fireEvent.change(screen.getByPlaceholderText(/e.g. 3 or -2/i), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("button", { name: /apply/i }));
  await waitFor(() => expect(captured.adjustment).toBe(3));
  await waitFor(() => expect(onItemsChanged).toHaveBeenCalled());
});
