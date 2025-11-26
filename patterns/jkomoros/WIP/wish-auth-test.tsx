/// <cts-enable />
/**
 * WISH AUTH TEST
 *
 * Minimal test pattern to verify the wish() + favorites system works
 * for discovering a shared Google Auth charm.
 *
 * Test workflow:
 * 1. Deploy this pattern - should show "No auth found" message
 * 2. Deploy gmail-auth.tsx in any space, authenticate, and favorite it
 * 3. Refresh this pattern - should now find and display the auth
 */
import { Default, derive, NAME, pattern, UI, wish } from "commontools";

// The Auth type we expect from gmail-auth
type Auth = {
  token: Default<string, "">;
  tokenType: Default<string, "">;
  scope: Default<string[], []>;
  expiresIn: Default<number, 0>;
  expiresAt: Default<number, 0>;
  refreshToken: Default<string, "">;
  user: Default<{
    email: string;
    name: string;
    picture: string;
  }, { email: ""; name: ""; picture: "" }>;
};

// What we expect the gmail-auth charm to look like
type GoogleAuthCharm = {
  auth: Auth;
};

export default pattern<Record<string, never>>((_) => {
  // Wish for a charm tagged with #googleAuth
  const wishResult = wish<GoogleAuthCharm>({ tag: "#googleAuth" });

  // Extract auth data from the wish result
  const auth = derive(wishResult, (wr) => wr?.result?.auth);
  const userEmail = derive(auth, (a) => a?.user?.email || "");
  const hasAuth = derive(userEmail, (email) => email !== "");
  const wishError = derive(wishResult, (wr) => wr?.error);

  return {
    [NAME]: "Wish Auth Test",
    [UI]: (
      <div style={{ padding: "20px", maxWidth: "600px" }}>
        <h2 style={{ marginTop: 0 }}>Wish Auth Test</h2>

        <div style={{
          padding: "15px",
          borderRadius: "8px",
          marginBottom: "20px",
          backgroundColor: derive(hasAuth, (has) => has ? "#d4edda" : "#fff3cd"),
          border: derive(hasAuth, (has) => has ? "1px solid #c3e6cb" : "1px solid #ffeeba"),
        }}>
          <h3 style={{ margin: "0 0 10px 0" }}>
            Status: {derive(hasAuth, (has) => has ? "✅ Auth Found!" : "⚠️ No Auth Found")}
          </h3>

          {derive(hasAuth, (has) => has ? (
            <div>
              <p><strong>Email:</strong> {userEmail}</p>
              <p><strong>Name:</strong> {derive(auth, (a) => a?.user?.name || "N/A")}</p>
              <p><strong>Has Token:</strong> {derive(auth, (a) => a?.token ? "Yes" : "No")}</p>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: "10px" }}>
                No Google Auth charm found via wish.
              </p>
              {derive(wishError, (err) => err ? (
                <p style={{ color: "#856404" }}>
                  <strong>Error:</strong> {err}
                </p>
              ) : null)}
              <div style={{
                padding: "12px",
                backgroundColor: "#e7f3ff",
                borderRadius: "6px",
                border: "1px solid #b6d4fe",
              }}>
                <strong>To fix:</strong>
                <ol style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                  <li>Deploy a <code>gmail-auth.tsx</code> pattern</li>
                  <li>Authenticate with Google</li>
                  <li>Click the ⭐ star button to favorite it</li>
                  <li>Come back here - it should find your auth!</li>
                </ol>
              </div>
            </div>
          ))}
        </div>

        <details>
          <summary style={{ cursor: "pointer", marginBottom: "10px" }}>
            Debug: Raw Wish Result
          </summary>
          <pre style={{
            backgroundColor: "#f5f5f5",
            padding: "10px",
            borderRadius: "4px",
            overflow: "auto",
            fontSize: "12px",
          }}>
            {derive(wishResult, (wr) => JSON.stringify(wr, null, 2))}
          </pre>
        </details>

        <div style={{ marginTop: "20px", fontSize: "14px", color: "#666" }}>
          <p>
            This pattern uses <code>wish(&lbrace; tag: "#googleAuth" &rbrace;)</code> to
            discover a favorited Google Auth charm across any space.
          </p>
        </div>
      </div>
    ),
  };
});
