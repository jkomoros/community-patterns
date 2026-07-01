import {
  computed,
  fetchJson,
  ifElse,
  NAME,
  pattern,
  Stream,
  UI,
  type VNode,
} from "commonfabric";

/**
 * GitHub Repo Card
 *
 * Displays stats for a SINGLE GitHub repository:
 * - Metadata (stars, forks, language, description)
 * - Star growth over time (sparkline via sampling)
 * - Commit activity (bar chart)
 * - Momentum indicator (accelerating/steady/decelerating)
 *
 * Designed to be composed via ct-render in github-momentum-tracker.tsx
 */

// =============================================================================
// TYPES
// =============================================================================

interface RepoReference {
  owner: string;
  repo: string;
  fullName: string;
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
  week: number;
  total: number;
  days: number[];
}

interface StargazerWithDate {
  starred_at: string;
  user: { login: string };
}

interface StarDataPoint {
  date: string;
  count: number;
}

interface MomentumAnalysis {
  trend: "accelerating" | "steady" | "decelerating" | "unknown";
  recentAvg: number;
  olderAvg: number;
  changePercent: number;
}

interface Input {
  repoName: string;
  token: string;
  onRemove?: Stream<void>; // Handler result
}

/** GitHub repository card with stats and momentum. #githubRepoCard */
interface Output {
  [NAME]: string;
  [UI]: VNode;
  repoName: string;
  metadata: unknown;
  momentum: MomentumAnalysis;
}

// =============================================================================
// URL PARSING
// =============================================================================

function parseGitHubUrl(input: string | unknown): RepoReference | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const markdownMatch = trimmed.match(
    /\[.*?\]\((https?:\/\/github\.com\/([^/]+)\/([^/)]+))\)/,
  );
  if (markdownMatch) {
    const [, , owner, repo] = markdownMatch;
    return { owner, repo, fullName: `${owner}/${repo}` };
  }

  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?github\.com\/([^/]+)\/([^/\s?#]+)/,
  );
  if (urlMatch) {
    const [, owner, repo] = urlMatch;
    const cleanRepo = repo.replace(/\.git$/, "");
    return { owner, repo: cleanRepo, fullName: `${owner}/${cleanRepo}` };
  }

  const simpleMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simpleMatch) {
    const [, owner, repo] = simpleMatch;
    return { owner, repo, fullName: `${owner}/${repo}` };
  }

  return null;
}

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

function makeStargazerHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3.star+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function getSamplePageNumbers(totalStars: number): number[] {
  const totalPages = Math.ceil(totalStars / 100);
  if (totalPages <= 10) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: number[] = [];
  for (let i = 0; i < 10; i++) {
    const page = Math.max(1, Math.floor((i * totalPages) / 9));
    if (!pages.includes(page)) {
      pages.push(page);
    }
  }
  if (!pages.includes(1)) pages.unshift(1);
  if (!pages.includes(totalPages)) pages.push(totalPages);
  return pages.slice(0, 10);
}

// =============================================================================
// MOMENTUM CALCULATION
// =============================================================================

function calculateMomentum(
  weeks: CommitActivityWeek[] | null | undefined,
): MomentumAnalysis {
  if (!weeks || weeks.length < 12) {
    return { trend: "unknown", recentAvg: 0, olderAvg: 0, changePercent: 0 };
  }

  const last12 = weeks.slice(-12);
  const recent4 = last12.slice(-4);
  const older8 = last12.slice(0, 8);

  const recentAvg = recent4.reduce((sum, w) => sum + w.total, 0) / 4;
  const olderAvg = older8.reduce((sum, w) => sum + w.total, 0) / 8;

  if (olderAvg === 0) {
    return {
      trend: recentAvg > 0 ? "accelerating" : "steady",
      recentAvg,
      olderAvg,
      changePercent: recentAvg > 0 ? 100 : 0,
    };
  }

  const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

  let trend: MomentumAnalysis["trend"] = "steady";
  if (changePercent > 20) trend = "accelerating";
  else if (changePercent < -20) trend = "decelerating";

  return { trend, recentAvg, olderAvg, changePercent };
}

// =============================================================================
// HELPER FUNCTIONS (module scope)
// =============================================================================

// Helper function to create star sample URL for a given slot index
// Note: Returns a derive() call since samplePages is reactive
function makeSlotUrl(
  samplePages: { owner: string; repo: string; pages: number[] },
  slotIndex: number,
): string {
  if (
    !samplePages.owner || !samplePages.repo ||
    slotIndex >= samplePages.pages.length
  ) return "";
  const page = samplePages.pages[slotIndex];
  return `https://api.github.com/repos/${samplePages.owner}/${samplePages.repo}/stargazers?per_page=1&page=${page}`;
}

// =============================================================================
// PATTERN
// =============================================================================

