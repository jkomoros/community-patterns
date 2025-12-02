# GitHub Momentum Tracker - Design & TODO

## Overview

A pattern to track the "momentum" of GitHub repositories by visualizing star growth over time and commit activity. Designed to help identify projects with accelerating growth (positive second derivative) vs plateauing or declining ones.

## Key Features

1. **Star Sparklines**: Compact visualization of star growth over time
2. **Momentum Detection**: Flag repos with positive second derivative (accelerating growth)
3. **Commit Activity Heatmap**: Simple bar chart showing recent commit frequency
4. **Multi-repo Dashboard**: Track 20+ repos at a glance
5. **Flexible Input**: Add repos via textbox accepting various URL formats

## Architecture Decisions

### Authentication Strategy

#### The Problem
GitHub API rate limits:
- **Unauthenticated**: 60 requests/hour (useless for 20+ repos)
- **Authenticated**: 5,000 requests/hour (plenty for our use case)

#### Solution: Separate `github-auth.tsx` Pattern

Create a dedicated auth pattern (like `google-auth.tsx`) that:
1. Walks user through creating a GitHub Personal Access Token (PAT)
2. Stores the token
3. Is discoverable via `wish("#githubAuth")`
4. Can be composed into other patterns that need GitHub API access

#### How Hard Is It to Get a Token?

**Surprisingly easy!** For public repo data:
1. Go to github.com → Settings → Developer Settings → Personal Access Tokens
2. Click "Generate new token (classic)"
3. Give it a name like "Common Tools GitHub Access"
4. **No scopes needed!** Public repo data is accessible with a zero-scope token
5. Click "Generate token", copy it (shown only once)
6. Paste into the auth pattern

**One token works forever** (or until expiry date you set). Same token works across all patterns.

#### Auth Pattern Design (`github-auth.tsx`)

```typescript
/** GitHub Personal Access Token authentication. #githubAuth */
interface Output {
  token: string;
  isValid: boolean;
  username: string;      // Fetched via /user endpoint to validate
  rateLimit: {
    remaining: number;
    limit: number;
    resetAt: string;
  };
}
```

**UI Flow**:
1. Check if token already exists → Show status (username, rate limit remaining)
2. If no token or invalid:
   - Show clear instructions with link to GitHub token page
   - Textarea for pasting token
   - "Validate & Save" button
   - Test token via `GET /user` endpoint
3. Once valid, show green status + reminder to favorite for discovery
4. Export `token` for other patterns to use

**Token Validation**:
```typescript
// Test token by fetching user info
const validation = fetchData({
  url: "https://api.github.com/user",
  headers: { Authorization: `Bearer ${token}` }
});
// If 200 → valid, extract username
// If 401 → invalid token
// Also fetch /rate_limit to show remaining quota
```

#### Composition in Momentum Tracker

```typescript
// In github-momentum-tracker.tsx
import GitHubAuth from "./github-auth.tsx";

export default pattern<Input, Output>(({ authCharm, ... }) => {
  // Try to find existing auth via wish
  const discoveredAuth = wish<{ token: string }>("#githubAuth");

  // Use discovered auth, or passed-in auth, or show inline auth UI
  const effectiveToken = derive(
    { discovered: discoveredAuth, passed: authCharm },
    ({ discovered, passed }) => discovered?.token || passed?.token || ""
  );

  const hasAuth = derive(effectiveToken, (t) => !!t);

  // If no auth, compose the auth pattern inline
  const inlineAuth = GitHubAuth({});

  return {
    [UI]: (
      <div>
        {ifElse(
          hasAuth,
          <div>/* Main tracker UI */</div>,
          <div>
            <h3>GitHub Authentication Required</h3>
            <p>To track 20+ repos, you need a GitHub token for API access.</p>
            {inlineAuth}
          </div>
        )}
      </div>
    ),
  };
});
```

#### Why a Separate Pattern?

