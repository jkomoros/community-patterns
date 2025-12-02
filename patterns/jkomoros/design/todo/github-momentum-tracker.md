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
- Use `wish` to discover a GitHub auth token charm (e.g., `wish("#githubAuthToken")`)
- If no auth token found, render a textbox for user to enter one
- Store token in a cell for reactivity
- Required for scale (20+ repos) due to GitHub rate limits (60/hr unauth vs 5000/hr auth)

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

### Phase 1: Core Infrastructure
- [ ] Create basic pattern structure with Input/Output types
- [ ] Implement `wish("#githubAuthToken")` for auth discovery
- [ ] Create auth token input UI with fallback textbox
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
- `cheeseboard-schedule.tsx` - Pattern using fetchData for external APIs
- `prompt-injection-tracker.tsx` - Pattern with multi-level caching pipeline
- `shopping-list.tsx` - Pattern for list management UI

## Open Questions

1. Should we persist historical data to avoid re-fetching? (Framework caches, but clears eventually)
2. Should there be a "portfolio score" aggregating all repos?
3. Should we support GitHub orgs (fetch all repos from an org)?
4. Export functionality (CSV, image)?

## Status

**Current Phase**: Design Complete, Ready for Implementation

**Next Action**: Start Phase 1 - Core Infrastructure
