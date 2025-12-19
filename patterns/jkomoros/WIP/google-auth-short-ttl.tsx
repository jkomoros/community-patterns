/// <cts-enable />
/**
 * Google Auth with Short TTL (Test Version)
 *
 * This is a test version of google-auth.tsx that simulates token expiration
 * by setting expiresAt to 60 seconds after authentication.
 *
 * PURPOSE: Test cross-charm token refresh flows without waiting 1 hour.
 *
 * The refreshToken stream should still work to get a fresh token from
 * Google - we're just pretending the token expires faster for testing.
 */
import {
  Cell,
  Default,
  derive,
  getRecipeEnvironment,
  handler,
  NAME,
  pattern,
  Stream,
  UI,
} from "commontools";

const env = getRecipeEnvironment();

type CFC<T, C extends string> = T;
type Secret<T> = CFC<T, "secret">;

// Scope mapping for Google APIs
const SCOPE_MAP = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  gmailModify: "https://www.googleapis.com/auth/gmail.modify",
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  calendarWrite: "https://www.googleapis.com/auth/calendar.events",
  drive: "https://www.googleapis.com/auth/drive.readonly",
  docs: "https://www.googleapis.com/auth/documents.readonly",
  contacts: "https://www.googleapis.com/auth/contacts.readonly",
} as const;

const SCOPE_DESCRIPTIONS = {
  gmail: "Gmail (read emails)",
  gmailSend: "Gmail (send emails)",
  gmailModify: "Gmail (add/remove labels)",
  calendar: "Calendar (read events)",
  calendarWrite: "Calendar (create/edit/delete events)",
  drive: "Drive (read files)",
  docs: "Docs (read documents)",
  contacts: "Contacts (read contacts)",
} as const;

// SHORT TTL: 60 seconds instead of the real ~3600 seconds
const SHORT_TTL_SECONDS = 60;

export type Auth = {
  token: Default<Secret<string>, "">;
  tokenType: Default<string, "">;
  scope: Default<string[], []>;
  expiresIn: Default<number, 0>;
  expiresAt: Default<number, 0>;
  refreshToken: Default<Secret<string>, "">;
  user: Default<{
    email: string;
    name: string;
    picture: string;
  }, { email: ""; name: ""; picture: "" }>;
};

type SelectedScopes = {
  gmail: Default<boolean, false>;
  gmailSend: Default<boolean, false>;
  gmailModify: Default<boolean, false>;
  calendar: Default<boolean, false>;
  calendarWrite: Default<boolean, false>;
  drive: Default<boolean, false>;
  docs: Default<boolean, false>;
  contacts: Default<boolean, false>;
};

interface Input {
  selectedScopes: Default<SelectedScopes, {
    gmail: true;
    gmailSend: false;
    gmailModify: false;
    calendar: false;
    calendarWrite: false;
    drive: false;
    docs: false;
    contacts: false;
  }>;
  auth: Default<Auth, {
    token: "";
    tokenType: "";
    scope: [];
    expiresIn: 0;
    expiresAt: 0;
    refreshToken: "";
    user: { email: ""; name: ""; picture: "" };
  }>;
}

/** Google OAuth with SHORT TTL for testing. #googleAuthShortTTL */
interface Output {
  auth: Auth;
  scopes: string[];
  selectedScopes: SelectedScopes;
  /** Refresh the OAuth token - same as google-auth.tsx */
  refreshToken: Stream<Record<string, never>>;
  /** Time remaining until token "expires" (based on short TTL) */
  timeRemaining: number;
  /** Whether token is considered "expired" (for testing) */
  isExpired: boolean;
}

// Handler for toggling scope selection
const toggleScope = handler<
  { target: { checked: boolean } },
  { selectedScopes: Cell<SelectedScopes>; scopeKey: string }
>(
  ({ target }, { selectedScopes, scopeKey }) => {
    const current = selectedScopes.get();
    selectedScopes.set({
      ...current,
      [scopeKey]: target.checked,
    });
  },
);

/**
 * Handler for refreshing OAuth tokens.
 * Same as google-auth.tsx but with SHORT TTL on the result.
 */
const refreshTokenHandler = handler<
  Record<string, never>,
  { auth: Cell<Auth> }
