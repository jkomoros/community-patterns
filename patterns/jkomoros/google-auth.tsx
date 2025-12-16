/// <cts-enable />
import {
  Cell,
  computed,
  Default,
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
  contacts: "https://www.googleapis.com/auth/contacts.readonly",
} as const;

const SCOPE_DESCRIPTIONS = {
  gmail: "Gmail (read emails)",
  gmailSend: "Gmail (send emails)",
  gmailModify: "Gmail (add/remove labels)",
  calendar: "Calendar (read events)",
  calendarWrite: "Calendar (create/edit/delete events)",
  drive: "Drive (read files)",
  contacts: "Contacts (read contacts)",
} as const;

/**
 * Auth data structure for Google OAuth tokens.
 *
 * ⚠️ CRITICAL: When consuming this auth from another pattern, DO NOT use derive()!
 *
 * The framework automatically refreshes expired tokens by writing to this cell.
 * If you derive() the auth, it becomes read-only and token refresh silently fails.
 *
 * ❌ WRONG - creates read-only projection, token refresh fails silently:
 * ```typescript
 * const auth = derive(googleAuthCharm, (charm) => charm?.auth);
 * ```
 *
 * ✅ CORRECT - maintains writable cell reference:
 * ```typescript
 * const auth = googleAuthCharm.auth;  // Property access, not derive
 * ```
 *
 * ✅ ALSO CORRECT - use ifElse for conditional auth sources:
 * ```typescript
 * const auth = ifElse(hasDirectAuth, directAuth, wishedCharm.auth);
 * ```
 *
 * See: community-docs/superstitions/2025-12-03-derive-creates-readonly-cells-use-property-access.md
 */
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

// Selected scopes configuration
type SelectedScopes = {
  gmail: Default<boolean, false>;
  gmailSend: Default<boolean, false>;
  gmailModify: Default<boolean, false>;
  calendar: Default<boolean, false>;
  calendarWrite: Default<boolean, false>;
  drive: Default<boolean, false>;
  contacts: Default<boolean, false>;
};

