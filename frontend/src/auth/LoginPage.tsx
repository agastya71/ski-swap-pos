/**
 * Login page — credential form for all user roles. Calls the auth API and stores
 * the returned JWT in AuthContext on success.
 */
import { useState, type FormEvent } from "react";
import { login } from "../api/auth";
import { useUiVariant } from "../lib/uiVariant";
import { LOGIN, variantProps } from "../uiStyles";
import { useAuth } from "./AuthContext";

/**
 * Renders the full-page login form with username/password fields and a submit button.
 * On successful authentication the JWT is stored in {@link AuthContext} and `onLogin` is called.
 *
 * @param props.onLogin - Callback invoked after a successful login response.
 */
export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { signIn } = useAuth();
  /** Current value of the username input field. */
  const [username, setUsername] = useState("");
  /** Current value of the password input field. */
  const [password, setPassword] = useState("");
  /** Error message to display when login fails, or `null` when no error. */
  const [error, setError] = useState<string | null>(null);
  /** Whether a login request is in-flight; used to disable the submit button. */
  const [loading, setLoading] = useState(false);
  const v2 = useUiVariant() === "v2";

  /** Submit the login form, call the auth API, and handle success or failure. */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(username, password);
      signIn(res.access_token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div {...variantProps(v2, "ui2-login", LOGIN.shell)}>
      {/* Brand stripe */}
      <div {...variantProps(v2, "ui2-login-stripe", LOGIN.brandStripe)} />

      {/* Centered card */}
      <div {...variantProps(v2, "ui2-login-centre", LOGIN.centre)}>
        <div {...variantProps(v2, "ui2-login-card", LOGIN.card)}>
          {/* Logo / brand */}
          <div {...variantProps(v2, "ui2-login-brand", LOGIN.brandBlock)}>
            <div {...variantProps(v2, "ui2-login-brand-title", LOGIN.brandTitle)}>
              ⛷ Ski Swap POS
            </div>
            <div {...variantProps(v2, "ui2-login-brand-sub", LOGIN.brandSub)}>
              Minnesota Youth Ski League
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div {...variantProps(v2, "ui2-login-field", LOGIN.field)}>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div {...variantProps(v2, "ui2-login-field ui2-login-field--last", LOGIN.fieldLast)}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div
                role="alert"
                {...variantProps(v2, "ui2-login-error", LOGIN.error)}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              {...variantProps(v2, "ui2-login-submit", LOGIN.submit)}
            >
              Sign In
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div {...variantProps(v2, "ui2-login-footer", LOGIN.footer)}>
        Minnesota Youth Ski League — myxc.org
      </div>
    </div>
  );
}
