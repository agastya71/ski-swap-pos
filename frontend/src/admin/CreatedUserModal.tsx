/**
 * Modal shown after a new user is created, displaying the generated/default
 * password so the admin can hand it to the user. The password is shown once
 * here (the API never returns it afterwards). Dismiss closes the modal.
 *
 * @module CreatedUserModal
 */
import { useState } from "react";
import { useUiVariant } from "../lib/uiVariant";
import { CREATED_USER, variantProps } from "./adminStyles";

/**
 * @param props.username - The newly created user's login name.
 * @param props.password - The plaintext password used at creation (to show once).
 * @param props.onClose - Callback invoked when the modal is dismissed.
 */
export function CreatedUserModal({
  username,
  password,
  onClose,
}: {
  username: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"user" | "pw" | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const v2 = useUiVariant() === "v2";

  /** Copy to the clipboard with a fallback for non-secure contexts where the
   *  async Clipboard API is unavailable. Surfaces a visible error instead of
   *  failing silently. */
  async function copy(label: "user" | "pw", text: string) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Fallback: hidden textarea + execCommand for older/secure-less contexts.
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(label);
      setCopyError(null);
    } else {
      setCopied(null);
      setCopyError("Copy failed — select the text and copy manually.");
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`Created user ${username}`}
      {...variantProps(v2, "ui2-modal-backdrop", CREATED_USER.backdrop)}
    >
      <div {...variantProps(v2, "ui2-modal-panel", CREATED_USER.panel)}>
        <h3 {...variantProps(v2, "ui2-modal-title", CREATED_USER.title)}>
          User Created
        </h3>
        <p {...variantProps(v2, "ui2-modal-hint", CREATED_USER.hint)}>
          Share these credentials with the user. The password is shown only this
          once.
        </p>
        <div {...variantProps(v2, "ui2-modal-row", CREATED_USER.row)}>
          <span {...variantProps(v2, "ui2-modal-row-label", CREATED_USER.rowLabel)}>
            Username
          </span>
          <div {...variantProps(v2, "ui2-modal-value", CREATED_USER.valueBox)}>
            {username}
          </div>
          <button type="button" onClick={() => copy("user", username)}>
            {copied === "user" ? "Copied" : "Copy"}
          </button>
        </div>
        <div {...variantProps(v2, "ui2-modal-row", CREATED_USER.row)}>
          <span {...variantProps(v2, "ui2-modal-row-label", CREATED_USER.rowLabel)}>
            Password
          </span>
          <div {...variantProps(v2, "ui2-modal-value", CREATED_USER.valueBox)}>
            {password}
          </div>
          <button type="button" onClick={() => copy("pw", password)}>
            {copied === "pw" ? "Copied" : "Copy"}
          </button>
        </div>
        {copyError && (
          <div
            role="alert"
            {...variantProps(v2, "ui2-modal-error", CREATED_USER.error)}
          >
            {copyError}
          </div>
        )}
        <div {...variantProps(v2, "ui2-modal-footer", CREATED_USER.footer)}>
          <button type="button" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
