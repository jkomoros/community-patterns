# Superstition: fetchData Cannot Be Dynamically Instantiated Inside Reactive Code

**Date:** 2025-12-02
**Author:** jkomoros
**Pattern:** github-momentum-tracker
**Status:** superstition

## Summary

`fetchData()` calls **cannot** be created dynamically inside reactive code such as `.map()` callbacks on cell arrays. The framework requires all `fetchData` calls to be statically defined at pattern evaluation time.

## Observed Behavior

### The Pattern of Failure

When a pattern tries to create `fetchData` calls dynamically based on a variable-length list:

```typescript
export default pattern<Input, Output>(({ repos }) => {
  // This FAILS at runtime with "Frame mismatch" or undefined results
  const repoDataList = repos.map((repoNameCell) => {
    const metadata = fetchData<Metadata>({
      url: derive(repoNameCell, name => `https://api.github.com/repos/${name}`),
      mode: "json"
    });
    return { repoName: repoNameCell, metadata };
  });
  // ...
});
```

### Errors Observed

1. **"Cannot read properties of undefined (reading 'loading')"** - fetchData results are undefined
2. **"Cannot read properties of undefined (reading 'data')"** - same issue
3. **"Frame mismatch"** - the reactive system detects an invalid operation

### Why It Happens

The `fetchData` primitive appears to require static allocation during pattern evaluation:
- All `fetchData` slots need to be known upfront
- They cannot be created on-demand when reactive data changes
- The "Frame mismatch" error indicates the reactive scheduler detected an inconsistent state

## What We Tried

### Approach 1: Direct fetchData in .map()
```typescript
repos.map((repo) => {
  const data = fetchData({ url: derive(repo, r => `.../${r}`) });
  return data;
});
```
**Result:** Frame mismatch, undefined results

### Approach 2: Recipe composition with ct-render
```typescript
export const RepoCard = recipe<{repo: string}>((state) => {
  const data = fetchData({ url: `.../${state.repo}` });
  // ...
});

export default recipe<{repos: string[]}>((state) => {
  return {
    [UI]: state.repos.map((r, i) => <RepoCard key={i} repo={r} />)
  };
});
```
**Result:** "Invalid recipe" error when repos change

### Approach 3: Fixed slots with pre-created fetchData
```typescript
const slot0_data = fetchData({ url: slot0_url });
const slot1_data = fetchData({ url: slot1_url });
// ... 5 slots total
const slots = [slot0_data, slot1_data, ...];
repos.map((repo, i) => slots[i]); // Map repos to fixed slots
```
**Result:** Frame mismatch crash - even pre-created slots don't work when repos array changes

### Approach 4: Wrapping fetchData in ifElse() inside .map()

Based on how `prompt-injection-tracker` uses `ifElse()` for conditional fetchData, we tried wrapping fetchData calls in `ifElse()`:

```typescript
repos.map((repoNameCell) => {
  const shouldFetch = derive(repoNameCell, (name) => !!name);

  // Wrap fetchData in ifElse
  const metadata = ifElse(
    shouldFetch,
    fetchData<Metadata>({
      url: derive(repoNameCell, name => `.../${name}`),
      mode: "json"
    }),
    null
  );
  return { metadata };
});
```

**Result:** Pattern fails to render entirely - blank page with only header visible. Massive storage events (593+) but no UI output.

**Why it fails:** The `ifElse()` wrapper doesn't help because the `fetchData()` call is still **being created inside** the `.map()` callback. The issue isn't about whether to execute the fetch - it's that the fetchData slot allocation happens at the wrong time (during reactive callback execution, not during static pattern evaluation).

**Key insight from prompt-injection-tracker:** They use `ifElse()` with fetchData, but their fetchData calls are at the **top level** of the pattern (outside any `.map()`), with fixed slots. The `.map()` only renders the results.

## Workarounds

### Workaround 1: Single fetchData with All Data
Make a single fetchData call that returns all the data you need:
```typescript
const allRepoData = fetchData({
  url: derive(repos, (rs) => `/api/batch?repos=${rs.join(",")}`),
  mode: "json"
});
```
**Limitation:** Requires a backend that supports batch queries.

### Workaround 2: Fixed Maximum Repos at Top Level (RECOMMENDED)
Pre-create a fixed number of fetchData slots **at the top level** (outside any `.map()`) and derive URLs from the array:

```typescript
export default pattern<Input, Output>(({ repos }) => {
  // Fixed slots at top level - these are evaluated once during pattern init
  const slot0_url = derive(repos, (rs) => rs[0] ? `.../${rs[0]}` : "");
  const slot0 = fetchData({ url: slot0_url, mode: "json" });

  const slot1_url = derive(repos, (rs) => rs[1] ? `.../${rs[1]}` : "");
  const slot1 = fetchData({ url: slot1_url, mode: "json" });

  // ... up to max slots (e.g., 5-10 repos)

  // Collect results into an array for rendering
  const allSlots = [slot0, slot1, /* ... */];

  return {
    [UI]: (
      <div>
        {allSlots.map((slot, i) => (
          // Render only slots that have data
          ifElse(slot?.result, <RepoCard data={slot} />, null)
        ))}
      </div>
    )
  };
});
```

**Limitation:** Hard-coded maximum, wasted resources for unused slots.
**Why it works:** fetchData slots are created at pattern evaluation time, not inside reactive callbacks.

### Workaround 3: External State Management
Store fetched data in a cell that persists across renders, fetch via handler:
```typescript
const repoDataCache = cell<Record<string, Data>>({});
const addRepo = handler((_, { repo }) => {
  fetch(`.../${repo}`).then(data => {
    repoDataCache.set(prev => ({ ...prev, [repo]: data }));
  });
});
```
**Limitation:** Loses reactivity benefits, manual cache management.

## Impact

This limitation prevents patterns from having:
- Variable-length lists of independently fetched resources
- Dynamic composition where each item needs its own data fetching
- Scalable multi-entity trackers (like tracking N GitHub repos)

## Questions for Framework Authors

1. Is this limitation by design or a bug?
2. Is there a planned feature to support dynamic fetchData allocation?
3. What's the recommended pattern for "fetch data for each item in a list"?
4. Would a `fetchDataMany` primitive that takes an array of URLs be feasible?

## Related

- `2025-12-01-svg-elements-not-supported-in-patterns.md` - another JSX limitation
- `ISSUE-ct-chart-component-request.md` - related feature request
- Recipe composition in `labs/packages/patterns/nested-counter.tsx` - works only for static composition
