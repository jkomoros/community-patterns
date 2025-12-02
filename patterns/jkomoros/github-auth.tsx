/// <cts-enable />
import { Cell, cell, Default, derive, fetchData, handler, ifElse, NAME, pattern, UI } from "commontools";

/**
 * GitHub Personal Access Token Authentication
 *
 * Provides GitHub API authentication for other patterns via wish("#githubAuth").
 * Uses classic tokens with NO scopes for read-only public data access.
 *
 * Setup:
 * 1. Create this charm and enter your GitHub token
 * 2. Favorite it (star icon) to make it discoverable
 * 3. Other patterns can find it via wish("#githubAuth")
 */

// Types for GitHub API responses
interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
  html_url: string;
}

interface GitHubRateLimit {
  resources: {
    core: {
      limit: number;
      remaining: number;
      reset: number;
    };
  };
}

interface Input {
  token?: Default<string, "">;
}

/** GitHub Personal Access Token authentication. #githubAuth */
interface Output {
  token: string;
  isValid: boolean;
  username: string;
  avatarUrl: string;
  rateLimit: {
    remaining: number;
    limit: number;
    resetAt: string;
  };
}

// Handler to save token
const saveToken = handler<
  { detail: { value: string } },
  { token: Cell<string> }
>(({ detail }, { token }) => {
  token.set(detail?.value?.trim() || "");
});

// Handler to clear token
const clearToken = handler<
  unknown,
  { token: Cell<string> }
>((_event, { token }) => {
  token.set("");
});

// GitHub token creation URL
const GITHUB_TOKEN_URL = "https://github.com/settings/tokens/new?description=Common%20Tools%20GitHub%20Access&scopes=";

