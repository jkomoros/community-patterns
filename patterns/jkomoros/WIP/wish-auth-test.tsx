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
  const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });

  derive(wishResult, (wr) => console.log("wishResult", wr));

  // Derive all state from wishResult in a single derive to avoid loops
  // Three states:
  // 1. "not-found" - wishError exists and no result
  // 2. "found-not-authenticated" - result exists but no email
  // 3. "authenticated" - result exists with email
  const authState = derive(wishResult, (wr) => {
    const email = wr?.result?.auth?.user?.email || "";
    if (email !== "") return "authenticated";
    if (wr?.result) return "found-not-authenticated";
    if (wr?.error) return "not-found";
    return "loading";
  });

  // For display purposes
  const userEmail = derive(wishResult, (wr) => wr?.result?.auth?.user?.email || "");
  const userName = derive(wishResult, (wr) => wr?.result?.auth?.user?.name || "N/A");
  const hasToken = derive(wishResult, (wr) => wr?.result?.auth?.token ? "Yes" : "No");
  const wishError = derive(wishResult, (wr) => wr?.error);
  const wishUI = derive(wishResult, (wr) => wr?.$UI);

  return {
    [NAME]: "Wish Auth Test",
    [UI]: (
      <div style={{ padding: "20px", maxWidth: "600px" }}>
        <h2 style={{ marginTop: 0 }}>Wish Auth Test</h2>

        {wishResult}

        {/* State-based UI */}
        {derive(authState, (state) => {
          if (state === "loading") {
            return (
              <div style={{
                padding: "15px",
                borderRadius: "8px",
                backgroundColor: "#f8f9fa",
                border: "1px solid #dee2e6",
              }}>
                <p>Loading...</p>
              </div>
            );
          }

          if (state === "authenticated") {
            // State 3: Fully authenticated
            return (
              <div style={{
                padding: "15px",
                borderRadius: "8px",
                backgroundColor: "#d4edda",
                border: "1px solid #c3e6cb",
              }}>
                <h3 style={{ margin: "0 0 10px 0" }}>Status: Authenticated</h3>
                <p><strong>Email:</strong> {userEmail}</p>
                <p><strong>Name:</strong> {userName}</p>
                <p><strong>Has Token:</strong> {hasToken}</p>
              </div>
            );
          }

          if (state === "found-not-authenticated") {
            // State 2: Charm found but not authenticated - show inline auth UI
            return (
              <div style={{
                padding: "15px",
                borderRadius: "8px",
                backgroundColor: "#fff3cd",
                border: "1px solid #ffeeba",
              }}>
                <h3 style={{ margin: "0 0 10px 0" }}>Status: Auth Charm Found (Not Logged In)</h3>
                <p style={{ marginBottom: "15px" }}>
                  Found your Gmail Auth charm, but you're not logged in yet. Authenticate below:
                </p>
                <div style={{
                  padding: "10px",
                  backgroundColor: "#fff",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                }}>
                  {wishUI}
                </div>
              </div>
            );
          }

          // State 1: Not found
          return (
            <div style={{
              padding: "15px",
              borderRadius: "8px",
              backgroundColor: "#f8d7da",
              border: "1px solid #f5c6cb",
            }}>
              <h3 style={{ margin: "0 0 10px 0" }}>Status: No Auth Charm Found</h3>
              {derive(wishError, (err) => err ? (
                <p style={{ color: "#721c24", marginBottom: "10px" }}>
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
                  <li>Click the star button to favorite it</li>
                  <li>Come back here - you'll be able to authenticate inline!</li>
                </ol>
              </div>
            </div>
          );
        })}

        <details style={{ marginTop: "20px" }}>
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
            This pattern uses <code>wish(&lbrace; query: "#googleAuth" &rbrace;)</code> to
            discover a favorited Google Auth charm. It shows three states:
          </p>
          <ol>
            <li><strong>Not Found</strong> - No favorited auth charm</li>
            <li><strong>Found (Not Logged In)</strong> - Auth charm found, renders inline for login</li>
            <li><strong>Authenticated</strong> - Fully working with token</li>
          </ol>
        </div>
      </div>
    ),
  };
});
