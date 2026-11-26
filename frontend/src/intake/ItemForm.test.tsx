/**
 * Tests for {@link ItemForm} — covers required field validation, successful item submission
 * invoking onAdded, form reset after submission, and API error display.
 *
 * @module ItemForm.test
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { server } from "../mocks/server";
import { http, HttpResponse } from "msw";
import { ItemForm } from "./ItemForm";
import type { Item } from "../types";

const ITEM: Item = {
  id: 1,
  intake_id: 5,
  seller_id: 1,
  code: "A001-001",
  category: "Skis",
  brand: "Rossignol",
  type: "Alpine",
  description: "Red skis",
  color: "Red",
  size: "160",
  uom: null,
  gender_age: "Adult",
  year: 2020,
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

/** Tests covering the ItemForm component's rendering, submission, and error handling. */
describe("ItemForm", () => {
  /** Verifies that category and price fields carry the HTML required attribute. */
  it("renders category and price fields as required", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    expect(screen.getByLabelText(/category/i)).toBeRequired();
    expect(screen.getByLabelText(/price/i)).toBeRequired();
    expect(screen.getByLabelText(/brand/i)).toBeRequired();
  });

  /** #6: the Quantity field holds initial focus so staff can enter the unit
   *  count first thing — the form's natural entry point. */
  it("focuses the Quantity field on mount", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText(/qty/i));
  });

  /** #6: after a successful add the form resets and focus returns to Qty for
   *  the next item — no mouse needed between back-to-back entries. */
  it("refocuses Quantity after a successful add", async () => {
    server.use(http.post("/intakes/:id/items", () => HttpResponse.json(ITEM)));
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Skis" },
    });
    fireEvent.change(screen.getByLabelText(/brand/i), {
      target: { value: "Rossignol" },
    });
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "75" },
    });
    // Move focus somewhere else first to prove the submit refocuses it.
    (screen.getByLabelText(/description/i) as HTMLInputElement).focus();
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(/qty/i)),
    );
  });

  /** Verifies that a successful submit calls onAdded with the item object returned by the API. */
  it("calls onAdded with new item after successful submit", async () => {
    server.use(http.post("/intakes/:id/items", () => HttpResponse.json(ITEM)));
    const onAdded = vi.fn();
    render(<ItemForm intakeId={5} onAdded={onAdded} />);
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Skis" },
    });
    fireEvent.change(screen.getByLabelText(/brand/i), {
      target: { value: "Rossignol" },
    });
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "75" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(ITEM));
  });

  /** Verifies that the category select resets to its empty placeholder after a successful submit. */
  it("resets form fields after successful submit", async () => {
    server.use(http.post("/intakes/:id/items", () => HttpResponse.json(ITEM)));
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Skis" },
    });
    fireEvent.change(screen.getByLabelText(/brand/i), {
      target: { value: "Rossignol" },
    });
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "75" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/category/i) as HTMLSelectElement).value,
      ).toBe(""),
    );
  });

  /** Verifies that an API error response causes an alert with the error detail to appear. */
  it("shows error on API failure", async () => {
    server.use(
      http.post("/intakes/:id/items", () =>
        HttpResponse.json(
          { detail: "Labels already printed" },
          { status: 409 },
        ),
      ),
    );
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Skis" },
    });
    fireEvent.change(screen.getByLabelText(/brand/i), {
      target: { value: "Rossignol" },
    });
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "75" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /labels already printed/i,
      ),
    );
  });

  /** Verifies the type field is a <select> element with ITEM_TYPES options. */
  it("renders type field as a select with equipment type options", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    const typeSelect = screen.getByLabelText(/^type$/i);
    expect(typeSelect.tagName).toBe("SELECT");
    expect(typeSelect).toContainElement(
      screen.getAllByRole("option", { name: "Alpine Ski" })[0],
    );
    // Check for "Other" by filtering to only the type select's options
    const typeOptions = (typeSelect as HTMLSelectElement).querySelectorAll(
      "option",
    );
    expect(
      Array.from(typeOptions).some((opt) => opt.textContent === "Other"),
    ).toBe(true);
  });

  /** Verifies size is always a free-text input, whatever the type. */
  it("renders size as a text input for a type that used to have a fixed list", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^type$/i), {
      target: { value: "Alpine Ski" },
    });
    const sizeEl = screen.getByLabelText(/^size$/i);
    expect(sizeEl.tagName).toBe("INPUT");
    // No `type` attribute — an <input> defaults to text.
    // No dropdown anywhere in the form: the size scale varies per item.
    expect(screen.queryByRole("combobox", { name: /^size$/i })).toBeNull();
  });

  /** Free text accepts whatever is printed on the item (cm, Mondo, alpha). */
  it("accepts any typed size value", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^type$/i), {
      target: { value: "Ski Boot" },
    });
    const sizeEl = screen.getByLabelText(/^size$/i) as HTMLInputElement;
    fireEvent.change(sizeEl, { target: { value: "27.5" } });
    expect(sizeEl.value).toBe("27.5");
    fireEvent.change(sizeEl, { target: { value: "170cm" } });
    expect(sizeEl.value).toBe("170cm");
  });

  /** Verifies that changing type resets size to empty. */
  it("resets size to empty when type changes", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^type$/i), {
      target: { value: "Alpine Ski" },
    });
    fireEvent.change(screen.getByLabelText(/^size$/i), {
      target: { value: "160cm" },
    });
    expect((screen.getByLabelText(/^size$/i) as HTMLInputElement).value).toBe(
      "160cm",
    );
    fireEvent.change(screen.getByLabelText(/^type$/i), {
      target: { value: "Helmet" },
    });
    expect((screen.getByLabelText(/^size$/i) as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("description input has maxLength of 99", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    expect(screen.getByLabelText(/description/i)).toHaveAttribute(
      "maxlength",
      "99",
    );
  });

  /** Verifies the quantity field renders and defaults to 1, and that its value
   *  is included in the addItem payload. */
  it("submits quantity (default 1, user-set value included)", async () => {
    let captured: { quantity?: number } | null = null;
    server.use(
      http.post("/intakes/:id/items", async ({ request }) => {
        captured = (await request.json()) as { quantity?: number };
        return HttpResponse.json(ITEM);
      }),
    );
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Skis" },
    });
    fireEvent.change(screen.getByLabelText(/brand/i), {
      target: { value: "Rossignol" },
    });
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText(/qty/i), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.quantity).toBe(3);
  });

  /** Verifies the price field label advertises whole dollars and rounds UP
   *  entered cents to the nearest dollar on submit, with a visible note. */
  it("rounds price up to whole dollars with a live rounding note", async () => {
    let captured: { price?: number } | null = null;
    server.use(
      http.post("/intakes/:id/items", async ({ request }) => {
        captured = (await request.json()) as { price?: number };
        return HttpResponse.json(ITEM);
      }),
    );
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    expect(screen.getByText(/whole dollars/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "24.5" },
    });
    // Live note appears while typing cents...
    expect(screen.getByText(/rounds up to \$25/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Skis" },
    });
    fireEvent.change(screen.getByLabelText(/brand/i), {
      target: { value: "Rossignol" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    // ...and the ceiling price lands in the payload.
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.price).toBe(25);
    // Successful submit resets the form, clearing the note.
    expect(screen.queryByText(/rounds up to/i)).not.toBeInTheDocument();
  });

  /** Verifies the rounding note clears when the user re-enters a whole price. */
  it("clears the rounding note when the price is a whole dollar amount", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "24.5" },
    });
    expect(screen.getByText(/rounds up to \$25/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/price/i), {
      target: { value: "25" },
    });
    expect(screen.queryByText(/rounds up to/i)).not.toBeInTheDocument();
  });

  /** Verifies Type options narrow to the selected category ("Types are
   *  dependent on Category"): Skis shows Classic/Skate/Combi but not Jacket. */
  it("narrows Type options to the selected category", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    const typeSelect = screen.getByLabelText(/^type$/i) as HTMLSelectElement;
    // No category chosen: full list (includes Jacket).
    expect(
      Array.from(typeSelect.options).some((o) => o.value === "Jacket"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Skis" },
    });
    const options = Array.from(typeSelect.options).map((o) => o.value);
    expect(options).toContain("Classic");
    expect(options).toContain("Skate");
    expect(options).toContain("Combi");
    expect(options).toContain("Other");
    expect(options).not.toContain("Alpine Ski");
    expect(options).not.toContain("Nordic/XC Ski");
    expect(options).not.toContain("Jacket");
    expect(options).not.toContain("Ski Boot");
  });

  /** Verifies an unmapped category (Bindings) falls back to the full type list. */
  it("falls back to the full type list for categories without a mapping", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Bindings" },
    });
    const typeSelect = screen.getByLabelText(/^type$/i) as HTMLSelectElement;
    const options = Array.from(typeSelect.options).map((o) => o.value);
    expect(options).toContain("Jacket");
    expect(options).toContain("Ski Boot");
  });

  /** Verifies changing the category clears a previously chosen type. */
  it("resets type when the category changes", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Skis" },
    });
    fireEvent.change(screen.getByLabelText(/^type$/i), {
      target: { value: "Combi" },
    });
    expect((screen.getByLabelText(/^type$/i) as HTMLSelectElement).value).toBe(
      "Combi",
    );
    fireEvent.change(screen.getByLabelText(/category/i), {
      target: { value: "Clothing" },
    });
    expect((screen.getByLabelText(/^type$/i) as HTMLSelectElement).value).toBe(
      "",
    );
  });

  it("shows character counter for description field", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    expect(screen.getByText("0 / 99")).toBeInTheDocument();
  });

  it("counter updates as user types in description", () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Red skis" },
    });
    expect(screen.getByText("8 / 99")).toBeInTheDocument();
  });
});

