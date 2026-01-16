/// <cts-enable />
/**
 * CPU Spike Whittle-Down Test - STEP 2
 *
 * STEP 1 (40+ seconds): Full orchestrator structure with wish() + computed auth states
 * STEP 2 (THIS): Remove wish() entirely - just the button that creates GoogleAuth
 *
 * If this is fast, the problem is the wish() interaction with the handler.
 * If this is also slow, the problem is purely in GoogleAuth instantiation.
 */
import {
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

// Import GoogleAuth pattern for creating new auth charms
import GoogleAuth from "./lib/google-auth.tsx";

// =============================================================================
// Types
// =============================================================================

interface Input {
  // No inputs needed
}

/** CPU Spike Whittle Test Step 2 - No wish(). #cpuSpikeWhittle2 */
interface Output {
  testName: string;
}

// =============================================================================
// Handler - Just creates GoogleAuth, no wish interaction
// =============================================================================

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

// =============================================================================
// Pattern - Minimal, no wish()
// =============================================================================

export default pattern<Input, Output>(
  () => {
    return {
      [NAME]: "CPU Spike Whittle 2 (No Wish)",
      [UI]: (
        <div style={{ padding: "20px", maxWidth: "600px" }}>
          <h2>CPU Spike Whittle - Step 2</h2>

          <p style={{ color: "#666", marginBottom: "16px" }}>
            <strong>No wish()</strong> - Just a button that creates GoogleAuth.
          </p>

          <p style={{ fontSize: "13px", marginBottom: "16px" }}>
            Step 1 (with wish + computed states): <strong>40+ seconds</strong>
          </p>

          <ct-button
            variant="primary"
            onClick={createGoogleAuth({})}
          >
            Create Google Auth (No Wish Test)
          </ct-button>
        </div>
      ),
      testName: "CPU Spike Whittle 2",
    };
  }
);
