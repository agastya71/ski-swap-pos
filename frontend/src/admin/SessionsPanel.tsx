/**
 * Login sessions admin panel — lists every account's login sessions with
 * device/IP metadata, revokes individual sessions, and bulk-revokes all live
 * sessions of one user (offboarding).
 */

import { useEffect, useState } from "react";
import { useUiVariant } from "../lib/uiVariant";
import { SESSIONS, v2Only, variantProps } from "./adminStyles";
import { getAllSessions, revokeSession, revokeUserSessions } from "../api/auth";
import type { LoginSession } from "../types";

/** "Nov 15 08:02" from an ISO timestamp (or "—" for null). */
function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Admin table of all login sessions. Revoking a session immediately kills the
 * owning JWT (enforced server-side via the token's sid claim).
 */
export function SessionsPanel() {
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const v2 = useUiVariant() === "v2";

  async function load() {
    try {
      setSessions(await getAllSessions());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  /** Revokes one session row, then refreshes. */
  async function handleRevoke(id: number) {
    setBusy(true);
    try {
      await revokeSession(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  /** Revokes every LIVE session owned by one user account. */
  async function handleRevokeUser(userId: number, username: string) {
    const liveCount = sessions.filter((s) => s.user_id === userId && !s.revoked_at).length;
    if (
      !window.confirm(
        `Revoke all ${liveCount} live session(s) for ${username}? They will be signed out everywhere immediately.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await revokeUserSessions(userId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk revoke failed");
    } finally {
      setBusy(false);
    }
  }

  // One row per user (most recent session first) for the bulk action column;
  // individual sessions still listed chronologically.
  const usersWithLive = Array.from(
    new Map(sessions.map((s) => [s.user_id, s])).values(),
  );

  return (
    <div>
      <h3>Login Sessions</h3>
      <p {...variantProps(v2, "ui2-settings-hint", SESSIONS.hint)}>
        Every login creates a session; revoking one signs that device out within one
        request. Rows older than 90 days are pruned automatically.
      </p>
      {error && (
        <p role="alert" {...variantProps(v2, "ui2-settings-error", SESSIONS.error)}>
          {error}
        </p>
      )}
      <div {...v2Only(v2, "ui2-scroll-x")}>
      <table
        {...variantProps(
          v2,
          "ui2-settings-table ui2-settings-table--auto",
          SESSIONS.table,
        )}
      >
        <thead>
          <tr>
            <th>User</th>
            <th>Logged in</th>
            <th>Last seen</th>
            <th>IP</th>
            <th>Device</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>{s.username}</td>
              <td>{fmt(s.created_at)}</td>
              <td>{fmt(s.last_seen_at)}</td>
              <td>{s.login_ip ?? "—"}</td>
              <td
                {...variantProps(v2, "ui2-settings-device", SESSIONS.deviceCell)}
                title={s.user_agent ?? ""}
              >
                {s.user_agent ?? "—"}
              </td>
              <td>
                {s.revoked_at ? (
                  <em>
                    Revoked{s.revoked_by ? ` by ${s.revoked_by}` : ""} {fmt(s.revoked_at)}
                  </em>
                ) : (
                  "Active"
                )}
              </td>
              <td {...v2Only(v2, "ui2-settings-actions")}>
                {!s.revoked_at && (
                  <button
                    onClick={() => handleRevoke(s.id)}
                    disabled={busy}
                    aria-label={`revoke session ${s.id} for ${s.username}`}
                      {...v2Only(v2, "ui2-btn ui2-btn--secondary")}>
                    Revoke
                  </button>
                )}
                {!s.revoked_at && (
                  <button
                    onClick={() => handleRevokeUser(s.user_id, s.username)}
                    disabled={busy}
                    aria-label={`revoke all sessions for ${s.username}`}
                      {...v2Only(v2, "ui2-btn ui2-btn--secondary")}>
                    Revoke all user sessions
                  </button>
                )}
              </td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={7} {...variantProps(v2, "ui2-settings-empty", SESSIONS.emptyCell)}>
                No sessions recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {usersWithLive.length > 0 && (
        <p {...variantProps(v2, "ui2-settings-footer", SESSIONS.footer)}>
          {usersWithLive.filter((s) => !s.revoked_at).length} active session(s) across{" "}
          {new Set(usersWithLive.filter((s) => !s.revoked_at).map((s) => s.username)).size} user(s).
        </p>
      )}
    </div>
  );
}