1. **Reusability**: Any pattern needing GitHub API can use it
2. **Single source of truth**: One token, discoverable everywhere
3. **Better UX**: User sets up auth once, favorites it, done forever
4. **Separation of concerns**: Auth logic separate from business logic
5. **Testability**: Can test auth pattern independently

### Data Fetching Approach

**Challenge**: Getting full star history requires paginated API calls. A repo with 50k stars = 500 API calls.

**Solution**: Use sampling/approximation strategy:
1. Fetch repo metadata first (total star count, created_at)
2. Sample stargazers at strategic page offsets to estimate growth curve
3. For recent data (last 30 days), fetch more granular data
4. Use adaptive time resolution: weekly for older data, daily for recent

**API Endpoints**:
- `GET /repos/{owner}/{repo}` - Basic repo info (star count, created_at)
- `GET /repos/{owner}/{repo}/stargazers` with `Accept: application/vnd.github.star+json` header - Starred timestamps
- `GET /repos/{owner}/{repo}/stats/commit_activity` - Weekly commit counts (last 52 weeks)

### Visualization

**Star Sparklines**:
- SVG path element with smoothed line
- Width ~200px, height ~40px
- X-axis: time (adaptive resolution)
- Y-axis: cumulative stars
- Color-code by momentum: green (accelerating), yellow (steady), red (decelerating)

**Momentum Indicator**:
- Calculate 7-day moving average to smooth noise
- First derivative = rate of new stars per week
- Second derivative = change in rate (acceleration)
- If second derivative consistently positive over last 4 weeks, flag as "accelerating"

**Commit Activity Bar Chart**:
- Simple horizontal bars showing commits per week
- Last 12 weeks of data
- Color intensity based on relative activity

### Input URL Management

**Parsing Strategy** (Best-effort):
- Accept: `https://github.com/owner/repo`, `github.com/owner/repo`, `owner/repo`
- Accept markdown links: `[name](https://github.com/owner/repo)`
- Accept newline or comma delimited
- Extract owner/repo, silently skip unparseable entries
- Normalize to consistent `owner/repo` format
- Deduplicate by normalized key

**UI**:
- If no `githubURLs` input provided, show input mode:
  - Textarea for bulk paste
  - "Add" button to parse and add repos
  - List of current repos with remove buttons
- If `githubURLs` provided as input, use those directly (allow adding more)

### Data Refresh

- Manual refresh button (not auto-polling)
- Clear cache for all repos and re-fetch
- Show "last updated" timestamp
- Consider per-repo refresh for debugging

## Type Definitions

```typescript
interface RepoReference {
  owner: string;
  repo: string;
  fullName: string; // "owner/repo"
}

interface StarDataPoint {
  date: string; // ISO date
  cumulativeStars: number;
}

interface MomentumAnalysis {
  firstDerivative: number;  // stars/week (rate)
  secondDerivative: number; // change in rate (acceleration)
  trend: "accelerating" | "steady" | "decelerating";
  confidence: "high" | "medium" | "low"; // based on data quality
}

interface CommitActivityWeek {
  weekStart: string; // ISO date
  commits: number;
}

interface RepoData {
  ref: RepoReference;
  metadata: {
    totalStars: number;
    createdAt: string;
    description: string;
    language: string;
  };
  starHistory: StarDataPoint[];
  momentum: MomentumAnalysis;
  commitActivity: CommitActivityWeek[];
  fetchedAt: string; // timestamp
  error?: string; // if fetch failed
}

interface TrackerInput {
  githubURLs?: Default<string[], []>;
  authToken?: Cell<string>;
}

interface TrackerOutput {
  repos: Cell<RepoData[]>;
  authToken: Cell<string>;
}
```

## Implementation Plan

### Phase 0: GitHub Auth Pattern (`github-auth.tsx`)
- [ ] Create `github-auth.tsx` with basic structure
- [ ] Add instructions UI with link to GitHub token creation page
- [ ] Add token input textarea with "Validate" button
- [ ] Implement token validation via `GET https://api.github.com/user`
- [ ] Fetch and display rate limit info (`GET /rate_limit`)
- [ ] Show authenticated status (username, avatar, rate limit remaining)
- [ ] Add "favorite this charm" reminder for wish discovery
- [ ] Test: Create token, paste, validate, favorite
- [ ] Deploy and verify `wish("#githubAuth")` works

