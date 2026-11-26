/**
 * User management admin panel — lists all event user accounts, allows admins to
 * create new users with a chosen role, and deactivate existing accounts.
 */

import { useState, useEffect, type FormEvent } from "react";
import { useUiVariant } from "../lib/uiVariant";
import { USER_MANAGEMENT, v2Only, variantProps } from "./adminStyles";
import { getUsers, createUser, deactivateUser, deleteUser } from "../api/users";
import { generatePassword } from "../api/auth";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { CreatedUserModal } from "./CreatedUserModal";
import type { User } from "../types";

/** Permitted role values for event user accounts. */
type Role = "admin" | "intake" | "cashier" | "cashier_intake";

/**
 * Admin panel for managing event user accounts: displays the user table with
 * deactivation controls and a form to create new users.
 */
export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<Role>("cashier");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const v2 = useUiVariant() === "v2";
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  // Credentials of the most recently created user, shown once in a popup.
  const [created, setCreated] = useState<{
    username: string;
    password: string;
  } | null>(null);

  /** Fetches all event users from the API and updates local state. */
  async function load() {
    const data = await getUsers();
    setUsers(data);
  }

  /** Prefills the password field with a compliant generated default. */
  async function fillGeneratedPassword() {
    try {
      setPassword(await generatePassword());
    } catch {
      // Leave the field empty; the admin can still type a password manually.
    }
  }

  useEffect(() => {
    load().catch(() => {});
    fillGeneratedPassword();
  }, []);

  /** Submits the create-user form; on success shows the credentials once. */
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createUser({ username, password, role });
      setCreated({ username, password });
      await load();
      setUsername("");
      setPassword("");
      fillGeneratedPassword(); // prefill a fresh default for the next user
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setLoading(false);
    }
  }

  /** Deactivates the user with the given ID and updates that row in the local list. */
  async function handleDeactivate(id: number) {
    const updated = await deactivateUser(id);
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
  }

  /** Permanently deletes an account created in error (confirm-gated; backend
   *  guards: not your own account, not the last active admin). */
  async function handleDelete(u: User) {
    const ok = window.confirm(
      `Delete user "${u.username}"? This permanently removes their login. ` +
        "Their recorded transactions are kept. There is no undo.",
    );
    if (!ok) return;
    setError(null);
    try {
      const result = await deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      window.alert(`Deleted "${result.username}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  return (
    <div>
      <div {...v2Only(v2, "ui2-scroll-x")}>
        <h3>Users</h3>
        <table
            {...variantProps(
              v2,
              "ui2-settings-table ui2-settings-table--wide",
              USER_MANAGEMENT.table,
            )}
          >
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{u.is_active ? "Active" : <em>Inactive</em>}</td>
                <td {...v2Only(v2, "ui2-settings-actions")}>
                  <button onClick={() => setResetTarget(u)}>Reset Password</button>
                  {u.is_active && (
                    <button onClick={() => handleDeactivate(u.id)}>Deactivate</button>
                  )}
                  <button
                    onClick={() => handleDelete(u)}
                    aria-label={`delete user ${u.username}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>Create New User</h4>
      <form
        onSubmit={handleCreate}
        {...variantProps(v2, "ui2-settings-form ui2-settings-form--users", USER_MANAGEMENT.form)}
      >
        <div>
          <label htmlFor="newUsername">Username</label>
          <input
            id="newUsername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="newPassword">Password</label>
          <div {...variantProps(v2, "ui2-password-row", USER_MANAGEMENT.passwordRow)}>
            <input
              id="newPassword"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => fillGeneratedPassword()}
              title="Generate a compliant password"
            >
              Generate
            </button>
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              title={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="newRole">Role</label>
          <select
            id="newRole"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="cashier">Cashier</option>
            <option value="intake">Intake</option>
            <option value="cashier_intake">Cashier + Intake (combined)</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={loading}>
          Create User
        </button>
      </form>
      {error && (
        <div
          role="alert"
          {...variantProps(v2, "ui2-settings-error", USER_MANAGEMENT.error)}
        >
          {error}
        </div>
      )}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
      {created && (
        <CreatedUserModal
          username={created.username}
          password={created.password}
          onClose={() => setCreated(null)}
        />
      )}
    </div>
  );
}
