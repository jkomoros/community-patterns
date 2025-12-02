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

**Questions:**
1. Is this limitation by design?
2. Is there a planned feature to support dynamic fetchData allocation?
3. What's the recommended pattern for "fetch data for each item in a variable-length list"?
4. Given that simplified repros all work, could this be a timing/race condition specific to real API calls?
