# Issue: fetchData Cannot Be Dynamically Instantiated Inside Reactive Code

## Summary

`fetchData()` calls cannot be created dynamically inside reactive code such as `.map()` callbacks on cell arrays. This prevents patterns from creating variable-length lists of independently fetched resources.

## Use Case

**Pattern:** github-momentum-tracker

**What we're trying to accomplish:**
- Allow users to add multiple GitHub repositories
- Each repository needs independent data fetching (metadata, commit activity, star history)
- The number of repositories is dynamic (user can add/remove)

## What We Tried

### Attempt 1: fetchData inside .map()

```typescript
export default pattern<Input, Output>(({ repos }) => {
  const repoDataList = repos.map((repoNameCell) => {
    // Create fetchData for each repo dynamically
    const metadata = fetchData<Metadata>({
      url: derive(repoNameCell, name => `https://api.github.com/repos/${name}`),
      mode: "json"
    });
    const commitActivity = fetchData<CommitActivity[]>({
      url: derive(repoNameCell, name => `https://api.github.com/repos/${name}/stats/commit_activity`),
      mode: "json"
    });
    return { repoName: repoNameCell, metadata, commitActivity };
  });
  // ... render repoDataList
});
```

**Errors:**
```
TypeError: Cannot read properties of undefined (reading 'loading')
TypeError: Cannot read properties of undefined (reading 'data')
Error: Frame mismatch
```

### Attempt 2: Recipe Composition with ct-render

```typescript
export const RepoCard = recipe<{repo: Cell<string>}>((state) => {
  const metadata = fetchData({ url: derive(state.repo, r => `.../${r}`) });
  return {
    [NAME]: derive(state.repo, r => r),
    [UI]: <div>{/* render metadata */}</div>
  };
});

export default recipe<{repos: Cell<string[]>}>((state) => {
  return {
    [UI]: (
      <div>
        {state.repos.map((r, i) => (
          <RepoCard key={i} repo={r} />
        ))}
      </div>
    )
  };
});
```

**Error:** "Invalid recipe" when deploying with `charm new`

### Attempt 3: Fixed Slots with Pre-created fetchData

```typescript
// Pre-create 5 slots at pattern evaluation time
const slot0_url = derive(repos, rs => rs[0] ? `.../${rs[0]}` : "");
const slot0_data = fetchData({ url: slot0_url, mode: "json" });
// ... repeat for slots 1-4

const slots = [
  { url: slot0_url, data: slot0_data },
  { url: slot1_url, data: slot1_data },
  // ...
];