interface Input {
  selectedScopes: Default<SelectedScopes, {
    gmail: true;
    gmailSend: false;
    gmailModify: false;
    calendar: true;
    calendarWrite: false;
    drive: false;
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

/** Google OAuth authentication for Google APIs. #googleAuth */
interface Output {
  auth: Auth;
  scopes: string[];
  selectedScopes: SelectedScopes;
  /**
   * Refresh the OAuth token. Call this from other charms when the token expires.
   *
   * This handler runs in google-auth's transaction context, so it can write to
   * the auth cell even when called from another charm's handler.
   *
   * Usage from consuming charm:
   * ```typescript
   * await new Promise<void>((resolve, reject) => {
   *   authCharm.refreshToken.send({}, (tx) => {
   *     const status = tx.status();
   *     if (status.status === "done") resolve();
   *     else reject(status.error);
   *   });
   * });
   * ```
   */
  refreshToken: Stream<Record<string, never>>;
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
 *
 * This runs in google-auth's transaction context, allowing it to write to the
 * auth cell even when called from another charm. This solves the cross-charm
 * write isolation issue where a consuming charm's handler cannot write to
 * cells owned by a different charm's DID.
 *
 * The handler reads the current refreshToken from the auth cell, calls the
 * server refresh endpoint, and updates the auth cell with the new token.
 */
const refreshTokenHandler = handler<
  Record<string, never>,
  { auth: Cell<Auth> }
>(async (_event, { auth }) => {
  // DEBUG: Log handler entry
  console.log('[DEBUG-AUTH] refreshTokenHandler called');
  const currentAuth = auth.get();
  const refreshToken = currentAuth?.refreshToken;

  console.log('[DEBUG-AUTH] Current token (first 20 chars):', currentAuth?.token?.slice(0, 20));
  console.log('[DEBUG-AUTH] Has refreshToken:', !!refreshToken);

  if (!refreshToken) {
    console.error("[google-auth] No refresh token available");
    throw new Error("No refresh token available");
  }

  console.log("[google-auth] Refreshing OAuth token...");

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
    console.error("[google-auth] Refresh failed:", res.status, errorText);
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const json = await res.json();
  console.log('[DEBUG-AUTH] Server response received');
  console.log('[DEBUG-AUTH] New token from server (first 20 chars):', json.tokenInfo?.token?.slice(0, 20));
  console.log('[DEBUG-AUTH] New expiresAt from server:', json.tokenInfo?.expiresAt);

  if (!json.tokenInfo) {
    console.error("[google-auth] No tokenInfo in response:", json);
    throw new Error("Invalid refresh response");
  }

  console.log("[google-auth] Token refreshed successfully");

  // Update the auth cell with new token data
  // Keep existing user info since refresh doesn't return it
  console.log('[DEBUG-AUTH] Calling auth.update()...');
  auth.update({
    ...json.tokenInfo,
    user: currentAuth.user,
  });
  console.log('[DEBUG-AUTH] auth.update() completed');
  console.log('[DEBUG-AUTH] Verifying - token now (first 20 chars):', auth.get()?.token?.slice(0, 20));
});

export default pattern<Input, Output>(
  ({ auth, selectedScopes }) => {
    // Compute active scopes based on selection
    const scopes = computed(() => {
      const base = ["email", "profile"];
      for (const [key, enabled] of Object.entries(selectedScopes)) {
        if (enabled && SCOPE_MAP[key as keyof typeof SCOPE_MAP]) {
          base.push(SCOPE_MAP[key as keyof typeof SCOPE_MAP]);
        }
      }
      return base;
    });

    // Track if any scope is selected (needed to enable auth)
    const hasSelectedScopes = computed(() =>
      Object.values(selectedScopes).some(Boolean)
    );

    // Check if re-auth is needed (selected scopes differ from granted scopes)
    const needsReauth = computed(() => {
      if (!auth?.token) return false;
      const grantedScopes: string[] = auth?.scope || [];
      for (const [key, enabled] of Object.entries(selectedScopes)) {
        const scopeUrl = SCOPE_MAP[key as keyof typeof SCOPE_MAP];
        if (enabled && scopeUrl && !grantedScopes.includes(scopeUrl)) {
          return true;
        }
      }
      return false;
    });

    return {
      [NAME]: "Google Auth",
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
            Google Authentication
          </h2>

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
                    checked={computed(() => selectedScopes[key as keyof SelectedScopes])}
                    onChange={toggleScope({ selectedScopes, scopeKey: key })}
                    disabled={computed(() => !!auth?.user?.email)}
                  />
                  <span>{description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Re-auth warning */}
          {computed(() => needsReauth ? (
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
          ) : null)}

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
              <strong>Favorite this charm</strong> to share your Google auth
              across all your patterns! Any pattern using{" "}
              <code>wish("#googleAuth")</code> will automatically find and use
              this authentication.
            </div>
          )}

          {/* Show selected scopes if no auth yet */}
          {computed(() => !auth?.user?.email && hasSelectedScopes ? (
            <div style={{ fontSize: "14px", color: "#666" }}>
              Will request: {computed(() => scopes.join(", "))}
            </div>
          ) : null)}

          <ct-google-oauth
            $auth={auth}
            scopes={scopes}
          />

          {/* Show granted scopes if authenticated */}
          {auth?.user?.email && (
            <div
              style={{
                padding: "15px",
                backgroundColor: "#e3f2fd",
                borderRadius: "8px",
                fontSize: "14px",
              }}
            >
              <strong>Granted Scopes:</strong>
              <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                {computed(() =>
                  (auth?.scope || []).map((scope: string) => {
                    // Convert URL to friendly name
                    const friendly = Object.entries(SCOPE_MAP).find(
                      ([, url]) => url === scope
                    );
                    const displayName = friendly
                      ? SCOPE_DESCRIPTIONS[friendly[0] as keyof typeof SCOPE_DESCRIPTIONS]
                      : scope;
                    return <li>{displayName}</li>;
                  })
                )}
              </ul>
            </div>
          )}

          <div
            style={{
              padding: "15px",
              backgroundColor: "#e3f2fd",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          >
            <strong>Usage:</strong>{" "}
            This charm provides unified Google OAuth authentication. Link its{" "}
            <code>auth</code> output to any Google importer charm's{" "}
            <code>auth</code> input, or favorite it for automatic discovery.
          </div>
        </div>
      ),
      auth,
      scopes,
      selectedScopes,
      // Export the refresh handler for cross-charm calling
      refreshToken: refreshTokenHandler({ auth }),
    };
  },
);
