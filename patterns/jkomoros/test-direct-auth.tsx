/// <cts-enable />
/**
 * Test pattern that takes google-auth as direct input.
 * Bypasses wish() to test userChip in ready state.
 *
 * To test: Link a Google Auth charm's output to this charm's googleAuth input.
 */
import { computed, NAME, pattern, UI } from "commontools";
import type { Auth } from "./google-auth.tsx";

// Define a type for the google-auth charm
interface GoogleAuthCharm {
  auth: Auth;
  userChip?: unknown;
}

interface Input {
  googleAuth?: GoogleAuthCharm;
}

interface Output {}

export default pattern<Input, Output>(({ googleAuth }) => {
  // Check if we have auth
  const hasAuth = computed(() => !!googleAuth?.auth?.token);
  const email = computed(() => googleAuth?.auth?.user?.email || "(no email)");

  return {
    [NAME]: "Test Direct Auth",
    [UI]: (
      <div style={{ padding: "20px", maxWidth: "600px" }}>
        <h2>Direct Auth Test</h2>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Link a Google Auth charm to this charm's <code>googleAuth</code> input to test userChip.
        </p>

        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
            Has Auth:
          </h3>
          <div style={{
            padding: "12px",
            backgroundColor: hasAuth ? "#d1fae5" : "#fee2e2",
            borderRadius: "8px"
          }}>
            {hasAuth ? "✅ Yes" : "❌ No - Please link a Google Auth charm"}
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
            Email from auth:
          </h3>
          <div style={{ padding: "12px", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
            {email}
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
            userChip from google-auth:
          </h3>
          <div style={{
            padding: "12px",
            backgroundColor: "#e0f2fe",
            borderRadius: "8px",
            border: "2px solid #0ea5e9"
          }}>
            {googleAuth?.userChip || <span style={{ color: "#6b7280" }}>No userChip (link a Google Auth charm)</span>}
          </div>
        </div>

        <div style={{
          padding: "16px",
          backgroundColor: "#fef3c7",
          borderRadius: "8px",
          fontSize: "13px"
        }}>
          <strong>How to test:</strong>
          <ol style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
            <li>Open the charm editor (click the bug icon 🪲)</li>
            <li>Find the <code>googleAuth</code> input</li>
            <li>Link it to your Google Auth charm</li>
            <li>The userChip should appear above</li>
          </ol>
        </div>
      </div>
    ),
  };
});