// Map repos to fixed slots
const activeSlots = repos.map((repo, i) => slots[i]);
```

**Error:** "Frame mismatch" crash - even pre-created slots fail when the repos array changes

### Attempt 4: Wrapping fetchData in ifElse() inside .map()

Based on how `prompt-injection-tracker` uses `ifElse()` with fetchData:

```typescript
repos.map((repoNameCell) => {
  const shouldFetch = derive(repoNameCell, (name) => !!name);
  const metadata = ifElse(
    shouldFetch,
    fetchData<Metadata>({ url: derive(repoNameCell, name => `.../${name}`), mode: "json" }),
    null
  );
  return { metadata };
});
```

**Error:** Pattern fails to render entirely - blank page, 593+ storage events, no UI.

**Finding:** `ifElse()` doesn't help when fetchData is **inside** `.map()`. The prompt-injection-tracker pattern works because their fetchData calls are at the **top level** (outside any `.map()`), with fixed slots.

## Technical Analysis

The `fetchData` primitive appears to require:
1. Static allocation during pattern evaluation
2. Fixed number of fetchData slots known upfront
3. No dynamic creation based on reactive data changes

The "Frame mismatch" error from `popFrame` in the scheduler indicates the reactive system detected an inconsistent state when fetchData was created/accessed in an unexpected context.

## Desired Behavior

One of these solutions:

### Option A: Allow fetchData inside .map()
```typescript
// This would "just work"
repos.map(repo => fetchData({ url: derive(repo, r => `.../${r}`) }));
```

### Option B: fetchDataMany primitive
```typescript
// Fetch multiple URLs, returns array of results
const allMetadata = fetchDataMany({
  urls: derive(repos, rs => rs.map(r => `.../${r}`)),
  mode: "json"
});
```

### Option C: Document the pattern for variable-length fetching
If there's a supported way to do this, please document it.

## Workaround Attempted

Currently using "fixed maximum slots" approach with 10 pre-created fetchData calls for star history sampling. This works for a fixed upper bound but doesn't scale for truly dynamic lists.

## Environment

- CommonTools framework via labs repository
- Pattern: github-momentum-tracker
- Superstition documented: `2025-12-02-fetchdata-cannot-be-dynamically-instantiated.md`

## Impact

This limitation blocks the entire class of "multi-item tracker" patterns where each item needs independent data fetching.

---

## Update: 2025-12-02 - Bug Persists After Framework Fix

Framework author confirmed "frame mismatch" was a bug and claimed it was "fixed on main". After testing with latest labs (pulled same day):

**Test:** Deployed github-momentum-tracker to fresh space `momentum-clean-1202`, added 2 repos.

**Result:** Same errors persist:
```
TypeError: Cannot read properties of undefined (reading 'loading')
TypeError: Cannot read properties of undefined (reading 'data')
Error: Frame mismatch
```

**Observed behavior:**
- UI renders 2 repo cards with correct repo names
- All data fields show "—" or "No data"
- fetchData results inside .map() are undefined
- Frame mismatch errors in console

The fix may have addressed a different "frame mismatch" issue (one that occurred on every load), but the dynamic fetchData instantiation problem remains.

---

## Update: 2025-12-02 - Minimal Repro Attempts

Attempted to create a minimal reproduction to isolate the bug. Tested the following patterns in fresh spaces:

### Patterns Tested (ALL WORKED - no Frame mismatch)

| Pattern | fetchData per item | Dependency chain? | .get() casting? | Space |
|---------|-------------------|------------------|----------------|-------|
| Single fetch | 1 | No | No | repro-single |
| Triple fetch | 3 | No | No | repro-triple |
| 12 fetch slots | 12 | No | No | repro-many |
| Dependency chain | 6 | Yes | No | repro-deps |
| .get() casting | 6 | Yes | Yes | repro-getpattern |

### What We Tested

1. **Basic fetchData inside .map()** - Works fine
2. **Multiple fetchData per mapped item** - Works fine
3. **Dependency chains** (one fetch's URL derived from another fetch's result) - Works fine
4. **External flag dependency** (simulating authCharm) - Works fine
5. **The exact .get() casting pattern** from github-momentum-tracker:
   ```typescript
   const flag = (values.hasFlag as any)?.get ? (values.hasFlag as any).get() : values.hasFlag;
   ```
   - Works fine

### Conclusion

**github-momentum-tracker.tsx itself IS the minimal reproduction.**

Every pattern from that file works in isolation. The bug cannot be reproduced with simpler patterns.

### Remaining Candidates

The only differences between working repros and failing github-momentum-tracker:

1. **External charm linkage** - `authCharm` from favorites (a cell that links to another charm instance)
2. **Specific combination** - all patterns together with full complexity
3. **Async timing/race condition** - something about real GitHub API response timing vs JSONPlaceholder
4. **Pattern size/complexity** - some threshold effect

### Repro Pattern Location

The test patterns are in `patterns/jkomoros/WIP/`:
- `fetchdata-map-repro.tsx` - basic patterns (all work)
- `fetchdata-wish-repro.tsx` - tests wish() primitive (works)
- `fetchdata-imported-pattern-repro.tsx` - tests imported pattern instantiation (works)
- `fetchdata-cell-input-repro.tsx` - tests Cell<object> input (works)
- `fetchdata-combined-repro.tsx` - tests ALL patterns combined (works)

---

## Update: 2025-12-02 - Extensive Repro Testing

Tested 7 different repro patterns attempting to isolate the bug. **ALL WORK.**

### Patterns Tested

| Pattern | What it Tests | Space | Result |
|---------|--------------|-------|--------|
| Single fetchData | 1 fetch per item | repro-single | ✅ Works |
| Triple fetchData | 3 fetches per item | repro-triple | ✅ Works |
| 12 fetchData slots | Many fetches per item | repro-many | ✅ Works |
| Dependency chain | URL derived from another fetch | repro-deps | ✅ Works |
| .get() casting | Exact pattern from momentum-tracker | repro-getpattern | ✅ Works |
| wish() | wish() primitive + fetchData in .map() | repro-wish | ✅ Works |
| Imported pattern | Inline pattern instantiation | repro-imported | ✅ Works |
| Cell<object> input | Optional Cell<object> input param | repro-cellinput | ✅ Works |
| Combined ALL | wish + imported + Cell + ifElse + 10 slots | repro-combined | ✅ Works |

### What We Tested (All Work)

1. **Basic fetchData inside .map()** ✅
2. **Multiple fetchData per mapped item (up to 12)** ✅
3. **Dependency chains** (URL derived from another fetch result) ✅
4. **The exact .get() casting pattern** from github-momentum-tracker ✅
5. **wish() primitive** with fetchData inside .map() ✅
6. **Imported pattern instantiation** (like GitHubAuth({})) ✅
7. **Cell<object> input parameter** (like authCharm) ✅
8. **Three-way derive combining multiple sources** ✅
9. **ifElse conditional rendering** ✅
10. **10 fetchData slots per item** (like starSample0-9) ✅

### Conclusion

**github-momentum-tracker.tsx itself IS the minimal reproduction.**

Every pattern from that file works in isolation and in combination. The Frame mismatch bug cannot be reproduced with simpler patterns.

### Remaining Hypotheses

The bug must be specific to one of:

1. **Real GitHub API interaction** - specific response sizes, timing, auth errors
2. **Actual charm linkage** - favorites mechanism actually populating authCharm
3. **Cumulative state** - bug only triggers after specific sequence of operations
4. **Race condition** - timing-dependent issue with real API latency

### Recommendation

github-momentum-tracker.tsx should be used as the reproduction case. The bug cannot be further simplified.

---

## Update: 2025-12-02 - Empty URL Hypothesis Tested

Hypothesized that the bug triggers when fetchData URLs are **empty strings** (conditional fetch that should be skipped). Created `fetchdata-empty-url-repro.tsx` to test this theory.

### Test Pattern

```typescript
const results = ids.map((idCell) => {
  const apiUrl = derive(
    { enableFetching, idCell },
    (values) => {
      const enabled = /* extract value */;
      const id = /* extract value */;
      // Return empty string when not enabled - like github-momentum-tracker without auth
      return enabled ? `https://jsonplaceholder.typicode.com/users/${id}` : "";
    }
  );
  const userData = fetchData<User>({ url: apiUrl, mode: "json" });
  return { id: idCell, userData };
});
```

### Result: **WORKS** - No Frame mismatch

- Added items with Fetching OFF (empty URLs) → No errors
- Added multiple items → No errors
- Toggled fetching ON → Data loaded correctly
- Toggled back OFF → No errors

**The empty URL hypothesis is DISPROVEN.** Empty URLs alone do not cause Frame mismatch.

---

## Update: 2025-12-02 - Final Verification

Re-tested github-momentum-tracker in fresh space `momentum-final-verify`:

1. Deployed fresh pattern
2. Did NOT enter auth token (hasAuth = false, URLs become empty)
3. Added repo "facebook/react"

**Result: FRAME MISMATCH REPRODUCED**

```
TypeError: Cannot read properties of undefined (reading 'loading')
TypeError: Cannot read properties of undefined (reading 'data')
Error: Frame mismatch
```

### Definitive Conclusion

**github-momentum-tracker.tsx IS the minimal reproduction.**

Despite extensive testing with 10+ simplified repro patterns covering:
- fetchData inside .map() (1, 3, 10, 12 fetches per item)
- Dependency chains
- wish() primitive
- Imported pattern instantiation
- Cell<object> input parameters
- Three-way derives
- ifElse conditional rendering
- Empty URL patterns
- ALL patterns combined

**ALL simplified repros WORK.** Only github-momentum-tracker triggers the bug.

### Implications

The bug is either:
1. **Pattern-specific** - Something unique about github-momentum-tracker's exact code structure
2. **Complexity threshold** - Bug only triggers when pattern exceeds a certain complexity
3. **Emergent interaction** - Combination of features that cannot be isolated
4. **External dependency** - Something about wish() discovering actual charm data in production

### Recommendation for Framework Author

Please use `github-momentum-tracker.tsx` as the reproduction case:

```bash
cd labs
deno task ct charm new ../community-patterns-2/patterns/jkomoros/github-momentum-tracker.tsx \
  --api-url http://localhost:8000 \
  --identity ../community-patterns-2/claude.key \
  --space test-repro