### Phase 1: Core Infrastructure (Momentum Tracker)
- [ ] Create `github-momentum-tracker.tsx` with Input/Output types
- [ ] Implement `wish("#githubAuth")` for auth discovery
- [ ] Compose `GitHubAuth` inline as fallback if no wish result
- [ ] Implement URL parsing function (best-effort, various formats)
- [ ] Create repo list management UI (add/remove)

### Phase 2: GitHub API Integration
- [ ] Create fetchData wrapper for GitHub API with auth header
- [ ] Implement repo metadata fetch (`/repos/{owner}/{repo}`)
- [ ] Implement stargazers sampling strategy
- [ ] Implement commit activity fetch (`/stats/commit_activity`)
- [ ] Handle rate limiting (show warning, queue requests)

### Phase 3: Data Processing
- [ ] Implement star history aggregation (adaptive time resolution)
- [ ] Implement moving average smoothing
- [ ] Implement first/second derivative calculation
- [ ] Implement momentum classification (accelerating/steady/decelerating)

### Phase 4: Visualization
- [ ] Create SVG sparkline component
- [ ] Create commit activity bar chart component
- [ ] Add color-coding based on momentum
- [ ] Create momentum badge/indicator

### Phase 5: Dashboard UI
- [ ] Create repo card component with all visualizations
- [ ] Create sortable/filterable repo list
- [ ] Add "accelerating" filter to highlight hot repos
- [ ] Add manual refresh button
- [ ] Add "last updated" timestamp display

### Phase 6: Polish
- [ ] Handle edge cases (0 stars, new repos, private repos)
- [ ] Add loading states for each repo
- [ ] Add error handling with retry option
- [ ] Test with 20+ repos
- [ ] Optimize for performance

## Technical Challenges & Mitigations

### Challenge 1: API Rate Limiting
**Risk**: 20+ repos with full history = potentially thousands of API calls
**Mitigation**:
- Sampling strategy (don't fetch all pages)
- Caching via fetchData (framework handles)
- Auth token for 5000 req/hr limit
- Stagger requests, show progress

### Challenge 2: Star History Volume
**Risk**: Large repos have millions of stars, can't fetch all
**Mitigation**:
- Sample at logarithmic intervals (page 1, 10, 100, 1000, etc.)
- Interpolate between samples
- Focus precision on recent data (last 30-90 days)

### Challenge 3: Visualization Performance
**Risk**: SVG with many data points may be slow
**Mitigation**:
- Downsample to ~50-100 points for display
- Use simple path (not individual circles)
- Consider canvas for very large datasets

### Challenge 4: Framework Reactivity
**Risk**: Many derived cells could cause perf issues
**Mitigation**:
- Use "dumb map approach" per community-docs
- Each repo processed independently (isolated caching)
- Avoid derive-inside-map antipattern

## Similar Work / Reference

- [star-history](https://github.com/star-history/star-history) - Web tool that inspired this
- `google-auth.tsx` - **Auth pattern to model** - shows wish discovery, OAuth flow, favorite reminder
- `cheeseboard-schedule.tsx` - Pattern using fetchData for external APIs
- `prompt-injection-tracker.tsx` - Pattern with multi-level caching pipeline
- `shopping-list.tsx` - Pattern for list management UI
- `gmail-importer.tsx` - Shows composing auth pattern inline when not discovered

## Open Questions

1. Should we persist historical data to avoid re-fetching? (Framework caches, but clears eventually)
2. Should there be a "portfolio score" aggregating all repos?
3. Should we support GitHub orgs (fetch all repos from an org)?
4. Export functionality (CSV, image)?

## Status

**Current Phase**: Design Complete, Ready for Implementation

**Next Action**: Start Phase 1 - Core Infrastructure
