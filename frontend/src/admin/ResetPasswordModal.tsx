/**
 * Modal form for an admin to reset a user's password. Enforces the complexity
 * policy (client preview + server 422). The admin does not need the user's
 * current password.
 *
 * @module ResetPasswordModal
 */
import { useState, type FormEvent } from "react";
import { useUiVariant } from "../lib/uiVariant";
import { RESET_PASSWORD, v1Only, v2Only, variantProps } from "./adminStyles";
import { resetUserPassword } from "../api/users";
import { generatePassword } from "../api/auth";
import { validatePassword, PASSWORD_MIN_LENGTH } from "../lib/passwordPolicy";
import type { User } from "../types";

/**
 * @param props.user - The user whose password is being reset.
 * @param props.onClose - Callback invoked on dismiss or success.
 */
export function ResetPasswordModal({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const v2 = useUiVariant() === "v2";
  const [loading, setLoading] = useState(false);

  const policy = validatePassword(newPassword);
  const confirmMismatch = confirm.length > 0 && newPassword !== confirm;

  /** Prefill both fields with a compliant suggested password; the admin can
   *  accept it as-is or edit before submitting. */
  async function fillSuggested() {
    try {
      const pw = await generatePassword();
      setNewPassword(pw);
      setConfirm(pw);
    } catch {
      // ignore — admin can still type a password manually
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!policy.ok) {
      setError("New password does not meet the requirements.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Password and confirmation do not match.");
      return;
    }
    setLoading(true);
    try {
      await resetUserPassword(user.id, newPassword);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`Reset password for ${user.username}`}
      {...variantProps(v2, "ui2-modal-backdrop", RESET_PASSWORD.backdrop)}
    >
      <form
        onSubmit={handleSubmit}
        {...variantProps(v2, "ui2-modal-panel", RESET_PASSWORD.panel)}
      >
        <h3 {...variantProps(v2, "ui2-modal-title", RESET_PASSWORD.title)}>
          Reset Password — {user.username}
        </h3>
        <div {...variantProps(v2, "ui2-modal-field", RESET_PASSWORD.field)}>
          <label htmlFor="resetNewPassword">New Password</label>
          <div
            {...variantProps(
              v2,
              "ui2-modal-password-row",
              RESET_PASSWORD.passwordRow,
            )}
          >
            <input
              id="resetNewPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
            />
            <button
              type="button"
              onClick={fillSuggested}
              title="Suggest a compliant password"
                {...v2Only(v2, "ui2-btn ui2-btn--secondary")}>
              Suggest
            </button>
          </div>
        </div>
        <div {...variantProps(v2, "ui2-modal-field", RESET_PASSWORD.field)}>
          <label htmlFor="resetConfirmPassword">Confirm New Password</label>
          <input
            id="resetConfirmPassword"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {confirmMismatch && (
            <div {...variantProps(v2, "ui2-modal-mismatch", RESET_PASSWORD.mismatch)}>
              Passwords do not match.
            </div>
          )}
        </div>
        <ul {...variantProps(v2, "ui2-modal-policy", RESET_PASSWORD.policyList)}>
          {policy.errors.map((req) => (
            <li
              key={req}
              data-met={v2 ? "false" : undefined}
              {...v1Only(v2, RESET_PASSWORD.unmet)}
            >
              {req}
            </li>
          ))}
          {policy.ok && newPassword.length > 0 && (
            <li
              data-met={v2 ? "true" : undefined}
              {...v1Only(v2, RESET_PASSWORD.met)}
            >
              Password meets all requirements.
            </li>
          )}
        </ul>
        {error && (
          <div
            role="alert"
            {...variantProps(v2, "ui2-modal-error", RESET_PASSWORD.error)}
          >
            {error}
          </div>
        )}
        <div {...variantProps(v2, "ui2-modal-footer", RESET_PASSWORD.footer)}>
          <button type="button" onClick={onClose}
              {...v2Only(v2, "ui2-btn ui2-btn--secondary")}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
              {...v2Only(v2, "ui2-btn ui2-btn--primary")}>
            {loading ? "Saving…" : "Reset Password"}
          </button>
        </div>
      </form>
    </div>
  );
}