# Then:
# 1. Navigate to the charm (do NOT enter auth token)
# 2. Add any repo (e.g., "facebook/react")
# 3. Observe Frame mismatch errors in console
```

---

## Update: 2025-12-02 - Exhaustive Structural Testing

Created additional repro patterns testing EVERY structural element from github-momentum-tracker:

### New Repro Patterns Tested (ALL WORK)

| Pattern | What it Tests | Result |
|---------|--------------|--------|
| `fetchdata-multi-empty-repro.tsx` | 13 fetchData per item, ALL with empty URLs | ✅ Works |
| `fetchdata-options-repro.tsx` | fetchData with `options.headers` derived from cell | ✅ Works |
| `auth-config.tsx` | Helper pattern with its own fetchData (like GitHubAuth) | ✅ Works |
| `fetchdata-inline-fetch-repro.tsx` | **EXACT structural match** to github-momentum-tracker | ✅ Works |

### The Inline Fetch Repro Matches github-momentum-tracker EXACTLY:

1. ✅ `wish()` for auth discovery
2. ✅ Inline pattern instantiation (`AuthConfig({})`) that has its own fetchData
3. ✅ Three-way derive for `effectiveToken` (wish + authCharm + inlineAuth.token)
4. ✅ `hasAuth` derived from effectiveToken
5. ✅ fetchData inside `.map()` with empty URLs when no auth
6. ✅ `options.headers` derived from effectiveToken
7. ✅ `samplePages` derived from hasAuth + parsedRef + metadata (fetchData result)
8. ✅ 10 explicit fetchData slots (`slot0`-`slot9`) depending on samplePages
9. ✅ All slots have `options.headers` derived from effectiveToken

**The inline-fetch-repro is structurally IDENTICAL to github-momentum-tracker** - it just uses JSONPlaceholder instead of GitHub API.

### Final Conclusion

**The bug cannot be isolated to any structural element.**

Every pattern, feature, and combination from github-momentum-tracker works fine when tested in isolation or in combination. The bug only manifests in `github-momentum-tracker.tsx` itself.

### Possible Explanations

1. **File complexity threshold** - Some internal limit triggered by pattern size/complexity
2. **Specific character/parsing** - Something in github-momentum-tracker's exact source
3. **GitHub API specifics** - Something about actual GitHub API responses (401 errors, rate limiting)
4. **Cumulative state corruption** - Bug only triggers after specific charm state history
5. **Unknown interaction** - Something we haven't identified

### Repro Patterns Location

All test patterns in `patterns/jkomoros/WIP/`:
- `fetchdata-empty-url-repro.tsx` - empty URL testing
- `fetchdata-multi-empty-repro.tsx` - 13 empty URLs per item
- `fetchdata-options-repro.tsx` - options.headers testing
- `auth-config.tsx` - helper pattern with fetchData
- `fetchdata-inline-fetch-repro.tsx` - **EXACT structural match**

---

## Update: 2025-12-02 - **ROOT CAUSE IDENTIFIED via Binary Search**

Used binary search approach: stripped github-momentum-tracker down, then added code back incrementally.

### Binary Search Results

| Version | What's Added | Result |
|---------|-------------|--------|
| v1 | No star samples | ✅ Works |
| v2 | + samplePages derive (depends on metadata fetchData) | ✅ Works |
| v3 | + makeSlotUrl + 1 starSample fetchData | ✅ Works |
| v4 | + ALL 10 starSample fetchData | ✅ Works |
| v5 | + starHistory aggregate derive (NOT accessed in UI) | ✅ Works |
| **v6** | **+ UI accesses `starHistory.loading` via derive()** | **❌ FAILS** |
| Original | Full UI with starHistory.loading/.data access | ❌ FAILS |

### Root Cause

The bug is triggered by this specific combination:

1. `fetchData` created inside `.map()` on a cell array
2. A derived cell (`starHistory`) aggregates those fetchData results
3. **UI accesses properties of that derived cell via `derive(starHistory, sh => sh.loading)`**

### Minimal Reproduction

Inside `repos.map()`:
```typescript
// This works - fetchData inside map
const metadata = fetchData<Metadata>({ url: apiUrl, mode: "json" });

