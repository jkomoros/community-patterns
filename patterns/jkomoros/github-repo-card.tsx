/// <cts-enable />
import {
  Writable,
  derive,
  fetchData,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
} from "commontools";

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
  onRemove?: unknown; // Handler result
}

/** GitHub repository card with stats and momentum. #githubRepoCard */
interface Output {
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

  const markdownMatch = trimmed.match(/\[.*?\]\((https?:\/\/github\.com\/([^/]+)\/([^/)]+))\)/);
  if (markdownMatch) {
    const [, , owner, repo] = markdownMatch;
    return { owner, repo, fullName: `${owner}/${repo}` };
  }

  const urlMatch = trimmed.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/\s?#]+)/);
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

function calculateMomentum(weeks: CommitActivityWeek[] | null | undefined): MomentumAnalysis {
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
  slotIndex: number
): string {
  if (!samplePages.owner || !samplePages.repo || slotIndex >= samplePages.pages.length) return "";
  const page = samplePages.pages[slotIndex];
  return `https://api.github.com/repos/${samplePages.owner}/${samplePages.repo}/stargazers?per_page=1&page=${page}`;
}

// =============================================================================
// PATTERN
// =============================================================================

export default pattern<Input, Output>(({ repoName, token, onRemove }) => {
  // Parse repo name
  const ref = derive(repoName, (name) => parseGitHubUrl(name));

  // Check if we have valid auth and ref
  const hasAuth = derive(token, (t) => !!t && t.length > 0);

  // Derive URLs - empty string skips fetch
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

  // Fetch repo metadata
  const metadata = fetchData<GitHubRepoMetadata>({
    url: apiUrl,
    mode: "json",
    options: {
      method: "GET",
      headers: derive(token, (t) => makeGitHubHeaders(t)),
    },
  });

  // Fetch commit activity
  const commitActivity = fetchData<CommitActivityWeek[]>({
    url: commitActivityUrl,
    mode: "json",
    options: {
      method: "GET",
      headers: derive(token, (t) => makeGitHubHeaders(t)),
    },
  });

  // ==========================================================================
  // Star History Sampling
  // ==========================================================================

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

  // 10 explicit fetchData slots for star samples
  const starSample0 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 0)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });
  const starSample1 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 1)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });
  const starSample2 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 2)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });
  const starSample3 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 3)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });
  const starSample4 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 4)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });
  const starSample5 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 5)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });
  const starSample6 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 6)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });
  const starSample7 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 7)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });
  const starSample8 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 8)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });
  const starSample9 = fetchData<StargazerWithDate[]>({
    url: derive(samplePages, (sp) => makeSlotUrl(sp, 9)),
    mode: "json",
    options: { method: "GET", headers: derive(token, (t) => makeStargazerHeaders(t)) },
  });

  // Aggregate star history
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

      const pending = samples.some((s, i) => {
        if (i >= sp.pages.length) return false;
        const sample = (s as any)?.get ? (s as any).get() : s;
        return sample?.pending === true;
      });

      if (pending) return { loading: true, data: [] as StarDataPoint[] };

      const dataPoints: StarDataPoint[] = [];
      for (let i = 0; i < sp.pages.length && i < 10; i++) {
        const sample = (samples[i] as any)?.get ? (samples[i] as any).get() : samples[i];
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
    }
  );

  // ==========================================================================
  // Derived display values
  // ==========================================================================

  // deno-lint-ignore no-explicit-any
  const isLoading = derive(metadata, (m: any) => m?.pending === true);
  // deno-lint-ignore no-explicit-any
  const hasError = derive(metadata, (m: any) => !!m?.error);
  const data = derive(metadata, (m) => m?.result);
  const commitData = derive(commitActivity, (ca) => ca?.result || []);
  const isCommitLoading = derive(commitActivity, (ca) => ca?.pending === true);
  const momentum = derive(commitData, (weeks) => calculateMomentum(weeks));

  const sparklineData = derive(commitData, (weeks) => {
    if (!weeks || weeks.length === 0) return [];
    return weeks.slice(-12).map((w) => w.total);
  });

  const repoHref = derive(
    { data, repoName },
    ({ data, repoName }) => data?.html_url || `https://github.com/${repoName}`
  );

  const momentumBadge = derive(momentum, (m) => {
    const styles: Record<string, { bg: string; color: string; label: string; icon: string }> = {
      accelerating: { bg: "#d4edda", color: "#28a745", label: "Accelerating", icon: "^" },
      steady: { bg: "#e2e3e5", color: "#6c757d", label: "Steady", icon: "-" },
      decelerating: { bg: "#f8d7da", color: "#dc3545", label: "Decelerating", icon: "v" },
      unknown: { bg: "#e9ecef", color: "#6c757d", label: "Unknown", icon: "?" },
    };
    return styles[m.trend] || styles.unknown;
  });


  // ==========================================================================
  // UI
  // ==========================================================================

  return {
    [NAME]: derive(repoName, (n) => `Repo: ${n}`),
    [UI]: (
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
              <span style={{
                padding: "2px 8px",
                borderRadius: "12px",
                fontSize: "12px",
                fontWeight: "500",
                backgroundColor: derive(momentumBadge, (b) => b.bg),
                color: derive(momentumBadge, (b) => b.color),
              }}>
                {derive(momentumBadge, (b) => `${b.icon} ${b.label}`)}
              </span>
            </div>
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
          {ifElse(
            onRemove,
            <ct-button
              onClick={onRemove}
              variant="destructive"
            >
              Remove
            </ct-button>,
            null
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

        {/* Star Growth Sparkline */}
        <div style={{
          marginTop: "12px",
          padding: "12px",
          backgroundColor: "#fffbeb",
          borderRadius: "6px",
          border: "1px solid #fcd34d",
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}>
            <span style={{ fontSize: "13px", color: "#92400e", fontWeight: "500" }}>
              Star Growth Over Time
            </span>
            <span style={{ fontSize: "12px", color: "#b45309" }}>
              {derive(starHistory, (sh) => {
                if (sh.loading) return "Loading...";
                if (sh.data.length === 0) return "No data";
                const first = sh.data[0];
                const last = sh.data[sh.data.length - 1];
                return `${first.date} -> ${last.date}`;
              })}
            </span>
          </div>
          {ifElse(
            derive(starHistory, (sh) => sh.loading),
            <div style={{ color: "#b45309", fontSize: "13px", textAlign: "center", padding: "8px" }}>
              Loading star history...
            </div>,
            ifElse(
              derive(starHistory, (sh) => sh.data.length > 0),
              <div style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "2px",
                height: "60px",
              }}>
                {derive(starHistory, (sh) => {
                  const maxCount = Math.max(...sh.data.map(d => d.count), 1);
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
              <div style={{ color: "#b45309", fontSize: "13px", textAlign: "center", padding: "8px" }}>
                No star history data available
              </div>
            )
          )}
          {ifElse(
            derive(starHistory, (sh) => sh.data.length > 1),
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "4px",
              fontSize: "10px",
              color: "#92400e",
            }}>
              {derive(starHistory, (sh) => {
                if (sh.data.length === 0) return "";
                return `~${sh.data[0].count.toLocaleString()} stars`;
              })}
              {derive(data, (d) => d?.stargazers_count ? `${d.stargazers_count.toLocaleString()} stars now` : "")}
            </div>,
            null
          )}
        </div>

        {/* Commit Activity Heatmap */}
        <div style={{
          marginTop: "12px",
          padding: "12px",
          backgroundColor: "#f8f9fa",
          borderRadius: "6px",
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}>
            <span style={{ fontSize: "13px", color: "#666", fontWeight: "500" }}>
              Commit Activity (last 12 weeks)
            </span>
            <span style={{ fontSize: "12px", color: "#999" }}>
              {derive(momentum, (m) =>
                m.trend !== "unknown"
                  ? `${m.changePercent > 0 ? "+" : ""}${m.changePercent.toFixed(0)}% vs prior 8 weeks`
                  : "Insufficient data"
              )}
            </span>
          </div>
          {ifElse(
            isCommitLoading,
            <div style={{ color: "#999", fontSize: "13px", textAlign: "center", padding: "8px" }}>
              Loading commit data...
            </div>,
            ifElse(
              derive(sparklineData, (d) => d.length > 0),
              <div style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "2px",
                height: "50px",
              }}>
                {derive(
                  { sparklineData, momentumBadge },
                  ({ sparklineData, momentumBadge }) => {
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
                  }
                )}
              </div>,
              <div style={{ color: "#999", fontSize: "13px", textAlign: "center", padding: "8px" }}>
                No commit activity data
              </div>
            )
          )}
          {ifElse(
            derive(sparklineData, (d) => d.length > 0),
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "4px",
              fontSize: "10px",
              color: "#999",
            }}>
              <span>12 weeks ago</span>
              <span>
                {derive(sparklineData, (d) =>
                  d.length > 0 ? `${d[d.length - 1]} commits this week` : ""
                )}
              </span>
              <span>now</span>
            </div>,
            null
          )}
        </div>
      </div>
    ),
    repoName,
    metadata,
    momentum,
  };
});
