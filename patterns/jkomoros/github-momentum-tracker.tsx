/// <cts-enable />
import {
  Cell,
  cell,
  computed,
  Default,
  derive,
  fetchData,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";
import GitHubAuth from "./github-auth.tsx";

/**
 * GitHub Momentum Tracker
 *
 * Track the "momentum" of GitHub repositories by visualizing:
 * - Star growth over time (sparklines)
 * - Second derivative detection (accelerating vs decelerating)
 * - Commit activity (bar charts)
 *
 * Designed for tracking 20+ repos at a glance.
 */

// =============================================================================
// TYPES
// =============================================================================

interface RepoReference {
  owner: string;
  repo: string;
  fullName: string; // "owner/repo"
}

interface GitHubRepoMetadata {
  id: number;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string;
  pushed_at: string;
  html_url: string;
}

interface CommitActivityWeek {
  week: number; // Unix timestamp
  total: number;
  days: number[];
}

interface Input {
  repos?: Default<string[], []>; // List of "owner/repo" strings
  authCharm?: Cell<{ token: string }>; // Optional linked auth charm
}

interface Output {
  repos: Cell<string[]>;
}

// =============================================================================
// URL PARSING
// =============================================================================

/**
 * Best-effort parsing of GitHub URLs/references
 * Accepts:
 * - https://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo
 * - [name](https://github.com/owner/repo) (markdown)
 */
function parseGitHubUrl(input: string | unknown): RepoReference | null {
  // Handle case where input might be a Cell or non-string
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try markdown link format: [text](url)
  const markdownMatch = trimmed.match(/\[.*?\]\((https?:\/\/github\.com\/([^/]+)\/([^/)]+))\)/);
  if (markdownMatch) {
    const [, , owner, repo] = markdownMatch;
    return { owner, repo, fullName: `${owner}/${repo}` };
  }

  // Try full URL: https://github.com/owner/repo or github.com/owner/repo
  const urlMatch = trimmed.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (urlMatch) {
    const [, owner, repo] = urlMatch;
    const cleanRepo = repo.replace(/\.git$/, "");
    return { owner, repo: cleanRepo, fullName: `${owner}/${cleanRepo}` };
  }

  // Try simple owner/repo format
  const simpleMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simpleMatch) {
    const [, owner, repo] = simpleMatch;
    return { owner, repo, fullName: `${owner}/${repo}` };
  }

  return null;
}

/**
 * Parse multiple URLs from text (newline or comma separated)
 */
function parseMultipleUrls(text: string): RepoReference[] {
  const lines = text.split(/[\n,]+/);
  const results: RepoReference[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const parsed = parseGitHubUrl(line);
    if (parsed && !seen.has(parsed.fullName)) {
      seen.add(parsed.fullName);
      results.push(parsed);
    }
  }

  return results;
}

// =============================================================================
// HANDLERS
// =============================================================================

const addRepos = handler<
  unknown,
  { repos: Cell<string[]>; inputText: Cell<string> }
>((_event, { repos, inputText }) => {
  const text = inputText.get();
  const parsed = parseMultipleUrls(text);
  const current = repos.get();
  const currentSet = new Set(current);

  const newRepos = parsed
    .map((r) => r.fullName)
    .filter((r) => !currentSet.has(r));

  if (newRepos.length > 0) {
    repos.set([...current, ...newRepos]);
  }
  inputText.set("");
});

const removeRepo = handler<
  unknown,
  { repos: Cell<string[]>; repoName: Cell<string> | string }
>((_event, { repos, repoName }) => {
  const current = repos.get();
  // Handle both Cell<string> and plain string
  const nameToRemove = typeof repoName === "string" ? repoName : (repoName as any).get?.() || repoName;
  repos.set(current.filter((r) => r !== nameToRemove));
});

const clearAllRepos = handler<
  unknown,
  { repos: Cell<string[]> }
>((_event, { repos }) => {
  repos.set([]);
});

// =============================================================================
// GITHUB API HELPERS
// =============================================================================

function makeGitHubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// =============================================================================
// PATTERN
// =============================================================================

