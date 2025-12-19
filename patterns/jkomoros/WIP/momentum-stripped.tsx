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

// Star history types (for star-history.com sampling approach)
interface StargazerWithDate {
  starred_at: string;
  user: { login: string };
}

interface StarDataPoint {
  date: string; // ISO date
  count: number; // Approximate star count at that date
}

interface MomentumAnalysis {
  trend: "accelerating" | "steady" | "decelerating" | "unknown";
  recentAvg: number; // Average commits per week (last 4 weeks)
  olderAvg: number; // Average commits per week (weeks 5-12)
  changePercent: number; // Percentage change
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

// Special headers for stargazers with timestamp (star-history.com approach)
function makeStargazerHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3.star+json", // Returns starred_at timestamp
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * Calculate sample page numbers for star history (star-history.com approach)
 * Returns 10 evenly distributed page numbers from 1 to totalPages
 */
function getSamplePageNumbers(totalStars: number): number[] {
  const totalPages = Math.ceil(totalStars / 100);
  if (totalPages <= 10) {
    // Fetch all pages if < 10
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  // Evenly distributed sample: 1, p/10, 2p/10, ..., p
  const pages: number[] = [];
  for (let i = 0; i < 10; i++) {
    const page = Math.max(1, Math.floor((i * totalPages) / 9));
    if (!pages.includes(page)) {
      pages.push(page);
    }
  }
  // Ensure we have page 1 and last page
  if (!pages.includes(1)) pages.unshift(1);
  if (!pages.includes(totalPages)) pages.push(totalPages);
  return pages.slice(0, 10);
}

// =============================================================================
// MOMENTUM CALCULATION
// =============================================================================

/**
 * Analyze commit activity to determine momentum trend
 * Compares recent 4 weeks to prior 8 weeks
 */
function calculateMomentum(weeks: CommitActivityWeek[] | null | undefined): MomentumAnalysis {
  if (!weeks || weeks.length < 12) {
    return { trend: "unknown", recentAvg: 0, olderAvg: 0, changePercent: 0 };
  }

  // Get last 12 weeks (most recent at end of array)
  const last12 = weeks.slice(-12);
  const recent4 = last12.slice(-4);
  const older8 = last12.slice(0, 8);

  const recentAvg = recent4.reduce((sum, w) => sum + w.total, 0) / 4;
  const olderAvg = older8.reduce((sum, w) => sum + w.total, 0) / 8;

  // Avoid division by zero
  if (olderAvg === 0) {
    return {
      trend: recentAvg > 0 ? "accelerating" : "steady",
      recentAvg,
      olderAvg,
      changePercent: recentAvg > 0 ? 100 : 0,
    };
  }

  const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

  // Threshold: >20% increase = accelerating, >20% decrease = decelerating
  let trend: MomentumAnalysis["trend"] = "steady";
  if (changePercent > 20) trend = "accelerating";
  else if (changePercent < -20) trend = "decelerating";

  return { trend, recentAvg, olderAvg, changePercent };
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

  // Inline auth for when no token is available
  const inlineAuth = GitHubAuth({});

  // Use discovered auth, passed-in auth, or inline auth
  // IMPORTANT: derive() with object params does NOT auto-unwrap cells!
  // Must call .get() on each value (see community-docs/folk_wisdom/derive-object-parameter-cell-unwrapping.md)
  const effectiveToken = derive(
    { discovered: discoveredAuth, passed: authCharm, inline: inlineAuth.token },
    (values) => {
      // Safe unwrapping that handles both Cell and plain values
      const discovered = (values.discovered as any)?.get
        ? (values.discovered as any).get()
        : values.discovered;
      const passed = (values.passed as any)?.get
        ? (values.passed as any).get()
        : values.passed;
      const inline = (values.inline as any)?.get
        ? (values.inline as any).get()
        : values.inline;

      if (discovered?.token) return discovered.token;
      if (passed?.token) return passed.token;
      if (inline) return inline;
      return "";
    }
  );

  const hasAuth = derive(effectiveToken, (t) => !!t);

  // ==========================================================================
  // Repo Data Fetching
  // ==========================================================================

  // Map over the repos cell array using the "dumb map approach"
  // Each repo string gets its own processing pipeline
  const repoDataList = repos.map((repoNameCell) => {
    // Parse the repo name to get owner/repo
    const ref = derive(repoNameCell, (name) => parseGitHubUrl(name));

    // Derive URLs that return empty string when no auth OR no valid ref
    // (fetchData skips fetch when URL is empty - see community-docs superstition)
    // NOTE: derive() with object params doesn't auto-unwrap cells - must use .get()
    const apiUrl = derive(
      { hasAuth, ref },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const r = (values.ref as any)?.get ? (values.ref as any).get() : values.ref;
        return (auth && r) ? `https://api.github.com/repos/${r.owner}/${r.repo}` : "";
      }
    );

    const commitActivityUrl = derive(
      { hasAuth, ref },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const r = (values.ref as any)?.get ? (values.ref as any).get() : values.ref;
        return (auth && r) ? `https://api.github.com/repos/${r.owner}/${r.repo}/stats/commit_activity` : "";
      }
    );

    // Fetch repo metadata (skipped when URL is empty)
    const metadata = fetchData<GitHubRepoMetadata>({
      url: apiUrl,
      mode: "json",
      options: {
        method: "GET",
        headers: derive(effectiveToken, (t) => makeGitHubHeaders(t)),
      },
    });

    // Fetch commit activity (skipped when URL is empty)
    const commitActivity = fetchData<CommitActivityWeek[]>({
      url: commitActivityUrl,
      mode: "json",
      options: {
        method: "GET",
        headers: derive(effectiveToken, (t) => makeGitHubHeaders(t)),
      },
    });

    // ==========================================================================
    // Star History Sampling - Step 3: ALL 10 fetchData slots
    // ==========================================================================

    // Derive sample page numbers directly from metadata (single derive, no chain)
    const samplePages = derive(
      { hasAuth, parsedRef: ref, metadata },
      (values) => {
        const auth = (values.hasAuth as any)?.get ? (values.hasAuth as any).get() : values.hasAuth;
        const r = (values.parsedRef as any)?.get ? (values.parsedRef as any).get() : values.parsedRef;
        const m = (values.metadata as any)?.get ? (values.metadata as any).get() : values.metadata;

        if (!auth || !r || !m?.result?.stargazers_count) {
          return { owner: "", repo: "", pages: [] as number[] };
        }

        const totalStars = m.result.stargazers_count;
        return {
          owner: r.owner,
          repo: r.repo,
          pages: getSamplePageNumbers(totalStars),
        };
      }
    );

    // Create a function that returns URL for a given slot index
    const makeSlotUrl = (slotIndex: number) =>
      derive(samplePages, (sp) => {
        if (!sp.owner || !sp.repo || slotIndex >= sp.pages.length) return "";
        const page = sp.pages[slotIndex];
        return `https://api.github.com/repos/${sp.owner}/${sp.repo}/stargazers?per_page=1&page=${page}`;
      });

    // Create 10 explicit fetchData slots for star samples
    const starSample0 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(0),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });
    const starSample1 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(1),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });
    const starSample2 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(2),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });
    const starSample3 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(3),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });
    const starSample4 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(4),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });
    const starSample5 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(5),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });
    const starSample6 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(6),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });
    const starSample7 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(7),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });
    const starSample8 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(8),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });
    const starSample9 = fetchData<StargazerWithDate[]>({
      url: makeSlotUrl(9),
      mode: "json",
      options: { method: "GET", headers: derive(effectiveToken, (t) => makeStargazerHeaders(t)) },
    });

    // Aggregate star history from all samples
    const starHistory = derive(
      {
        samplePages,
        s0: starSample0, s1: starSample1, s2: starSample2, s3: starSample3, s4: starSample4,
        s5: starSample5, s6: starSample6, s7: starSample7, s8: starSample8, s9: starSample9,
      },
      (values) => {
        const sp = (values.samplePages as any)?.get ? (values.samplePages as any).get() : values.samplePages;
        if (!sp.pages || sp.pages.length === 0) return { loading: false, data: [] as StarDataPoint[] };

        const samples = [
          values.s0, values.s1, values.s2, values.s3, values.s4,
          values.s5, values.s6, values.s7, values.s8, values.s9,
        ];

        // Check if any are still loading
        const pending = samples.some((s, i) => {
          if (i >= sp.pages.length) return false;
          const sample = (s as any)?.get ? (s as any).get() : s;
          return sample?.pending === true;
        });

        if (pending) return { loading: true, data: [] as StarDataPoint[] };

        // Collect results
        const dataPoints: StarDataPoint[] = [];
        for (let i = 0; i < sp.pages.length && i < 10; i++) {
          const sample = (samples[i] as any)?.get ? (samples[i] as any).get() : samples[i];
          const result = sample?.result;
          if (result && result.length > 0 && result[0]?.starred_at) {
            // Star count at this page = (page - 1) * 100 (approximation)
            const pageNum = sp.pages[i];
            dataPoints.push({
              date: result[0].starred_at.split("T")[0], // Just the date part
              count: (pageNum - 1) * 100,
            });
          }
        }

        // Sort by date
        dataPoints.sort((a, b) => a.date.localeCompare(b.date));

        return { loading: false, data: dataPoints };
      }
    );

    return { repoName: repoNameCell, ref, metadata, commitActivity, samplePages, starHistory };
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
          <ct-input
            $value={inputText}
            placeholder="anthropics/claude-code, facebook/react, owner/repo"
            style={{
              width: "100%",
            }}
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
              const repoName = item.repoName;
              const starHistory = item.starHistory;  // ADD THIS - access starHistory
              // deno-lint-ignore no-explicit-any
              const isLoading = derive(metadata, (m: any) => m?.pending === true);
              // deno-lint-ignore no-explicit-any
              const hasError = derive(metadata, (m: any) => !!m?.error);
              const data = derive(metadata, (m) => m?.result);

              return (
                <div style={{
                  padding: "16px",
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  backgroundColor: "white",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <a
                        href={derive({ data, repoName }, ({ data, repoName }) => data?.html_url || `https://github.com/${repoName}`)}
                        target="_blank"
                        style={{ fontSize: "18px", fontWeight: "600", color: "#0366d6" }}
                      >
                        {repoName}
                      </a>
                      <div style={{ fontSize: "14px", color: "#666", marginTop: "4px" }}>
                        {derive(data, (d) => d?.description || "No description")}
                      </div>
                    </div>
                    <button
                      onClick={removeRepo({ repos, repoName })}
                      style={{ padding: "4px 8px", color: "#dc3545", border: "1px solid #dc3545", borderRadius: "4px", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                  {ifElse(
                    isLoading,
                    <div style={{ marginTop: "8px" }}>Loading...</div>,
                    ifElse(
                      hasError,
                      <div style={{ marginTop: "8px", color: "#dc3545" }}>Error loading data</div>,
                      <div style={{ marginTop: "8px" }}>
                        <div style={{ display: "flex", gap: "16px" }}>
                          <span>Stars: <strong>{derive(data, (d) => d?.stargazers_count?.toLocaleString() || "—")}</strong></span>
                          <span>Forks: <strong>{derive(data, (d) => d?.forks_count?.toLocaleString() || "—")}</strong></span>
                          <span>Language: <strong>{derive(data, (d) => d?.language || "—")}</strong></span>
                        </div>
                        {/* ADD: UI that accesses starHistory.loading and starHistory.data */}
                        <div style={{ marginTop: "8px", fontSize: "12px", color: "#666" }}>
                          Star History: {derive(starHistory, (sh) => {
                            if (!sh) return "Loading...";
                            return sh.loading ? "Loading..." : `${sh.data.length} points`;
                          })}
                        </div>
                      </div>
                    )
                  )}
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