export default pattern<Input, Output>(({ token }) => {
  // Only fetch when we have a non-empty token
  // This prevents 401 errors when the pattern loads without a token
  const hasToken = derive(token, (t) => !!t && t.length > 0);

  // Fetch user info to validate token
  const userResponse = ifElse(
    hasToken,
    fetchData<GitHubUser>({
      url: "https://api.github.com/user",
      mode: "json",
      options: {
        method: "GET",
        headers: derive(token, (t) => ({
          "Authorization": `Bearer ${t}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        })),
      },
    }),
    null
  );

  // Fetch rate limit info
  const rateLimitResponse = ifElse(
    hasToken,
    fetchData<GitHubRateLimit>({
      url: "https://api.github.com/rate_limit",
      mode: "json",
      options: {
        method: "GET",
        headers: derive(token, (t) => ({
          "Authorization": `Bearer ${t}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        })),
      },
    }),
    null
  );

  // Derive validation status
  const isValid = derive(
    { token, userResponse },
    ({ token, userResponse }) => {
      if (!token) return false;
      if (!userResponse) return false;
      if (userResponse.pending) return false;
      if (userResponse.error) return false;
      return !!userResponse.result?.login;
    }
  );

  // Derive user info
  const username = derive(userResponse, (resp) => resp?.result?.login || "");
  const avatarUrl = derive(userResponse, (resp) => resp?.result?.avatar_url || "");
  const displayName = derive(userResponse, (resp) => resp?.result?.name || resp?.result?.login || "");

  // Derive rate limit info
  const rateLimit = derive(rateLimitResponse, (resp) => {
    const core = resp?.result?.resources?.core;
    if (!core) return { remaining: 0, limit: 0, resetAt: "" };
    const resetDate = new Date(core.reset * 1000);
    return {
      remaining: core.remaining,
      limit: core.limit,
      resetAt: resetDate.toLocaleTimeString(),
    };
  });

  // Check if currently validating
  const isValidating = derive(
    { token, userResponse },
    ({ token, userResponse }) => !!token && userResponse?.pending === true
  );

  // Check for error
  const hasError = derive(
    { token, userResponse },
    ({ token, userResponse }) => {
      if (!token) return false;
      return !!userResponse?.error || (userResponse?.result === null && !userResponse?.pending);
    }
  );

  return {
    [NAME]: "GitHub Auth",
    [UI]: (
      <div style={{ padding: "24px", maxWidth: "600px", fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: "24px" }}>GitHub Authentication</h2>
        <p style={{ margin: "0 0 24px 0", color: "#666", fontSize: "14px" }}>
          Personal Access Token for GitHub API access
        </p>

        {/* Status Section */}
        <div style={{
          padding: "16px",
          borderRadius: "8px",
          marginBottom: "20px",
          backgroundColor: derive(isValid, (v) => v ? "#d4edda" : "#f8f9fa"),
          border: derive(isValid, (v) => v ? "1px solid #28a745" : "1px solid #dee2e6"),
        }}>
          {ifElse(
            isValid,
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <img
                src={avatarUrl}
                alt="GitHub avatar"
                style={{ width: "48px", height: "48px", borderRadius: "50%" }}
              />
              <div>
                <div style={{ fontWeight: "600", fontSize: "16px" }}>{displayName}</div>
                <div style={{ color: "#666", fontSize: "14px" }}>@{username}</div>
                <div style={{ color: "#28a745", fontSize: "13px", marginTop: "4px" }}>
                  Authenticated
                </div>
              </div>
            </div>,
            <div>
              <div style={{ fontWeight: "500", marginBottom: "4px" }}>
                {ifElse(isValidating, "Validating...", "Not authenticated")}
              </div>
              <div style={{ color: "#666", fontSize: "14px" }}>
                {ifElse(
                  hasError,
                  "Invalid token - please check and try again",
                  "Enter your GitHub token below"
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rate Limit Info (only when authenticated) */}
        {ifElse(
          isValid,
          <div style={{
            padding: "12px 16px",
            backgroundColor: "#e3f2fd",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "14px",
          }}>
            <strong>API Rate Limit:</strong>{" "}
            {derive(rateLimit, (r) => `${r.remaining.toLocaleString()} / ${r.limit.toLocaleString()}`)} remaining
            {derive(rateLimit, (r) => r.resetAt ? ` (resets at ${r.resetAt})` : "")}
          </div>,
          null
        )}

        {/* Token Input Section */}
        <div style={{
          padding: "16px",
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
          marginBottom: "20px",
        }}>
          <label style={{ display: "block", fontWeight: "500", marginBottom: "8px" }}>
            Personal Access Token
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <ct-input
              type="password"
              $value={token}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              style={{
                flex: 1,
              }}
            />
            {ifElse(
              hasToken,
              <button
                onClick={clearToken({ token })}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#dc3545",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Clear
              </button>,
              null
            )}
          </div>
        </div>

        {/* Instructions */}
        <details style={{
          padding: "16px",
          backgroundColor: "#fff3cd",
          borderRadius: "8px",
          marginBottom: "20px",
          border: "1px solid #ffc107",
        }}>
          <summary style={{ cursor: "pointer", fontWeight: "500" }}>
            How to create a token
          </summary>
          <ol style={{ marginTop: "12px", paddingLeft: "20px", lineHeight: "1.8" }}>
            <li>
              <a href={GITHUB_TOKEN_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#0366d6" }}>
                Click here to create a new token
              </a>
              {" "}(opens GitHub)
            </li>
            <li>Sign in to GitHub if prompted</li>
            <li>Set a name like "Common Tools GitHub Access"</li>
            <li>
              <strong style={{ color: "#dc3545" }}>
                DO NOT check any scope boxes
              </strong>
              {" "}- no scopes = read-only = safe
            </li>
            <li>Click "Generate token"</li>
            <li>Copy the token and paste it above</li>
          </ol>
          <div style={{
            marginTop: "12px",
            padding: "8px 12px",
            backgroundColor: "#d4edda",
            borderRadius: "4px",
            fontSize: "13px",
          }}>
            A token with no scopes can only read public data. It cannot modify anything.
          </div>
        </details>

        {/* Favorite Reminder (only when authenticated) */}
        {ifElse(
          isValid,
          <div style={{
            padding: "16px",
            backgroundColor: "#d4edda",
            borderRadius: "8px",
            border: "1px solid #28a745",
            fontSize: "14px",
          }}>
            <strong>Favorite this charm</strong> (click the star icon) to share your GitHub auth
            across all your patterns! Any pattern using{" "}
            <code style={{ backgroundColor: "#e9ecef", padding: "2px 6px", borderRadius: "3px" }}>
              wish("#githubAuth")
            </code>{" "}
            will automatically find and use this token.
          </div>,
          null
        )}
      </div>
    ),
    token,
    isValid,
    username,
    avatarUrl: avatarUrl,
    rateLimit,
  };
});
