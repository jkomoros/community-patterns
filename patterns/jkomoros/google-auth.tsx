/// <cts-enable />
import { Cell, Default, derive, handler, NAME, pattern, UI } from "commontools";

type CFC<T, C extends string> = T;
type Secret<T> = CFC<T, "secret">;

// Scope mapping for Google APIs
const SCOPE_MAP = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  drive: "https://www.googleapis.com/auth/drive.readonly",
  contacts: "https://www.googleapis.com/auth/contacts.readonly",
} as const;

const SCOPE_DESCRIPTIONS = {
  gmail: "Gmail (read emails)",
  calendar: "Calendar (read events)",
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
  calendar: Default<boolean, false>;
  drive: Default<boolean, false>;
  contacts: Default<boolean, false>;
};

interface Input {
  selectedScopes: Default<SelectedScopes, {
    gmail: true;
    calendar: true;
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

    // Track if any scope is selected (needed to enable auth)
    const hasSelectedScopes = derive(
      selectedScopes,
      (selected) => Object.values(selected).some(Boolean)
    );

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
              <strong>Favorite this charm</strong> to share your Google auth
              across all your patterns! Any pattern using{" "}
              <code>wish("#googleAuth")</code> will automatically find and use
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
                {derive(auth.scope, (scopes) =>
                  (scopes || []).map((scope: string) => {
                    // Convert URL to friendly name
                    const friendly = Object.entries(SCOPE_MAP).find(
                      ([, url]) => url === scope
                    );
                    return friendly
                      ? SCOPE_DESCRIPTIONS[friendly[0] as keyof typeof SCOPE_DESCRIPTIONS]
                      : scope;
                  })
                ).map((name: string) => (
                  <li>{name}</li>
                ))}
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
    };
  },
);
