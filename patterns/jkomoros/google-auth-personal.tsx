/// <cts-enable />
/**
 * Personal Google Auth Wrapper
 *
 * Wraps the base google-auth pattern and adds the #googleAuthPersonal tag.
 * Use this when you want to explicitly mark an auth as "personal".
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

/** Personal Google account. #googleAuth #googleAuthPersonal */
interface Output {
  auth: Auth;
  accountType: "personal";
}

export default pattern<Input, Output>(({ auth, selectedScopes }) => {
  // Compose the base GoogleAuth pattern
  const baseAuth = GoogleAuth({ auth, selectedScopes });

  return {
    [NAME]: derive(baseAuth.auth, (a) =>
      `Google Auth (Personal)${a?.user?.email ? ` - ${a.user.email}` : ""}`
    ),
    [UI]: (
      <div>
        {/* Account type badge */}
        <div
          style={{
            padding: "8px 12px",
            background: "#dbeafe",
            borderRadius: "6px",
            marginBottom: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              background: "#3b82f6",
              color: "white",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            PERSONAL
          </span>
          <span>{derive(baseAuth.auth, (a) => a?.user?.email || "Not logged in")}</span>
        </div>

        {/* Embed the base auth UI */}
        {baseAuth}

        {/* Additional guidance */}
        {derive(baseAuth.auth, (a) => a?.user?.email) && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              background: "#eff6ff",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          >
            <strong>Personal Account</strong>
            <p style={{ margin: "8px 0 0 0" }}>
              Favorite this charm to use it for personal Gmail access.
              Patterns can find it via <code>#googleAuthPersonal</code>.
            </p>
          </div>
        )}
      </div>
    ),
    auth: baseAuth.auth,
    accountType: "personal" as const,
  };
});