export default pattern<Input, Output>(({ repoName, token, onRemove }) => {
  // Parse repo name
  const ref = computed(() => parseGitHubUrl(repoName));

  // Check if we have valid auth and ref
  const hasAuth = computed(() => !!token && token.length > 0);

  // Derive URLs - empty string skips fetch
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

  // Fetch repo metadata
  const metadata = fetchJson<GitHubRepoMetadata>({
    url: apiUrl,
    options: {
      method: "GET",
      headers: computed(() => makeGitHubHeaders(token)),
    },
  });

  // Fetch commit activity
  const commitActivity = fetchJson<CommitActivityWeek[]>({
    url: commitActivityUrl,
    options: {
      method: "GET",
      headers: computed(() => makeGitHubHeaders(token)),
    },
  });

  // ==========================================================================
  // Star History Sampling
  // ==========================================================================

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

  // 10 explicit fetchJson slots for star samples
  const starSample0 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 0)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });
  const starSample1 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 1)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });
  const starSample2 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 2)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });
  const starSample3 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 3)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });
  const starSample4 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 4)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });
  const starSample5 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 5)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });
  const starSample6 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 6)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });
  const starSample7 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 7)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });
  const starSample8 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 8)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });
  const starSample9 = fetchJson<StargazerWithDate[]>({
    url: computed(() => makeSlotUrl(samplePages, 9)),
    options: {
      method: "GET",
      headers: computed(() => makeStargazerHeaders(token)),
    },
  });

  // Aggregate star history
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

    const pending = samples.some((sample, i) => {
      if (i >= sp.pages.length) return false;
      return sample?.pending === true;
    });

    if (pending) return { loading: true, data: [] as StarDataPoint[] };

    const dataPoints: StarDataPoint[] = [];
    for (let i = 0; i < sp.pages.length && i < 10; i++) {
      const sample = samples[i];
      const result = sample?.result;
      if (result && result.length > 0 && result[0]?.starred_at) {
        const pageNum = sp.pages[i];
        dataPoints.push({
          date: result[0].starred_at.split("T")[0],
          count: (pageNum - 1) * 100,
        });
      }
    }

    dataPoints.sort((a, b) => a.date.localeCompare(b.date));
    return { loading: false, data: dataPoints };
  });

  // ==========================================================================
  // Derived display values
  // ==========================================================================

  const isLoading = computed(() => metadata?.pending === true);
  const hasError = computed(() => !!metadata?.error);
  const data = computed(() => metadata?.result);
  const commitData = computed(() => commitActivity?.result || []);
  const isCommitLoading = computed(() => commitActivity?.pending === true);
  const momentum = computed(() => calculateMomentum(commitData));

  const sparklineData = computed(() => {
    const weeks = commitData;
    if (!weeks || weeks.length === 0) return [];
    return weeks.slice(-12).map((w) => w.total);
  });

  const repoHref = computed(() =>
    data?.html_url || `https://github.com/${repoName}`
  );

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
        icon: "^",
      },
      steady: { bg: "#e2e3e5", color: "#6c757d", label: "Steady", icon: "-" },
      decelerating: {
        bg: "#f8d7da",
        color: "#dc3545",
        label: "Decelerating",
        icon: "v",
      },
      unknown: { bg: "#e9ecef", color: "#6c757d", label: "Unknown", icon: "?" },
    };
    return styles[m.trend] || styles.unknown;
  });

  // ==========================================================================
  // UI
  // ==========================================================================

  return {
    [NAME]: computed(() => `Repo: ${repoName}`),
    [UI]: (
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
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
                {computed(() => `${momentumBadge.icon} ${momentumBadge.label}`)}
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
          {ifElse(
            onRemove,
            <cf-button
              onClick={onRemove}
              variant="destructive"
            >
              Remove
            </cf-button>,
            null,
          )}
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
                  {computed(() => data?.forks_count?.toLocaleString() || "—")}
                </strong>
              </div>
              <div>
                <span style={{ color: "#666" }}>Language:</span>
                <strong>{computed(() => data?.language || "—")}</strong>
              </div>
            </div>,
          ),
        )}

        {/* Star Growth Sparkline */}
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
              style={{ fontSize: "13px", color: "#92400e", fontWeight: "500" }}
            >
              Star Growth Over Time
            </span>
            <span style={{ fontSize: "12px", color: "#b45309" }}>
              {computed(() => {
                const sh = starHistory;
                if (sh.loading) return "Loading...";
                if (sh.data.length === 0) return "No data";
                const first = sh.data[0];
                const last = sh.data[sh.data.length - 1];
                return `${first.date} -> ${last.date}`;
              })}
            </span>
          </div>
          {ifElse(
            computed(() => starHistory.loading),
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
              computed(() => starHistory.data.length > 0),
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "2px",
                  height: "60px",
                }}
              >
                {computed(() => {
                  const sh = starHistory;
                  const maxCount = Math.max(...sh.data.map((d) => d.count), 1);
                  return sh.data.map((point, i) => {
                    const heightPercent = (point.count / maxCount) * 100;
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
          {ifElse(
            computed(() => starHistory.data.length > 1),
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
                if (sh.data.length === 0) return "";
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
              style={{ fontSize: "13px", color: "#666", fontWeight: "500" }}
            >
              Commit Activity (last 12 weeks)
            </span>
            <span style={{ fontSize: "12px", color: "#999" }}>
              {computed(() =>
                momentum.trend !== "unknown"
                  ? `${momentum.changePercent > 0 ? "+" : ""}${
                    momentum.changePercent.toFixed(0)
                  }% vs prior 8 weeks`
                  : "Insufficient data"
              )}
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
                {computed(() => {
                  const data = sparklineData;
                  const badgeColor = momentumBadge?.color || "#6c757d";
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
                    ? `${sparklineData[sparklineData.length - 1]} commits this week`
                    : ""
                )}
              </span>
              <span>now</span>
            </div>,
            null,
          )}
        </div>
      </div>
    ),
    repoName,
    metadata,
    momentum,
  };
});
