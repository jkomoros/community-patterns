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

**Option A: Fine-Grained Token (Recommended - Safer)**
1. Go to github.com → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens
2. Click "Generate new token"
3. Name: "Common Tools GitHub Access"
4. Expiration: Set a reasonable expiry (90 days, 1 year)
5. Repository access: "Public Repositories (read-only)"
6. Permissions: No additional permissions needed (public read is default)
7. Generate, copy, paste

**Option B: Classic Token (Simpler but less safe)**
1. Go to github.com → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Name it, set expiration
4. **Check NO scope boxes** - zero scopes = read-only public access
5. Generate, copy, paste

#### Security Considerations

**Classic token with no scopes IS safe** (read-only public data), but:
- ⚠️ Easy to accidentally check a scope box (grants write access!)
- ⚠️ Classic tokens don't expire by default
- ⚠️ If leaked, valid until manually revoked

**Fine-grained tokens are better because:**
- ✅ Explicit read-only permission model
- ✅ Mandatory expiration
- ✅ Can limit to specific repos or just public repos
- ✅ Clearer what permissions you're granting

**Recommendation:** Guide users toward fine-grained tokens in the auth pattern UI.

**One token works forever** (or until expiry). Same token works across all patterns.

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

## Future: Generalized OAuth Component in Framework

Instead of per-provider auth patterns, the framework could have a `<ct-oauth>` component
(like `<ct-google-oauth>`) that works with arbitrary OAuth providers.

### What Would It Take?

**Framework Changes (Medium-Large effort):**

```typescript
// Hypothetical usage
<ct-oauth
  $auth={auth}
  provider={{
    name: "GitHub",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientId: "your-github-app-client-id",
    scopes: ["read:user", "repo"],
    // clientSecret handled server-side
  }}
/>
```

**Server-Side Requirements:**
1. **OAuth callback endpoint** - Receive auth code from provider redirect
2. **Token exchange endpoint** - Exchange code for access token (needs client_secret)
3. **Token refresh endpoint** - Refresh expired tokens
4. **Secure secret storage** - Client secrets can't be in browser

**Why This Is Harder Than PATs:**

| Aspect | Personal Access Token | OAuth Flow |
|--------|----------------------|------------|
| User effort | Create on GitHub, paste | Click button, approve |
| Server needed | No | Yes (token exchange) |
| Client secret | Not needed | Required (server-side) |
| App registration | Not needed | Need GitHub OAuth App |
| Token refresh | Manual (new token) | Automatic |
| Security model | User manages token | App manages token |

**Implementation Estimate:**

| Component | Effort | Notes |
|-----------|--------|-------|
| `<ct-oauth>` component | 2-3 weeks | UI, state management, redirect handling |
| Server endpoints | 1-2 weeks | Callback, exchange, refresh |
| Provider configs | 1 week | GitHub, Google, others |
| Secret management | 1 week | Secure storage, rotation |
| Testing | 2 weeks | Each provider has quirks |
| Security review | 1 week | Required for auth systems |
| **Total** | **8-11 weeks** | For a robust implementation |

**Provider-Specific Quirks to Handle:**
- GitHub: Token in response body (not JSON by default!)
- Google: Refresh tokens only on first auth
- Microsoft: Different token formats
- Twitter: OAuth 1.0a (different flow entirely)

### Recommendation

**For this pattern:** Stick with PAT approach
- Much simpler to implement (days vs months)
- No server-side changes needed
- Fine-grained tokens are secure enough
- Users can manage their own tokens

**For framework long-term:** Generalized OAuth would be valuable
- Better UX (click to auth vs manual token creation)
- Could support many providers with config
- But significant investment

**Middle ground:** If GitHub-specific OAuth is needed later, could add `<ct-github-oauth>` as a one-off (like `<ct-google-oauth>`), then generalize if pattern emerges.

## Open Questions

1. Should we persist historical data to avoid re-fetching? (Framework caches, but clears eventually)
2. Should there be a "portfolio score" aggregating all repos?
3. Should we support GitHub orgs (fetch all repos from an org)?
4. Export functionality (CSV, image)?
5. **Should we lobby for `<ct-github-oauth>` component in framework?** (Better UX than PAT)

## Status

**Current Phase**: Design Complete, Ready for Implementation

**Next Action**: Start Phase 1 - Core Infrastructure