// This works - derive that aggregates fetchData results
const starHistory = derive(
  { metadata, s0: starSample0, s1: starSample1, ... },
  (values) => ({ loading: false, data: [...] })
);

// Return starHistory
return { repoName, metadata, starHistory };
```

In UI:
```typescript
{repoDataList.map((item) => {
  const starHistory = item.starHistory;

  // THIS TRIGGERS THE BUG - accessing starHistory via derive() in UI
  return <div>{derive(starHistory, (sh) => sh.loading ? "..." : sh.data.length)}</div>;
})}
```

### Error

```
TypeError: Cannot read properties of undefined (reading 'loading')
Error: Frame mismatch
```

### Analysis

The `starHistory` cell is **undefined** when accessed via `derive()` in the UI render callback, even though it's returned from the data map. This suggests:

1. Derived cells that aggregate fetchData results inside `.map()` don't propagate correctly to the UI layer
2. There's a timing issue where the cell isn't fully initialized when the UI tries to subscribe to it
3. The reactive system loses track of the cell reference when crossing from data map to render map

### Reproduction Pattern

`momentum-stripped.tsx` in `patterns/jkomoros/WIP/` provides a clean reproduction:
- v5 version (without starHistory UI access) works
- v6 version (with `derive(starHistory, sh => sh.loading)` in UI) fails

Deploy v6 and add a repo without auth to reproduce.

---

**Questions:**
1. Why does the derived cell become undefined when accessed in the UI's map callback?
2. Is there a workaround to safely access derived cells that aggregate fetchData results?
3. Should we use a different pattern for aggregating multiple fetchData results inside `.map()`?
