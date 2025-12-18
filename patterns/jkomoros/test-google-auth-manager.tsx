/// <cts-enable />
/**
 * Test pattern for google-auth-manager utility
 *
 * Tests:
 * - Multiple required scopes (gmail, drive, calendar)
 * - Token expiry detection
 * - Missing scopes detection
 * - State display
 */
import { derive, NAME, pattern, UI } from "commontools";
import { useGoogleAuth, SCOPE_DESCRIPTIONS, type ScopeKey } from "./util/google-auth-manager.tsx";

interface Input {}
interface Output {}

export default pattern<Input, Output>(() => {
  // Request multiple scopes to test missing scopes detection
  const { authInfo, fullUI, statusUI } = useGoogleAuth({
    requiredScopes: ["gmail", "drive", "calendar"],
  });

  // Format token expiry for display - use derive() for reactive property access
  const tokenExpiryDisplay = derive(authInfo, (info) => {
    if (!info.tokenExpiresAt) return "No token";
    const expiresAt = new Date(info.tokenExpiresAt);
    const diff = info.tokenExpiresAt - Date.now();
    const mins = Math.round(diff / 60000);
    return `${expiresAt.toLocaleTimeString()} (${mins > 0 ? `${mins}min remaining` : "EXPIRED"})`;
  });

  // Format missing scopes for display - use derive() for reactive property access
  const missingScopesDisplay = derive(authInfo, (info) => {
    if (info.missingScopes.length === 0) return "None";
    return info.missingScopes
      .map((k: ScopeKey) => SCOPE_DESCRIPTIONS[k])
      .join(", ");
  });

  // Boolean displays - use derive() for reactive property access
  const hasRequiredScopesDisplay = derive(authInfo, (info) =>
    info.hasRequiredScopes ? "✅ Yes" : "❌ No"
  );
  const isTokenExpiredDisplay = derive(authInfo, (info) =>
    info.isTokenExpired ? "⚠️ Yes" : "✅ No"
  );

  return {
    [NAME]: "Test Google Auth Manager",
    [UI]: (
      <div style={{ padding: "20px", maxWidth: "600px" }}>
        <h2>Google Auth Manager Test</h2>

        {/* Full UI - handles all states */}
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
            Full UI Component:
          </h3>
          {fullUI}
        </div>

        {/* Status UI - minimal indicator */}
        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
            Status UI Component:
          </h3>
          {statusUI}
        </div>

        {/* Debug info */}
        <div
          style={{
            padding: "16px",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
            fontSize: "13px",
            fontFamily: "monospace",
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", fontSize: "14px" }}>
            Auth State Debug:
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: "bold" }}>State:</td>
                <td style={{ padding: "4px 8px" }}>{authInfo.state}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: "bold" }}>Email:</td>
                <td style={{ padding: "4px 8px" }}>{authInfo.email || "(none)"}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: "bold" }}>Has Required Scopes:</td>
                <td style={{ padding: "4px 8px" }}>{hasRequiredScopesDisplay}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: "bold" }}>Missing Scopes:</td>
                <td style={{ padding: "4px 8px" }}>{missingScopesDisplay}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: "bold" }}>Token Expired:</td>
                <td style={{ padding: "4px 8px" }}>{isTokenExpiredDisplay}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: "bold" }}>Token Expires:</td>
                <td style={{ padding: "4px 8px" }}>{tokenExpiryDisplay}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: "bold" }}>Status Dot Color:</td>
                <td style={{ padding: "4px 8px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: authInfo.statusDotColor,
                      marginRight: "8px",
                    }}
                  />
                  {authInfo.statusDotColor}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: "bold" }}>Status Text:</td>
                <td style={{ padding: "4px 8px" }}>{authInfo.statusText}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    ),
  };
});