/** Typing a brand fetches existing-brand suggestions into the datalist. */
it("suggests existing brands via the typeahead datalist", async () => {
  server.use(
    http.get("/items/brands", () =>
      HttpResponse.json(["Rossignol", "Rottefella"]),
    ),
  );
  render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/brand/i), {
    target: { value: "Ro" },
  });
  await waitFor(() => {
    const opts = document.querySelectorAll("#brand-suggestions option");
    expect(Array.from(opts).map((o) => o.getAttribute("value"))).toEqual([
      "Rossignol",
      "Rottefella",
    ]);
  });
});

/** defaultDonateUnsold pre-fills the donate-unsold checkbox (inherits intake/seller preference). */
it("pre-fills the donate-unsold checkbox from defaultDonateUnsold", () => {
  render(
    <ItemForm intakeId={5} onAdded={vi.fn()} defaultDonateUnsold={true} />,
  );
  const checkbox = screen.getByRole("checkbox", {
    name: /^donate\?/i,
  }) as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
});

it("defaults the donate-unsold checkbox to false when defaultDonateUnsold is not provided", () => {
  render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
  const checkbox = screen.getByRole("checkbox", {
    name: /^donate\?/i,
  }) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
});

/** Text-type inputs (Brand/Description/Size) must carry type="text" so the
 *  global input[type="text"] border styling applies — bare inputs fall back
 *  to the browser's native inset border (user-reported intake mismatch). */
it("gives Brand, Description and Size inputs type=text", () => {
  render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
  for (const label of [/brand/i, /description/i, /size/i]) {
    const el = screen.getByLabelText(label) as HTMLInputElement;
    expect(el.tagName).toBe("INPUT");
    expect(el.type).toBe("text");
  }
});

/** Without onCancel there is no Cancel button (existing callers unchanged). */
it("hides Cancel when no onCancel is provided", () => {
  render(<ItemForm intakeId={5} onAdded={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
});

/** With onCancel the footer renders Cancel next to Add Item and clicking it
 *  calls onCancel without submitting or touching the API. */
it("renders Cancel next to Add Item and calls onCancel on click", () => {
  const onCancel = vi.fn();
  render(<ItemForm intakeId={5} onAdded={vi.fn()} onCancel={onCancel} />);
  const footerButtons = screen
    .getAllByRole("button")
    .filter((b) => /add item|^cancel$/i.test(b.textContent || ""));
  expect(footerButtons.map((b) => b.textContent?.trim())).toEqual([
    "Add Item",
    "Cancel",
  ]);
  fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
