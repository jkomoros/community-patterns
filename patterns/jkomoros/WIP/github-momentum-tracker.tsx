import {
  computed,
  Default,
  fetchJson,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  type VNode,
  wish,
  Writable,
} from "commonfabric";
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
  authCharm?: Writable<{ token: string }>; // Optional linked auth charm
}

interface Output {
  [NAME]: string;
  [UI]: VNode;
  repos: string[];
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
  const markdownMatch = trimmed.match(
    /\[.*?\]\((https?:\/\/github\.com\/([^/]+)\/([^/)]+))\)/,
  );
  if (markdownMatch) {
    const [, , owner, repo] = markdownMatch;
    return { owner, repo, fullName: `${owner}/${repo}` };
  }

  // Try full URL: https://github.com/owner/repo or github.com/owner/repo
  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?github\.com\/([^/]+)\/([^/\s?#]+)/,
  );
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
  { repos: Writable<string[]>; inputText: Writable<string> }
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
  { repos: Writable<string[]>; repoName: Writable<string> | string }
>((_event, { repos, repoName }) => {
  const current = repos.get();
  // Handle both Writable<string> and plain string
  const nameToRemove = typeof repoName === "string"
    ? repoName
    // deno-lint-ignore no-explicit-any
    : (repoName as any).get?.() || repoName;
  repos.set(current.filter((r) => r !== nameToRemove));
});

const clearAllRepos = handler<
  unknown,
  { repos: Writable<string[]> }
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

// Compute the stargazers URL for a given sample slot index.
// Module scope so the per-slot computed() callbacks can call it (Common Fabric
// builder callbacks must be self-contained; only module-scope helpers are safe
// to capture).
function slotUrl(
  sp: { owner: string; repo: string; pages: number[] },
  slotIndex: number,
): string {
  if (!sp.owner || !sp.repo || slotIndex >= sp.pages.length) return "";
  const page = sp.pages[slotIndex];
  return `https://api.github.com/repos/${sp.owner}/${sp.repo}/stargazers?per_page=1&page=${page}`;
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
function calculateMomentum(
  weeks: CommitActivityWeek[] | null | undefined,
): MomentumAnalysis {
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
  const inputText = Writable.of<string>("");

  // ==========================================================================
  // Authentication
  // ==========================================================================

  // Try to find existing GitHub auth via wish
  const discoveredAuth = wish<{ token: string }>({ query: "#githubAuth" });

  // Inline auth for when no token is available
  const inlineAuth = GitHubAuth({});

  // Use discovered auth, passed-in auth, or inline auth
  const effectiveToken = computed(() => {
    const discovered = discoveredAuth?.result;
    const passed = authCharm?.get();
    const inline = inlineAuth.token;

    if (discovered?.token) return discovered.token;
    if (passed?.token) return passed.token;
    if (inline) return inline;
    return "";
  });

  const hasAuth = computed(() => !!effectiveToken);

  // ==========================================================================
  // Repo Data Fetching
  // ==========================================================================

  // Map over the repos cell array using the "dumb map approach"
  // Each repo string gets its own processing pipeline
  const repoDataList = repos.map((repoNameCell) => {
    // Parse the repo name to get owner/repo
    const ref = computed(() => parseGitHubUrl(repoNameCell));

    // Derive URLs that return empty string when no auth OR no valid ref
    // (fetch skips fetch when URL is empty - see community-docs superstition)
    const apiUrl = computed(() => {
      const r = ref;
      return (hasAuth && r)
        ? `https://api.github.com/repos/${r.owner}/${r.repo}`
        : "";
    });

    const commitActivityUrl = computed(() => {
      const r = ref;
      return (hasAuth && r)
        ? `https://api.github.com/repos/${r.owner}/${r.repo}/stats/commit_activity`
        : "";
    });

    // Fetch repo metadata (skipped when URL is empty)
    const metadata = fetchJson<GitHubRepoMetadata>({
      url: apiUrl,
      options: {
        method: "GET",
        headers: computed(() => makeGitHubHeaders(effectiveToken)),
      },
    });

    // Fetch commit activity (skipped when URL is empty)
    const commitActivity = fetchJson<CommitActivityWeek[]>({
      url: commitActivityUrl,
      options: {
        method: "GET",
        headers: computed(() => makeGitHubHeaders(effectiveToken)),
      },
    });

    // ==========================================================================
    // Star History Sampling (star-history.com approach)
    // Create 10 fixed sample slots, each deriving URL directly from metadata
    // ==========================================================================

    // Derive sample page numbers directly from metadata (single computed, no chain)
    const samplePages = computed(() => {
      const r = ref;
      const m = metadata;

      if (!hasAuth || !r || !m?.result?.stargazers_count) {
        return { owner: "", repo: "", pages: [] as number[] };
      }

      const totalStars = m.result.stargazers_count;
      return {
        owner: r.owner,
        repo: r.repo,
        pages: getSamplePageNumbers(totalStars),
      };
    });

    // Create 10 explicit fetch slots for star samples
    const starSample0 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 0)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });
    const starSample1 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 1)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });
    const starSample2 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 2)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });
    const starSample3 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 3)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });
    const starSample4 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 4)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });
    const starSample5 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 5)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });
    const starSample6 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 6)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });
    const starSample7 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 7)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });
    const starSample8 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 8)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });
    const starSample9 = fetchJson<StargazerWithDate[]>({
      url: computed(() => slotUrl(samplePages, 9)),
      options: {
        method: "GET",
        headers: computed(() => makeStargazerHeaders(effectiveToken)),
      },
    });

    // Aggregate star history from all samples
    const starHistory = computed(() => {
      const sp = samplePages;
      if (!sp.pages || sp.pages.length === 0) {
        return { loading: false, data: [] as StarDataPoint[] };
      }

      const samples = [
        starSample0,
        starSample1,
        starSample2,
        starSample3,
        starSample4,
        starSample5,
        starSample6,
        starSample7,
        starSample8,
        starSample9,
      ];

      // Check if any are still loading
      const pending = samples.some((s, i) => {
        if (i >= sp.pages.length) return false;
        return s?.pending === true;
      });

      if (pending) return { loading: true, data: [] as StarDataPoint[] };

      // Collect results
      const dataPoints: StarDataPoint[] = [];
      for (let i = 0; i < sp.pages.length && i < 10; i++) {
        const result = samples[i]?.result;
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
    });

    return {
      repoName: repoNameCell,
      ref,
      metadata,
      commitActivity,
      starHistory,
      samplePages,
    };
  });

  // Count repos
  const repoCount = computed(() => repos.length);

  // ==========================================================================
  // UI
  // ==========================================================================

  return {
    [NAME]: "GitHub Momentum Tracker",
    [UI]: (
      <div
        style={{
          padding: "24px",
          maxWidth: "1200px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ margin: "0 0 8px 0", fontSize: "28px" }}>
          GitHub Momentum Tracker
        </h1>
        <p style={{ margin: "0 0 24px 0", color: "#666" }}>
          Track star growth and commit activity across repositories
        </p>

        {/* Auth Status / Inline Auth */}
        {ifElse(
          hasAuth,
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "#d4edda",
              borderRadius: "8px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ color: "#28a745", fontWeight: "500" }}>
              Authenticated
            </span>
            <span style={{ color: "#666", fontSize: "14px" }}>
              (via {computed(() =>
                discoveredAuth?.result?.token ? "wish" : "linked charm"
              )})
            </span>
          </div>,
          <div
            style={{
              padding: "16px",
              backgroundColor: "#fff3cd",
              borderRadius: "8px",
              marginBottom: "20px",
              border: "1px solid #ffc107",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>
              GitHub Authentication Required
            </h3>
            <p
              style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#666" }}
            >
              To track repositories, you need a GitHub token. You can either:
            </p>
            <ul
              style={{
                margin: "0 0 16px 0",
                paddingLeft: "20px",
                fontSize: "14px",
              }}
            >
              <li>Create a GitHub Auth charm separately and favorite it</li>
              <li>Or enter your token below:</li>
            </ul>
            {inlineAuth}
          </div>,
        )}

        {/* Repo Input Section */}
        <div
          style={{
            padding: "16px",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
            marginBottom: "24px",
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>
            Add Repositories
          </h3>
          <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#666" }}>
            Paste GitHub URLs or owner/repo references (one per line or
            comma-separated)
          </p>
          <cf-input
            $value={inputText}
            placeholder="anthropics/claude-code, facebook/react, owner/repo"
            style={{
              width: "100%",
            }}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button
              type="button"
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
              computed(() => repoCount > 0),
              <button
                type="button"
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
              null,
            )}
          </div>
        </div>

        {/* Repo Count */}
        <div style={{ marginBottom: "16px", fontSize: "14px", color: "#666" }}>
          Tracking {repoCount}{" "}
          {computed(() => repoCount === 1 ? "repository" : "repositories")}
        </div>

        {/* Repo List */}
        {ifElse(
          computed(() => repoCount === 0),
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              backgroundColor: "#f8f9fa",
              borderRadius: "8px",
              color: "#666",
            }}
          >
            <p style={{ margin: "0 0 8px 0", fontSize: "16px" }}>
              No repositories added yet
            </p>
            <p style={{ margin: "0", fontSize: "14px" }}>
              Add some GitHub repos above to start tracking their momentum
            </p>
          </div>,
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {repoDataList.map((item) => {
              const metadata = item.metadata;
              const commitActivity = item.commitActivity;
              const starHistory = item.starHistory;
              const repoName = item.repoName; // This is a Writable<string>
              const isLoading = computed(() => metadata?.pending === true);
              const hasError = computed(() => !!metadata?.error);
              const data = computed(() => metadata?.result);

              // Commit activity data
              const commitData = computed(() => commitActivity?.result || []);
              const isCommitLoading = computed(() =>
                commitActivity?.pending === true
              );

              // Calculate momentum from commit activity
              const momentum = computed(() => calculateMomentum(commitData));

              // Get last 12 weeks for sparkline display
              const sparklineData = computed(() => {
                const weeks = commitData;
                if (!weeks || weeks.length === 0) return [];
                return weeks.slice(-12).map((w) => w.total);
              });

              // Build href - use data.html_url if available, else construct from repoName
              const repoHref = computed(() =>
                data?.html_url || `https://github.com/${repoName}`
              );

              // Momentum badge styling
              const momentumBadge = computed(() => {
                const m = momentum;
                const styles: Record<
                  string,
                  { bg: string; color: string; label: string; icon: string }
                > = {
                  accelerating: {
                    bg: "#d4edda",
                    color: "#28a745",
                    label: "Accelerating",
                    icon: "↗",
                  },
                  steady: {
                    bg: "#e2e3e5",
                    color: "#6c757d",
                    label: "Steady",
                    icon: "→",
                  },
                  decelerating: {
                    bg: "#f8d7da",
                    color: "#dc3545",
                    label: "Decelerating",
                    icon: "↘",
                  },
                  unknown: {
                    bg: "#e9ecef",
                    color: "#6c757d",
                    label: "Unknown",
                    icon: "?",
                  },
                };
                return styles[m.trend] || styles.unknown;
              });

              return (
                <div
                  style={{
                    padding: "16px",
                    border: "1px solid #dee2e6",
                    borderRadius: "8px",
                    backgroundColor: "white",
                  }}
                >
                  {/* Header Row */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "12px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
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
                        {/* Momentum Badge */}
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: "500",
                            backgroundColor: computed(() => momentumBadge.bg),
                            color: computed(() => momentumBadge.color),
                          }}
                        >
                          {computed(() =>
                            `${momentumBadge.icon} ${momentumBadge.label}`
                          )}
                        </span>
                      </div>
                      {ifElse(
                        data,
                        <p
                          style={{
                            margin: "4px 0 0 0",
                            fontSize: "14px",
                            color: "#666",
                            maxWidth: "600px",
                          }}
                        >
                          {computed(() => data?.description || "No description")}
                        </p>,
                        null,
                      )}
                    </div>
                    <button
                      type="button"
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
                    <div style={{ color: "#666", fontSize: "14px" }}>
                      Loading...
                    </div>,
                    ifElse(
                      hasError,
                      <div style={{ color: "#dc3545", fontSize: "14px" }}>
                        Error loading repo data
                      </div>,
                      <div
                        style={{
                          display: "flex",
                          gap: "24px",
                          fontSize: "14px",
                        }}
                      >
                        <div>
                          <span style={{ color: "#666" }}>Stars:</span>
                          <strong>
                            {computed(() =>
                              data?.stargazers_count?.toLocaleString() || "—"
                            )}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: "#666" }}>Forks:</span>
                          <strong>
                            {computed(() =>
                              data?.forks_count?.toLocaleString() || "—"
                            )}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: "#666" }}>Language:</span>
                          <strong>
                            {computed(() => data?.language || "—")}
                          </strong>
                        </div>
                      </div>,
                    ),
                  )}

                  {/* Star Growth Sparkline - Main Momentum Indicator */}
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "12px",
                      backgroundColor: "#fffbeb",
                      borderRadius: "6px",
                      border: "1px solid #fcd34d",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          color: "#92400e",
                          fontWeight: "500",
                        }}
                      >
                        Star Growth Over Time
                      </span>
                      <span style={{ fontSize: "12px", color: "#b45309" }}>
                        {computed(() => {
                          const sh = starHistory;
                          if (!sh) {
                            return "Loading...";
                          }
                          if (sh.loading) {
                            return "Loading...";
                          }
                          if (sh.data.length === 0) {
                            return "No data";
                          }
                          const first = sh.data[0];
                          const last = sh.data[sh.data.length - 1];
                          return `${first.date} → ${last.date}`;
                        })}
                      </span>
                    </div>
                    {ifElse(
                      computed(() => {
                        const sh = starHistory;
                        return !sh || sh.loading;
                      }),
                      <div
                        style={{
                          color: "#b45309",
                          fontSize: "13px",
                          textAlign: "center",
                          padding: "8px",
                        }}
                      >
                        Loading star history...
                      </div>,
                      ifElse(
                        computed(() => (starHistory?.data?.length ?? 0) > 0),
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-end",
                            gap: "2px",
                            height: "60px",
                          }}
                        >
                          {/* Render star history as bars (height = star count at that sample) */}
                          {computed(() => {
                            const sh = starHistory;
                            if (!sh || !sh.data) {
                              return null;
                            }
                            const maxCount = Math.max(
                              ...sh.data.map((d) =>
                                d.count
                              ),
                              1,
                            );
                            return sh.data.map((point, i) => {
                              const heightPercent = (point.count / maxCount) *
                                100;
                              return (
                                <div
                                  key={i}
                                  style={{
                                    flex: 1,
                                    height: `${Math.max(heightPercent, 5)}%`,
                                    backgroundColor: "#f59e0b",
                                    borderRadius: "2px 2px 0 0",
                                    minHeight: "4px",
                                  }}
                                  title={`${point.date}: ~${point.count.toLocaleString()} stars`}
                                />
                              );
                            });
                          })}
                        </div>,
                        <div
                          style={{
                            color: "#b45309",
                            fontSize: "13px",
                            textAlign: "center",
                            padding: "8px",
                          }}
                        >
                          No star history data available
                        </div>,
                      ),
                    )}
                    {/* Star counts under bars */}
                    {ifElse(
                      computed(() => (starHistory?.data?.length ?? 0) > 1),
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "4px",
                          fontSize: "10px",
                          color: "#92400e",
                        }}
                      >
                        {computed(() => {
                          const sh = starHistory;
                          if (!sh || !sh.data || sh.data.length === 0) {
                            return "";
                          }
                          return `~${sh.data[0].count.toLocaleString()} stars`;
                        })}
                        {computed(() =>
                          data?.stargazers_count
                            ? `${data.stargazers_count.toLocaleString()} stars now`
                            : ""
                        )}
                      </div>,
                      null,
                    )}
                  </div>

                  {/* Commit Activity Heatmap */}
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "12px",
                      backgroundColor: "#f8f9fa",
                      borderRadius: "6px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          color: "#666",
                          fontWeight: "500",
                        }}
                      >
                        Commit Activity (last 12 weeks)
                      </span>
                      <span style={{ fontSize: "12px", color: "#999" }}>
                        {computed(() => {
                          const m = momentum;
                          return m.trend !== "unknown"
                            ? `${m.changePercent > 0 ? "+" : ""}${
                              m.changePercent.toFixed(0)
                            }% vs prior 8 weeks`
                            : "Insufficient data";
                        })}
                      </span>
                    </div>
                    {ifElse(
                      isCommitLoading,
                      <div
                        style={{
                          color: "#999",
                          fontSize: "13px",
                          textAlign: "center",
                          padding: "8px",
                        }}
                      >
                        Loading commit data...
                      </div>,
                      ifElse(
                        computed(() => sparklineData.length > 0),
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-end",
                            gap: "2px",
                            height: "50px",
                          }}
                        >
                          {/* Use computed to produce complete bar elements with pre-computed color */}
                          {computed(() => {
                              const data = sparklineData;
                              const badgeColor = momentumBadge?.color ||
                                "#6c757d";
                              const maxVal = Math.max(...data, 1);
                              return data.map((val, i) => {
                                const heightPercent = (val / maxVal) * 100;
                                const opacity = 0.5 + (i / data.length) * 0.5;
                                return (
                                  <div
                                    key={i}
                                    style={{
                                      flex: 1,
                                      height: `${Math.max(heightPercent, 2)}%`,
                                      backgroundColor: badgeColor,
                                      opacity: opacity,
                                      borderRadius: "2px 2px 0 0",
                                      minHeight: "2px",
                                    }}
                                    title={`Week ${i + 1}: ${val} commits`}
                                  />
                                );
                              });
                          })}
                        </div>,
                        <div
                          style={{
                            color: "#999",
                            fontSize: "13px",
                            textAlign: "center",
                            padding: "8px",
                          }}
                        >
                          No commit activity data
                        </div>,
                      ),
                    )}
                    {/* Weekly totals under bars */}
                    {ifElse(
                      computed(() => sparklineData.length > 0),
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "4px",
                          fontSize: "10px",
                          color: "#999",
                        }}
                      >
                        <span>12 weeks ago</span>
                        <span>
                          {computed(() =>
                            sparklineData.length > 0
                              ? `${
                                sparklineData[sparklineData.length - 1]
                              } commits this week`
                              : ""
                          )}
                        </span>
                        <span>now</span>
                      </div>,
                      null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>,
        )}
      </div>
    ),
    repos,
  };
});
