/// <cts-enable />
/**
 * Simple test pattern for userChip verification.
 * Links directly to a google-auth charm to bypass wish picker.
 */
import { NAME, pattern, UI } from "commontools";
import { createGoogleAuth, type ScopeKey } from "./util/google-auth-manager.tsx";

interface Input {}
interface Output {}

export default pattern<Input, Output>(() => {
  // Use createGoogleAuth with gmail scope
  const { authInfo, fullUI, isReady, currentEmail } = createGoogleAuth({
    requiredScopes: ["gmail"] as ScopeKey[],
  });

  return {
    [NAME]: "Test userChip",
    [UI]: (
      <div style={{ padding: "20px", maxWidth: "600px" }}>
        <h2>userChip Test</h2>

        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
            Full UI (should show userChip in ready state):
          </h3>
          {fullUI}
        </div>

        <div style={{
          padding: "16px",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          fontSize: "13px"
        }}>
          <p><strong>isReady:</strong> {isReady ? "true" : "false"}</p>
          <p><strong>currentEmail:</strong> {currentEmail || "(none)"}</p>
          <p><strong>State:</strong> {authInfo.state}</p>
        </div>
      </div>
    ),
  };
});
