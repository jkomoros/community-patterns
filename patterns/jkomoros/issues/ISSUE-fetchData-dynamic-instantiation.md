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

**Questions:**
1. Is this limitation by design?
2. Is there a planned feature to support dynamic fetchData allocation?
3. What's the recommended pattern for "fetch data for each item in a variable-length list"?
