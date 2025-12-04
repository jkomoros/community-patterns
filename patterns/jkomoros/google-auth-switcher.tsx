/// <cts-enable />
/**
 * Google Auth Switcher - Post-hoc Classification
 *
 * This pattern allows users to:
 * 1. Log in with any Google account
 * 2. AFTER seeing their email, classify it as "Personal" or "Work"
 * 3. Creates a wrapper pattern with the right tags and navigates to it
 *
 * Better UX than pre-hoc: user sees actual email before classifying.
 */
import {
  Cell,
  Default,
  derive,
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";
import GoogleAuth, { Auth } from "./google-auth.tsx";
import GoogleAuthPersonal from "./google-auth-personal.tsx";
import GoogleAuthWork from "./google-auth-work.tsx";

// Same selected scopes type as base GoogleAuth
type SelectedScopes = {
  gmail: Default<boolean, false>;
  calendar: Default<boolean, false>;
  drive: Default<boolean, false>;
  contacts: Default<boolean, false>;
};

interface Input {
  selectedScopes: Default<
    SelectedScopes,
    {
      gmail: true;
      calendar: true;
      drive: false;
      contacts: false;
    }
  >;
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

interface Output {
  auth: Auth;
}

// Handler to create personal wrapper and navigate to it
const createPersonalWrapper = handler<
  unknown,
  { auth: Cell<Auth>; selectedScopes: Cell<SelectedScopes> }
>((_, { auth, selectedScopes }) => {
  const wrapper = GoogleAuthPersonal({ auth, selectedScopes });
  return navigateTo(wrapper);
});

// Handler to create work wrapper and navigate to it
const createWorkWrapper = handler<
  unknown,
  { auth: Cell<Auth>; selectedScopes: Cell<SelectedScopes> }
>((_, { auth, selectedScopes }) => {
  const wrapper = GoogleAuthWork({ auth, selectedScopes });
  return navigateTo(wrapper);
});

export default pattern<Input, Output>(({ auth, selectedScopes }) => {
  // Compose the base GoogleAuth pattern
  const baseAuth = GoogleAuth({ auth, selectedScopes });

  // Check if logged in
  const isLoggedIn = derive(baseAuth.auth, (a) => !!a?.user?.email);
  const userEmail = derive(baseAuth.auth, (a) => a?.user?.email || "");

  return {
    [NAME]: derive(baseAuth.auth, (a) =>
      a?.user?.email ? `Google Auth Setup - ${a.user.email}` : "Google Auth Setup"
    ),
    [UI]: (
      <div>
        {/* Embed base auth UI */}
        {baseAuth}

        {/* Show classification buttons after login */}
        {derive(isLoggedIn, (loggedIn) =>
          loggedIn ? (
            <div
              style={{
                marginTop: "16px",
                padding: "20px",
                background: "#f8fafc",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", fontSize: "18px" }}>
                What type of account is this?
              </h3>
              <p style={{ margin: "0 0 16px 0", color: "#64748b" }}>
                Logged in as: <strong>{userEmail}</strong>
              </p>

              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <button
                  onClick={createPersonalWrapper({
                    auth: baseAuth.auth,
                    selectedScopes,
                  })}
                  style={{
                    padding: "12px 24px",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  Personal Account
                </button>
                <button
                  onClick={createWorkWrapper({
                    auth: baseAuth.auth,
                    selectedScopes,
                  })}
                  style={{
                    padding: "12px 24px",
                    background: "#dc2626",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  Work Account
                </button>
              </div>

              <p
                style={{
                  margin: "0",
                  fontSize: "13px",
                  color: "#94a3b8",
                  fontStyle: "italic",
                }}
              >
                Or favorite this charm directly for generic #googleAuth access
                (works if you only have one account).
              </p>
            </div>
          ) : null
        )}
      </div>
    ),
    auth: baseAuth.auth,
  };
});
