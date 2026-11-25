/**
 * Intake module root — manages the multi-step seller intake workflow:
 * seller search → seller registration → intake selection → intake creation → item entry.
 * All step state is lifted here; child components are pure presentational forms.
 *
 * @module IntakePage
 */
import { useState, useCallback } from "react";
import { BUTTON_STYLE } from "../lib/buttons";
import { getIntake, getSellerIntakes } from "../api/intakes";
import { SellerSearch } from "./SellerSearch";
import { SellerForm } from "./SellerForm";
import { IntakeForm } from "./IntakeForm";
import { ItemForm } from "./ItemForm";
import { ItemList } from "./ItemList";
import { sellerDisplayName, sellerTypeLabel } from "../lib/sellerDisplay";
import { ImportItemsButton } from "./ImportItemsButton";
import { INTAKE_PAGE, variantProps, v1Only, v2Only } from "./intakeStyles";
import { TableScroll } from "../components/ui/primitives";
import { useUiVariant } from "../lib/uiVariant";
import type { Seller, Intake, Item } from "../types";

type Step = "search" | "register" | "select-intake" | "intake" | "items";

/**
 * Navigation breadcrumb displayed at the top of the intake workflow.
 * Renders the current position as plain text and earlier steps as clickable links.
 *
 * @param props.step - The currently active workflow step.
 * @param props.seller - The selected seller, or null if none has been chosen yet.
 * @param props.intake - The active intake session, or null before one is created or resumed.
 * @param props.onGoToSearch - Callback invoked when the user clicks the root "Intake" link.
 * @param props.onGoToSelectIntake - Callback invoked when the user clicks the seller name link.
 * @param props.v2 - Whether the v2 styling layer is active.
 */
function Breadcrumb({
  step,
  seller,
  intake,
  onGoToSearch,
  onGoToSelectIntake,
  v2,
}: {
  step: Step;
  seller: Seller | null;
  intake: Intake | null;
  onGoToSearch: () => void;
  onGoToSelectIntake: () => void;
  v2: boolean;
}) {
  const sep = (
    <span {...variantProps(v2, "ui2-intakepage-crumb-sep", INTAKE_PAGE.crumbSep)}>
      &rsaquo;
    </span>
  );

  return (
    <nav
      aria-label="breadcrumb"
      {...variantProps(v2, "ui2-intakepage-crumbs", INTAKE_PAGE.breadcrumb)}
    >
      {step === "search" ? (
        <span
          {...variantProps(
            v2,
            "ui2-intakepage-crumb-current",
            INTAKE_PAGE.crumbCurrent,
          )}
        >
          Intake
        </span>
      ) : (
        <button
          {...v1Only(v2, INTAKE_PAGE.crumbLink)}
          {...v2Only(v2, "ui2-intakepage-crumb-link")}
          onClick={onGoToSearch}
        >
          Intake
        </button>
      )}

      {step === "register" && (
        <>
          {sep}
          <span {...variantProps(v2, "ui2-intakepage-crumb-text", INTAKE_PAGE.crumbText)}>
            Register New Seller
          </span>
        </>
      )}

      {seller &&
        (step === "select-intake" || step === "intake" || step === "items") && (
          <>
            {sep}
            {step === "intake" || step === "items" ? (
              <button
                {...v1Only(v2, INTAKE_PAGE.crumbLink)}
                {...v2Only(v2, "ui2-intakepage-crumb-link")}
                onClick={onGoToSelectIntake}
              >
                {sellerDisplayName(seller)} ({seller.code}) ·{" "}
                {sellerTypeLabel(seller)}
              </button>
            ) : (
              <span
                {...variantProps(
                  v2,
                  "ui2-intakepage-crumb-text",
                  INTAKE_PAGE.crumbText,
                )}
              >
                {sellerDisplayName(seller)} ({seller.code}) ·{" "}
                {sellerTypeLabel(seller)}
              </span>
            )}
          </>
        )}

      {step === "intake" && (
        <>
          {sep}
          <span {...variantProps(v2, "ui2-intakepage-crumb-text", INTAKE_PAGE.crumbText)}>
            New Intake
          </span>
        </>
      )}
      {step === "items" && intake && (
        <>
          {sep}
          <span {...variantProps(v2, "ui2-intakepage-crumb-text", INTAKE_PAGE.crumbText)}>
            Intake #{intake.id}
          </span>
        </>
      )}
    </nav>
  );
}

