/**
 * Login sessions admin panel — lists every account's login sessions with
 * device/IP metadata, revokes individual sessions, and bulk-revokes all live
 * sessions of one user (offboarding).
 */

import { useEffect, useState } from "react";
import { BUTTON_STYLE } from "../lib/buttons";
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
      <p style={{ color: "#555", marginTop: 0 }}>
        Every login creates a session; revoking one signs that device out within one
        request. Rows older than 90 days are pruned automatically.
      </p>
      {error && (
        <p role="alert" style={{ color: "#b00020" }}>
          {error}
        </p>
      )}
      <table style={{ width: "auto", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ccc" }}>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>User</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Logged in</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Last seen</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>IP</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Device</th>
            <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "6px 8px" }}>{s.username}</td>
              <td style={{ padding: "6px 8px" }}>{fmt(s.created_at)}</td>
              <td style={{ padding: "6px 8px" }}>{fmt(s.last_seen_at)}</td>
              <td style={{ padding: "6px 8px" }}>{s.login_ip ?? "—"}</td>
              <td
                style={{ padding: "6px 8px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={s.user_agent ?? ""}
              >
                {s.user_agent ?? "—"}
              </td>
              <td style={{ padding: "6px 8px" }}>
                {s.revoked_at ? (
                  <em>
                    Revoked{s.revoked_by ? ` by ${s.revoked_by}` : ""} {fmt(s.revoked_at)}
                  </em>
                ) : (
                  "Active"
                )}
              </td>
              <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                {!s.revoked_at && (
                  <button
                    onClick={() => handleRevoke(s.id)}
                    disabled={busy}
                    style={{ ...BUTTON_STYLE, marginRight: 6 }}
                    aria-label={`revoke session ${s.id} for ${s.username}`}
                  >
                    Revoke
                  </button>
                )}
                {!s.revoked_at && (
                  <button
                    onClick={() => handleRevokeUser(s.user_id, s.username)}
                    disabled={busy}
                    style={BUTTON_STYLE}
                    aria-label={`revoke all sessions for ${s.username}`}
                  >
                    Revoke all user sessions
                  </button>
                )}
              </td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: "12px 8px", color: "#777" }}>
                No sessions recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {usersWithLive.length > 0 && (
        <p style={{ color: "#777", fontSize: 13 }}>
          {usersWithLive.filter((s) => !s.revoked_at).length} active session(s) across{" "}
          {new Set(usersWithLive.filter((s) => !s.revoked_at).map((s) => s.username)).size} user(s).
        </p>
      )}
    </div>
  );
}
