import { useState, type FormEvent } from "react";
import { BUTTON_STYLE } from "../lib/buttons";
import { createSeller } from "../api/sellers";
import { US_STATES } from "../lib/usStates";
import { formatPhone, isUsStateCode } from "../lib/format";
import type { Seller } from "../types";

/**
 * New seller registration form.
 *
 * Validation contract (mirrors the backend SellerCreate validators):
 * - Individual (is_vendor=false): first name AND last name required; company optional.
 * - Vendor (is_vendor=true): company required; first/last name optional (a vendor is
 *   a business, not a person).
 * - At least one of phone or email is required.
 * - address, city, state (2-char US dropdown), and zip (US 5-digit) are required.
 *
 * The form performs a client-side phone-or-email check so the user gets immediate
 * feedback; remaining field-level validation relies on HTML required attributes and
 * the backend's 422 responses (surfaced in the alert region).
 */
export function SellerForm({
  onCreated,
  onCancel,
}: {
  onCreated: (seller: Seller) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState(""); // #9: auto-formats (NNN) NNN-NNNN
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState(""); // #10: free-typed 2-letter US code
  const [zip, setZip] = useState("");
  const [isVendor, setIsVendor] = useState(false);
  const [donateUnsoldDefault, setDonateUnsoldDefault] = useState(false);
  const [donateProceedsDefault, setDonateProceedsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side cross-field check: at least one contact channel is required.
    if (!phone.trim() && !email.trim()) {
      setError("At least one of phone or email is required");
      return;
    }
    // #10: accept any typing but gate the submit on a real US code so the
    // staff member gets guidance here instead of a 422 round-trip.
    const stateCode = state.trim().toUpperCase();
    if (!isUsStateCode(stateCode)) {
      setError("State must be a 2-letter US state code (e.g. MN)");
      return;
    }

    setLoading(true);
    try {
      const seller = await createSeller({
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        company: company || undefined,
        phone: phone.replace(/\D/g, "") || undefined,
        email: email || undefined,
        address,
        city,
        state: stateCode,
        zip,
        is_vendor: isVendor,
        donate_unsold_default: donateUnsoldDefault,
        donate_proceeds_default: donateProceedsDefault,
      });
      onCreated(seller);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to register seller",
      );
    } finally {
      setLoading(false);
    }
  }

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    required = false,
  ) => (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={{ display: "block", marginBottom: 3 }}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        style={{ width: "100%", padding: 6, boxSizing: "border-box" }}
      />
    </div>
  );

  // Name fields' required-ness depends on vendor flag.
  const nameRequired = !isVendor;

  return (
    <form onSubmit={handleSubmit}>
      <h3>Register New Seller</h3>
      {field("firstName", "First Name", firstName, setFirstName, nameRequired)}
      {field("lastName", "Last Name", lastName, setLastName, nameRequired)}
      {field(
        "company",
        isVendor ? "Company" : "Company (optional)",
        company,
        setCompany,
        isVendor,
      )}
      {field("phone", "Phone (10 digits)", phone, (v) => setPhone(formatPhone(v)))}
      {field("email", "Email", email, setEmail)}
      <div style={{ marginBottom: 10 }}>
        <label>
          <input
            type="checkbox"
            checked={isVendor}
            onChange={(e) => setIsVendor(e.target.checked)}
          />{" "}
          Vendor (not individual consignor)
        </label>
      </div>
      <fieldset
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 4,
          padding: "10px 12px",
          marginBottom: 10,
        }}
      >
        <legend style={{ fontSize: 13, color: "#64748b" }}>Address</legend>
        {field("address", "Street Address", address, setAddress, true)}
        {field("city", "City", city, setCity, true)}
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="state" style={{ display: "block", marginBottom: 3 }}>
            State
          </label>
          {/* #10: type-able 2-letter code with datalist suggestions, instead
              of a locked dropdown — typing "mn" is enough. */}
          <input
            id="state"
            list="state-options"
            value={state}
            maxLength={2}
            placeholder="MN"
            required
            onChange={(e) => setState(e.target.value.toUpperCase())}
            style={{ width: "100%", padding: 6, boxSizing: "border-box" }}
          />
          <datalist id="state-options">
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </datalist>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="zip" style={{ display: "block", marginBottom: 3 }}>
            ZIP
          </label>
          <input
            id="zip"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            required
            pattern="\d{5}"
            maxLength={5}
            inputMode="numeric"
            style={{ width: "100%", padding: 6, boxSizing: "border-box" }}
          />
        </div>
      </fieldset>
      <fieldset
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 4,
          padding: "10px 12px",
          marginBottom: 10,
        }}
      >
        <legend style={{ fontSize: 13, color: "#64748b" }}>
          Donation defaults (applied to new intakes)
        </legend>
        <div style={{ marginBottom: 6 }}>
          <label>
            <input
              type="checkbox"
              id="donateProceedsDefault"
              checked={donateProceedsDefault}
              onChange={(e) => setDonateProceedsDefault(e.target.checked)}
            />{" "}
            Donate proceeds by default (MYSL keeps 100% of sale price)
          </label>
        </div>
        <div style={{ marginBottom: 6 }}>
          <label>
            <input
              type="checkbox"
              id="donateUnsoldDefault"
              checked={donateUnsoldDefault}
              onChange={(e) => setDonateUnsoldDefault(e.target.checked)}
            />{" "}
            Donate unsold items by default
          </label>
        </div>
      </fieldset>
      {error && (
        <div role="alert" style={{ color: "red", marginBottom: 10 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={loading} style={BUTTON_STYLE}>
          Register
        </button>
        <button type="button" onClick={onCancel} style={BUTTON_STYLE}>
          Cancel
        </button>
      </div>
    </form>
  );
}
