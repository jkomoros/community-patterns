/// <cts-enable />
/**
 * CPU Spike Whittle-Down Test
 *
 * Starting from the FULL orchestrator structure and removing parts
 * to find the minimal repro that causes the CPU spike.
 *
 * STEP 1: Keep ALL the structure from orchestrator but remove unrelated UI/handlers
 */
import {
  Cell,
  computed,
  Default,
  handler,
  ifElse,
  NAME,
  navigateTo,
  pattern,
  UI,
  wish,
} from "commontools";

// Import GoogleAuth pattern for creating new auth charms
import GoogleAuth from "./google-auth.tsx";

// =============================================================================
// Types - Auth (from google-auth pattern)
// =============================================================================

type CFC<T, C extends string> = T;
type Secret<T> = CFC<T, "secret">;

type Auth = {
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

interface GoogleAuthCharm {
  auth: Auth;
  refreshToken: { send: (event: Record<string, never>, callback?: (tx: any) => void) => void };
}

// =============================================================================
// Types - Input/Output (stripped down)
// =============================================================================

interface Input {
  // Minimal state
  lastError?: Cell<Default<string | null, null>>;
}

/** CPU Spike Whittle Test. #cpuSpikeWhittle */
interface Output {
  testName: string;
}

// =============================================================================
// Auth Management Handler - THE SUSPECT
// =============================================================================

/**
 * Create a new Google Auth charm with Drive and Docs scopes pre-selected.
 * Navigates to it so user can authenticate.
 */
const createGoogleAuth = handler<unknown, Record<string, never>>(() => {
  const authCharm = GoogleAuth({
    selectedScopes: {
      gmail: false,
      gmailSend: false,
      gmailModify: false,
      calendar: false,
      calendarWrite: false,
      drive: true,
      docs: true,
      contacts: false,
    },
    auth: {
      token: "",
      tokenType: "",
      scope: [],
      expiresIn: 0,
      expiresAt: 0,
      refreshToken: "",
      user: { email: "", name: "", picture: "" },
    },
  });
  return navigateTo(authCharm);
});

/**
 * Navigate to an existing auth charm (from wish result).
 */
const goToAuthCharm = handler<
  unknown,
  // deno-lint-ignore no-explicit-any
  { authCharm: any }
>((_, { authCharm }) => {
  if (authCharm) {
    return navigateTo(authCharm);
  }
});

// =============================================================================
// Pattern
// =============================================================================

export default pattern<Input, Output>(
  ({ lastError }) => {
    const lastErrorCell = lastError;

    // Auth via wish - KEEPING THIS as it's part of the orchestrator structure
    const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });

    // Derive auth state - KEEPING THIS
    const authState = computed(() => {
      const wr = wishResult;
      if (!wr) return "loading";
      if (wr.error) return "not-found";
      const email = wr.result?.auth?.user?.email;
      if (email && email !== "") return "authenticated";
      if (wr.result) return "found-not-authenticated";
      return "loading";
    });

    // Get auth from wish result
    const wishedAuthCharm = computed(() => wishResult?.result ?? null);

    // Auth status indicator
    const authStatusDot = computed(() => {
      const state = authState;
      if (state === "authenticated") return "var(--ct-color-green-500, #22c55e)";
      if (state === "not-found" || state === "found-not-authenticated") return "var(--ct-color-red-500, #ef4444)";
      return "var(--ct-color-yellow-500, #eab308)";
    });

    const authStatusText = computed(() => {
      const state = authState;
      if (state === "authenticated") {
        return "Signed in";
      }
      if (state === "not-found") return "No Google Auth charm found - please favorite one";
      if (state === "found-not-authenticated") return "Please sign in to your Google Auth charm";
      return "Loading auth...";
    });

    return {
      [NAME]: "CPU Spike Whittle Test",
      [UI]: (
        <div style={{ padding: "20px", maxWidth: "600px" }}>
          <h2>CPU Spike Whittle-Down Test</h2>

          <p style={{ color: "#666", marginBottom: "16px" }}>
            This is Step 1: Full orchestrator structure with minimal UI
          </p>

          {/* Auth status display */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
            padding: "12px",
            background: "#f5f5f5",
            borderRadius: "8px"
          }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: authStatusDot,
              }}
            />
            <span style={{ fontSize: "13px" }}>
              {authStatusText}
            </span>
          </div>

          {/* Auth Setup Card - THE UI WITH THE SUSPECT BUTTON */}
          {ifElse(
            computed(() => authState === "not-found" || authState === "found-not-authenticated"),
            <div style={{
              padding: "16px",
              background: "#fef3c7",
              borderRadius: "8px",
              border: "2px solid #f59e0b",
              marginBottom: "16px"
            }}>
              <h3 style={{ margin: "0 0 12px 0" }}>Google Authentication Required</h3>

              {ifElse(
                computed(() => authState === "not-found"),
                <div>
                  <p style={{ fontSize: "13px", color: "#666", margin: "0 0 12px 0" }}>
                    No Google Auth charm found. Create one to connect to Google Docs.
                  </p>
                  <ct-button
                    variant="primary"
                    onClick={createGoogleAuth({})}
                  >
                    Create Google Auth ⚠️ (May spike CPU)
                  </ct-button>
                  <p style={{ fontSize: "11px", color: "#999", margin: "12px 0 0 0" }}>
                    After signing in, favorite the charm (star icon) to use it across patterns.
                  </p>
                </div>,
                <div>
                  <p style={{ fontSize: "13px", color: "#666", margin: "0 0 12px 0" }}>
                    Found a Google Auth charm but you're not signed in.
                  </p>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <ct-button
                      variant="primary"
                      onClick={goToAuthCharm({ authCharm: wishedAuthCharm })}
                    >
                      Go to Auth Charm
                    </ct-button>
                    <ct-button
                      variant="secondary"
                      onClick={createGoogleAuth({})}
                    >
                      Create New Auth ⚠️
                    </ct-button>
                  </div>
                </div>
              )}
            </div>,
            <div style={{
              padding: "16px",
              background: "#d1fae5",
              borderRadius: "8px",
              border: "1px solid #10b981"
            }}>
              <p style={{ margin: 0, color: "#047857" }}>
                ✅ Authenticated! The button is not shown when auth is working.
              </p>
            </div>
          )}

          {/* Error display */}
          {ifElse(
            computed(() => !!lastError),
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                backgroundColor: "#fef2f2",
                border: "1px solid #ef4444",
                borderRadius: "6px",
                fontSize: "12px",
                color: "#b91c1c",
              }}
            >
              {lastError}
            </div>,
            null
          )}
        </div>
      ),
      testName: "CPU Spike Whittle Test",
    };
  }
);