export default pattern<Input, Output>(({ repos, authCharm }) => {
  // Internal state
  const inputText = cell<string>("");

  // ==========================================================================
  // Authentication
  // ==========================================================================

  // Try to find existing GitHub auth via wish
  const discoveredAuth = wish<{ token: string }>("#githubAuth");

  // Use discovered auth, or passed-in auth
  // Note: wish returns Cell values, so we access properties directly in derive
  const effectiveToken = derive(
    { discovered: discoveredAuth, passed: authCharm },
    ({ discovered, passed }: { discovered: { token: string } | null; passed: { token: string } | null }) => {
      if (discovered?.token) return discovered.token;
      if (passed?.token) return passed.token;
      return "";
    }
  );

  const hasAuth = derive(effectiveToken, (t) => !!t);

  // Inline auth for when no token is available
  const inlineAuth = GitHubAuth({});

  // ==========================================================================
  // Repo Data Fetching
  // ==========================================================================

  // Map over the repos cell array using the "dumb map approach"
  // Each repo string gets its own processing pipeline
  const repoDataList = repos.map((repoNameCell) => {
    // Parse the repo name to get owner/repo
    const ref = derive(repoNameCell, (name) => parseGitHubUrl(name));
    const apiUrl = derive(ref, (r) => r ? `https://api.github.com/repos/${r.owner}/${r.repo}` : "");

    // Only fetch if we have auth and a valid URL
    const shouldFetch = derive({ hasAuth, apiUrl }, ({ hasAuth, apiUrl }) => hasAuth && !!apiUrl);

    const metadata = ifElse(
      shouldFetch,
      fetchData<GitHubRepoMetadata>({
        url: apiUrl,
        mode: "json",
        options: {
          method: "GET",
          headers: derive(effectiveToken, (t) => makeGitHubHeaders(t)),
        },
      }),
      null
    );

    return { repoName: repoNameCell, ref, metadata };
  });

  // Count repos
  const repoCount = derive(repos, (list) => list.length);

  // ==========================================================================
  // UI
  // ==========================================================================

  return {
    [NAME]: "GitHub Momentum Tracker",
    [UI]: (
      <div style={{ padding: "24px", maxWidth: "1200px", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "28px" }}>GitHub Momentum Tracker</h1>
        <p style={{ margin: "0 0 24px 0", color: "#666" }}>
          Track star growth and commit activity across repositories
        </p>

        {/* Auth Status / Inline Auth */}
        {ifElse(
          hasAuth,
          <div style={{
            padding: "12px 16px",
            backgroundColor: "#d4edda",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}>
            <span style={{ color: "#28a745", fontWeight: "500" }}>Authenticated</span>
            <span style={{ color: "#666", fontSize: "14px" }}>
              (via {derive(discoveredAuth, (d) => d?.token ? "wish" : "linked charm")})
            </span>
          </div>,
          <div style={{
            padding: "16px",
            backgroundColor: "#fff3cd",
            borderRadius: "8px",
            marginBottom: "20px",
            border: "1px solid #ffc107",
          }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>
              GitHub Authentication Required
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#666" }}>
              To track repositories, you need a GitHub token. You can either:
            </p>
            <ul style={{ margin: "0 0 16px 0", paddingLeft: "20px", fontSize: "14px" }}>
              <li>Create a GitHub Auth charm separately and favorite it</li>
              <li>Or enter your token below:</li>
            </ul>
            {inlineAuth}
          </div>
        )}

        {/* Repo Input Section */}
        <div style={{
          padding: "16px",
          backgroundColor: "#f8f9fa",
          borderRadius: "8px",
          marginBottom: "24px",
        }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Add Repositories</h3>
          <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#666" }}>
            Paste GitHub URLs or owner/repo references (one per line or comma-separated)
          </p>
          <textarea
            value={inputText}
            placeholder="anthropics/claude-code
https://github.com/facebook/react
owner/repo"
            style={{
              width: "100%",
              minHeight: "80px",
              padding: "12px",
              border: "1px solid #dee2e6",
              borderRadius: "6px",
              fontSize: "14px",
              fontFamily: "monospace",
              resize: "vertical",
              boxSizing: "border-box",
            }}
            onChange={(e: any) => inputText.set(e.target.value)}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button
              onClick={addRepos({ repos, inputText })}
              style={{
                padding: "8px 16px",
                backgroundColor: "#0366d6",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Add Repositories
            </button>
            {ifElse(
              derive(repoCount, (c) => c > 0),
              <button
                onClick={clearAllRepos({ repos })}
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
                Clear All
              </button>,
              null
            )}
          </div>
        </div>

        {/* Repo Count */}
        <div style={{ marginBottom: "16px", fontSize: "14px", color: "#666" }}>
          Tracking {repoCount} {derive(repoCount, (c) => c === 1 ? "repository" : "repositories")}
        </div>

        {/* Repo List */}
        {ifElse(
          derive(repoCount, (c) => c === 0),
          <div style={{
            padding: "40px",
            textAlign: "center",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
            color: "#666",
          }}>
            <p style={{ margin: "0 0 8px 0", fontSize: "16px" }}>No repositories added yet</p>
            <p style={{ margin: "0", fontSize: "14px" }}>
              Add some GitHub repos above to start tracking their momentum
            </p>
          </div>,
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {repoDataList.map((item) => {
              const metadata = item.metadata;
              const repoName = item.repoName; // This is a Cell<string>
              const isLoading = derive(metadata, (m) => m?.pending === true);
              const hasError = derive(metadata, (m) => !!m?.error);
              const data = derive(metadata, (m) => m?.result);

              // Build href - use data.html_url if available, else construct from repoName
              const repoHref = derive(
                { data, repoName },
                ({ data, repoName }) => data?.html_url || `https://github.com/${repoName}`
              );

              return (
                <div style={{
                  padding: "16px",
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  backgroundColor: "white",
                }}>
                  {/* Header Row */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "12px",
                  }}>
                    <div>
                      <a
                        href={repoHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "18px",
                          fontWeight: "600",
                          color: "#0366d6",
                          textDecoration: "none",
                        }}
                      >
                        {repoName}
                      </a>
                      {ifElse(
                        data,
                        <p style={{
                          margin: "4px 0 0 0",
                          fontSize: "14px",
                          color: "#666",
                          maxWidth: "600px",
                        }}>
                          {derive(data, (d) => d?.description || "No description")}
                        </p>,
                        null
                      )}
                    </div>
                    <button
                      onClick={removeRepo({ repos, repoName })}
                      style={{
                        padding: "4px 8px",
                        backgroundColor: "transparent",
                        color: "#dc3545",
                        border: "1px solid #dc3545",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  {/* Stats Row */}
                  {ifElse(
                    isLoading,
                    <div style={{ color: "#666", fontSize: "14px" }}>Loading...</div>,
                    ifElse(
                      hasError,
                      <div style={{ color: "#dc3545", fontSize: "14px" }}>
                        Error loading repo data
                      </div>,
                      <div style={{ display: "flex", gap: "24px", fontSize: "14px" }}>
                        <div>
                          <span style={{ color: "#666" }}>Stars: </span>
                          <strong>{derive(data, (d) => d?.stargazers_count?.toLocaleString() || "—")}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#666" }}>Forks: </span>
                          <strong>{derive(data, (d) => d?.forks_count?.toLocaleString() || "—")}</strong>
                        </div>
                        <div>
                          <span style={{ color: "#666" }}>Language: </span>
                          <strong>{derive(data, (d) => d?.language || "—")}</strong>
                        </div>
                      </div>
                    )
                  )}

                  {/* Placeholder for sparkline and momentum indicator */}
                  <div style={{
                    marginTop: "12px",
                    padding: "20px",
                    backgroundColor: "#f8f9fa",
                    borderRadius: "6px",
                    textAlign: "center",
                    color: "#999",
                    fontSize: "13px",
                  }}>
                    [Sparkline and momentum indicator coming soon]
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),
    repos,
  };
});