/**
 * Previous-intakes table shown on the select-intake step.
 *
 * Extracted from `IntakePage` so each per-cell v1/v2 style decision stays in one
 * place instead of multiplying the page's cyclomatic complexity.
 *
 * Uses the stacked responsive mode because the rows are short, read-mostly
 * values and the table is read on a phone at the intake desk.
 *
 * @param props.intakes - Existing intakes for the selected seller.
 * @param props.onContinue - Opens an existing intake for adding more items.
 * @param props.v2 - Whether the v2 styling layer is active.
 */
function PreviousIntakes({
  intakes,
  onContinue,
  v2,
}: {
  intakes: Intake[];
  onContinue: (intakeId: number) => void;
  v2: boolean;
}) {
  return (
    <TableScroll stack>
      <table
        {...variantProps(v2, "ui2-intakepage-table", INTAKE_PAGE.table)}
        data-stack={v2 ? "" : undefined}
      >
        <thead>
          <tr style={v2 ? undefined : INTAKE_PAGE.headRow}>
            {[
              "Intake #",
              "Date",
              "Intake by",
              "Donate Unsold",
              "Donate Proceeds",
            ].map((label) => (
              <th
                key={label}
                data-label={label}
                style={v2 ? undefined : INTAKE_PAGE.th}
              >
                {label}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {intakes.map((i) => (
            <tr key={i.id} style={v2 ? undefined : INTAKE_PAGE.bodyRow}>
              <td data-label="Intake #" style={v2 ? undefined : INTAKE_PAGE.cell}>
                #{i.id}
              </td>
              <td data-label="Date" style={v2 ? undefined : INTAKE_PAGE.cell}>
                {i.date_entered}
              </td>
              <td data-label="Intake by" style={v2 ? undefined : INTAKE_PAGE.cell}>
                {i.created_by ?? "—"}
              </td>
              <td
                data-label="Donate Unsold"
                style={v2 ? undefined : INTAKE_PAGE.cell}
              >
                {i.donate_unsold ? "Yes" : "No"}
              </td>
              <td
                data-label="Donate Proceeds"
                style={v2 ? undefined : INTAKE_PAGE.cell}
              >
                {i.donate_proceeds ? "Yes" : "No"}
              </td>
              <td style={v2 ? undefined : INTAKE_PAGE.cell}>
                <button
                  onClick={() => onContinue(i.id)}
                  {...v1Only(v2, BUTTON_STYLE)}
                  {...v2Only(v2, "ui2-btn ui2-btn--secondary")}
                >
                  Continue
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

/**
 * Root page component for the intake module.
 * Manages a five-step state machine (search → register → select-intake → intake → items)
 * and renders the appropriate child component for each step.
 */
export function IntakePage() {
  const v2 = useUiVariant() === "v2";
  const [step, setStep] = useState<Step>("search");
  const [seller, setSeller] = useState<Seller | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [sellerIntakes, setSellerIntakes] = useState<Intake[]>([]);
  const [loadingIntakes, setLoadingIntakes] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  /** Re-fetches the item list for the current intake from the API and updates local state. */
  const refreshItems = useCallback(async () => {
    if (!intake) return;
    const fresh = await getIntake(intake.id);
    setItems(fresh.items);
  }, [intake]);

  /** Loads all existing intakes for the given seller and advances to the select-intake step. */
  async function goToSelectIntake(s: Seller) {
    setSeller(s);
    setStep("select-intake");
    setLoadingIntakes(true);
    setPickError(null);
    try {
      const intakes = await getSellerIntakes(s.id);
      setSellerIntakes(intakes);
    } catch {
      setSellerIntakes([]);
    } finally {
      setLoadingIntakes(false);
    }
  }

  /** Handles a seller chosen from the search results by advancing to intake selection. */
  function handleSellerSelected(s: Seller) {
    goToSelectIntake(s);
  }

  /** Handles a newly registered seller by advancing to intake selection. */
  function handleSellerCreated(s: Seller) {
    goToSelectIntake(s);
  }

  /** Loads the chosen existing intake and advances to the item-entry step. */
  async function handlePickExistingIntake(intakeId: number) {
    setPickError(null);
    try {
      const full = await getIntake(intakeId);
      setIntake(full);
      setItems(full.items);
      setStep("items");
    } catch {
      setPickError("Failed to load intake. Please try again.");
    }
  }

  /** Handles a newly created intake by storing it and advancing to the item-entry step. */
  function handleIntakeCreated(i: Intake) {
    setIntake(i);
    setItems([]);
    setStep("items");
    getIntake(i.id)
      .then((full) => setItems(full.items))
      .catch(() => {});
  }

  /** Resets all state and returns to the initial seller-search step. */
  function handleGoToSearch() {
    setSeller(null);
    setIntake(null);
    setItems([]);
    setSellerIntakes([]);
    setPickError(null);
    setStep("search");
  }

  /** Returns to the select-intake step for the current seller, or to search if no seller is set. */
  function handleGoToSelectIntake() {
    if (!seller) {
      handleGoToSearch();
      return;
    }
    setIntake(null);
    setItems([]);
    goToSelectIntake(seller);
  }

  /** Appends a newly added item to the local item list without a full re-fetch. */
  function handleItemAdded(item: Item) {
    setItems((prev) => [...prev, item]);
  }

  return (
    <div {...variantProps(v2, "ui2-intakepage", INTAKE_PAGE.root)}>
      <h2 {...v1Only(v2, INTAKE_PAGE.heading)}>Intake</h2>
      <Breadcrumb
        step={step}
        seller={seller}
        intake={intake}
        onGoToSearch={handleGoToSearch}
        onGoToSelectIntake={handleGoToSelectIntake}
        v2={v2}
      />

      {step === "search" && (
        <SellerSearch
          onSelect={handleSellerSelected}
          onCreateNew={() => setStep("register")}
        />
      )}

      {step === "register" && (
        <SellerForm
          onCreated={handleSellerCreated}
          onCancel={() => setStep("search")}
        />
      )}

      {step === "select-intake" && seller && (
        <div>
          <h3 {...v1Only(v2, INTAKE_PAGE.sellerHeading)}>
            {seller.first_name} {seller.last_name}
            <span {...variantProps(v2, "ui2-intakepage-seller-code", INTAKE_PAGE.sellerCode)}>
              ({seller.code})
            </span>
          </h3>
          {pickError && (
            <div role="alert" {...variantProps(v2, "ui2-items-error", INTAKE_PAGE.errorLine)}>
              {pickError}
            </div>
          )}
          {loadingIntakes ? (
            <p>Loading previous intakes…</p>
          ) : sellerIntakes.length > 0 ? (
            <>
              <p {...variantProps(v2, "ui2-intakepage-previous", INTAKE_PAGE.previousNote)}>
                Previous intakes — click Continue to add more items:
              </p>
              <PreviousIntakes
                intakes={sellerIntakes}
                v2={v2}
                onContinue={handlePickExistingIntake}
              />
            </>
          ) : (
            <p {...variantProps(v2, "ui2-intakepage-empty", INTAKE_PAGE.empty)}>
              No previous intakes for this seller.
            </p>
          )}
          <button
            onClick={() => setStep("intake")}
            {...v1Only(v2, BUTTON_STYLE)}
            {...v2Only(v2, "ui2-btn ui2-btn--secondary")}
          >
            + New Intake
          </button>
        </div>
      )}

      {step === "intake" && seller && (
        <IntakeForm seller={seller} onCreated={handleIntakeCreated} />
      )}

      {step === "items" && intake && (
        <div>
          <p {...variantProps(v2, "ui2-intakepage-items-meta", INTAKE_PAGE.itemsMeta)}>
            Intake #{intake.id} · recorded by{" "}
            <strong>{intake.created_by ?? "—"}</strong>
          </p>
          <ItemForm
            intakeId={intake.id}
            onAdded={handleItemAdded}
            defaultDonateUnsold={intake.donate_unsold}
          />
          <div {...variantProps(v2, "ui2-intakepage-import", INTAKE_PAGE.importWrap)}>
            <ImportItemsButton
              intakeId={intake.id}
              vendor={seller?.is_vendor ?? false}
              onImported={() => refreshItems()}
            />
          </div>
          <hr {...variantProps(v2, "ui2-intakepage-divider", INTAKE_PAGE.divider)} />
          <ItemList
            items={items}
            intakeId={intake.id}
            onItemsChanged={refreshItems}
          />
        </div>
      )}
    </div>
  );
}