>(async (_event, { auth }) => {
  console.log('[SHORT-TTL] refreshTokenHandler called');
  const currentAuth = auth.get();
  const refreshToken = currentAuth?.refreshToken;

  console.log('[SHORT-TTL] Current token (first 20 chars):', currentAuth?.token?.slice(0, 20));
  console.log('[SHORT-TTL] Has refreshToken:', !!refreshToken);

  if (!refreshToken) {
    console.error("[SHORT-TTL] No refresh token available");
    throw new Error("No refresh token available");
  }

  console.log("[SHORT-TTL] Calling refresh endpoint...");

  const res = await fetch(
    new URL("/api/integrations/google-oauth/refresh", env.apiUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    console.error("[SHORT-TTL] Refresh failed:", res.status, errorText);
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const json = await res.json();
  console.log('[SHORT-TTL] Server response received');
  console.log('[SHORT-TTL] New token from server (first 20 chars):', json.tokenInfo?.token?.slice(0, 20));

  if (!json.tokenInfo) {
    console.error("[SHORT-TTL] No tokenInfo in response:", json);
    throw new Error("Invalid refresh response");
  }

  // OVERRIDE: Set short TTL instead of real expiration
  const shortExpiresAt = Date.now() + (SHORT_TTL_SECONDS * 1000);
  console.log(`[SHORT-TTL] Setting expiresAt to ${SHORT_TTL_SECONDS}s from now: ${shortExpiresAt}`);

  auth.update({
    ...json.tokenInfo,
    expiresIn: SHORT_TTL_SECONDS,
    expiresAt: shortExpiresAt,
    user: currentAuth.user,
  });

  console.log('[SHORT-TTL] auth.update() completed');
  console.log('[SHORT-TTL] New expiresAt:', auth.get()?.expiresAt);
});

export default pattern<Input, Output>(
  ({ auth, selectedScopes }) => {
    // Compute active scopes based on selection
    const scopes = derive(selectedScopes, (selected) => {
      const base = ["email", "profile"];
      for (const [key, enabled] of Object.entries(selected)) {
        if (enabled && SCOPE_MAP[key as keyof typeof SCOPE_MAP]) {
          base.push(SCOPE_MAP[key as keyof typeof SCOPE_MAP]);
        }
      }
      return base;
    });

    const hasSelectedScopes = derive(
      selectedScopes,
      (selected) => Object.values(selected).some(Boolean)
    );

    // Compute time remaining and expired status
    const timeRemaining = derive(auth, (a) => {
      if (!a?.expiresAt) return 0;
      const remaining = Math.max(0, a.expiresAt - Date.now());
      return Math.floor(remaining / 1000);
    });

    const isExpired = derive(timeRemaining, (t) => t <= 0);

    // Check if re-auth is needed (selected scopes differ from granted scopes)
    const needsReauth = derive(
      { selectedScopes, auth },
      ({ selectedScopes, auth }) => {
        if (!auth?.token) return false;
        const grantedScopes: string[] = auth.scope || [];
        for (const [key, enabled] of Object.entries(selectedScopes)) {
          const scopeUrl = SCOPE_MAP[key as keyof typeof SCOPE_MAP];
          if (enabled && scopeUrl && !grantedScopes.includes(scopeUrl)) {
            return true;
          }
        }
        return false;
      }
    );

    return {
      [NAME]: "Google Auth (Short TTL)",
      [UI]: (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "25px",
            maxWidth: "600px",
          }}
        >
          <h2 style={{ fontSize: "24px", fontWeight: "bold", margin: "0" }}>
            Google Auth (Short TTL Test)
          </h2>

          {/* TEST MODE WARNING */}
          <div
            style={{
              padding: "12px",
              backgroundColor: "#fef3c7",
              borderRadius: "8px",
              border: "2px solid #f59e0b",
              fontSize: "14px",
            }}
          >
            <strong>TEST MODE:</strong> Token expires in {SHORT_TTL_SECONDS} seconds instead of 1 hour.
            This is for testing cross-charm token refresh.
          </div>

          <div
            style={{
              padding: "20px",
              backgroundColor: "#f8f9fa",
              borderRadius: "8px",
              border: "1px solid #e0e0e0",
            }}
          >
            <h3 style={{ fontSize: "16px", marginTop: "0" }}>
              Status:{" "}
              {auth?.user?.email ? "Authenticated" : "Not Authenticated"}
            </h3>

            {auth?.user?.email
              ? (
                <div>
                  <p style={{ margin: "8px 0" }}>
                    <strong>Email:</strong> {auth.user.email}
                  </p>
                  <p style={{ margin: "8px 0" }}>
                    <strong>Name:</strong> {auth.user.name}
                  </p>
                </div>
              )
              : (
                <p style={{ color: "#666" }}>
                  Select permissions below and authenticate with Google
                </p>
              )}
          </div>

          {/* Token Status */}
          {auth?.user?.email && (
            <div
              style={{
                padding: "16px",
                backgroundColor: derive(isExpired, (exp) => exp ? "#fee2e2" : "#dcfce7"),
                borderRadius: "8px",
                border: derive(isExpired, (exp) => exp ? "2px solid #ef4444" : "1px solid #22c55e"),
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                Token Status: {derive(isExpired, (exp) => exp ? "EXPIRED" : "VALID")}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "14px" }}>
                Time remaining: {timeRemaining}s
              </div>
              <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#666", marginTop: "4px" }}>
                expiresAt: {derive(auth, (a) => a?.expiresAt || "N/A")}
              </div>
            </div>
          )}

          {/* Permissions checkboxes */}
          <div
            style={{
              padding: "20px",
              backgroundColor: auth?.user?.email ? "#e5e7eb" : "#f0f4f8",
              borderRadius: "8px",
              border: "1px solid #d0d7de",
              opacity: auth?.user?.email ? 0.7 : 1,
            }}
          >
            <h4 style={{ marginTop: "0", marginBottom: "12px" }}>
              Permissions
              {auth?.user?.email && (
                <span style={{ fontWeight: "normal", fontSize: "12px", color: "#6b7280", marginLeft: "8px" }}>
                  (locked while authenticated)
                </span>
              )}
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {Object.entries(SCOPE_DESCRIPTIONS).map(([key, description]) => (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: auth?.user?.email ? "not-allowed" : "pointer",
                    color: auth?.user?.email ? "#9ca3af" : "inherit",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={derive(selectedScopes, (s) => s[key as keyof SelectedScopes])}
                    onChange={toggleScope({ selectedScopes, scopeKey: key })}
                    disabled={derive(auth, (a) => !!a?.user?.email)}
                  />
                  <span>{description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Re-auth warning */}
          {derive(needsReauth, (needs) => needs) && (
            <div
              style={{
                padding: "12px",
                backgroundColor: "#fff3cd",
                borderRadius: "8px",
                border: "1px solid #ffc107",
                fontSize: "14px",
              }}
            >
              <strong>Note:</strong> You've selected new permissions.
              Click "Sign in with Google" below to grant access.
            </div>
          )}

          {/* Favorite reminder */}
          {auth?.user?.email && (
            <div
              style={{
                padding: "15px",
                backgroundColor: "#d4edda",
                borderRadius: "8px",
                border: "1px solid #28a745",
                fontSize: "14px",
              }}
            >
              <strong>Tip:</strong> Favorite this charm (click ⭐) to share your
              Google auth across all your patterns. Any pattern using{" "}
              <code>wish("#googleAuthShortTTL")</code> will automatically find and use
              this authentication.
            </div>
          )}

          {/* Show selected scopes if no auth yet */}
          {!auth?.user?.email && derive(hasSelectedScopes, (has) => has) && (
            <div style={{ fontSize: "14px", color: "#666" }}>
              Will request: {derive(scopes, (s) => s.join(", "))}
            </div>
          )}

          <ct-google-oauth
            $auth={auth}
            scopes={scopes}
          />

          {/* Debug info */}
          <details style={{ fontSize: "12px", color: "#666" }}>
            <summary style={{ cursor: "pointer" }}>Debug Info</summary>
            <pre style={{
              background: "#f3f4f6",
              padding: "12px",
              borderRadius: "4px",
              overflow: "auto",
              fontSize: "11px",
            }}>
              {derive(auth, (a) => JSON.stringify({
                hasToken: !!a?.token,
                tokenFirst20: a?.token?.slice(0, 20),
                hasRefreshToken: !!a?.refreshToken,
                expiresAt: a?.expiresAt,
                expiresIn: a?.expiresIn,
                scope: a?.scope,
                user: a?.user?.email,
              }, null, 2))}
            </pre>
          </details>
        </div>
      ),
      auth,
      scopes,
      selectedScopes,
      refreshToken: refreshTokenHandler({ auth }),
      timeRemaining,
      isExpired,
    };
  },
);
