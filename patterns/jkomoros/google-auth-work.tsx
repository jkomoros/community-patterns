/// <cts-enable />
/**
 * Work Google Auth Wrapper
 *
 * Wraps the base google-auth pattern and adds the #googleAuthWork tag.
 * Use this when you want to explicitly mark an auth as "work".
 *
 * Can be used two ways:
 * 1. Pre-hoc: Create this directly, log in, and favorite
 * 2. Post-hoc: Created by google-auth-switcher after login
 */
import { Default, derive, NAME, pattern, UI } from "commontools";
import GoogleAuth, { Auth } from "./google-auth.tsx";

// Same selected scopes type as base GoogleAuth
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
  auth: Default<
    Auth,
    {
      token: "";
      tokenType: "";
      scope: [];
      expiresIn: 0;
      expiresAt: 0;
      refreshToken: "";
      user: { email: ""; name: ""; picture: "" };
    }
  >;
}

/** Work Google account. #googleAuth #googleAuthWork */
interface Output {
  auth: Auth;
  accountType: "work";
}

export default pattern<Input, Output>(({ auth, selectedScopes }) => {
  // Compose the base GoogleAuth pattern
  const baseAuth = GoogleAuth({ auth, selectedScopes });

  return {
    [NAME]: derive(baseAuth.auth, (a) =>
      `Google Auth (Work)${a?.user?.email ? ` - ${a.user.email}` : ""}`
    ),
    [UI]: (
      <div>
        {/* Account type badge */}
        <div
          style={{
            padding: "8px 12px",
            background: "#fee2e2",
            borderRadius: "6px",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              background: "#dc2626",
              color: "white",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            WORK
          </span>
          <span>{derive(baseAuth.auth, (a) => a?.user?.email || "Not logged in")}</span>
        </div>

        {/* Embed the base auth UI */}
        {baseAuth}

        {/* Prominent favorite CTA */}
        {derive(baseAuth.auth, (a) => a?.user?.email) && (
          <div
            style={{
              marginTop: "16px",
              padding: "20px",
              background: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)",
              borderRadius: "12px",
              border: "2px solid #dc2626",
              textAlign: "center",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", color: "#991b1b" }}>
              Favorite This Charm!
            </h3>
            <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#dc2626" }}>
              Click the star to save your work Google auth
            </p>
            <p style={{ margin: "0", fontSize: "13px", color: "#64748b" }}>
              Patterns can then find it via <code style={{ background: "#fee2e2", padding: "2px 6px", borderRadius: "4px" }}>#googleAuthWork</code>
            </p>
          </div>
        )}
      </div>
    ),
    auth: baseAuth.auth,
    accountType: "work" as const,
  };
});
