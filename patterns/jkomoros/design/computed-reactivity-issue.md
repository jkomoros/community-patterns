# Computed Block Reactivity Issue

## Summary

We're trying to use `computed()` to automatically update one cell (`gmailFilterQuery`) when another cell (`queryResult` from `generateObject()`) changes. However, we're hitting what appears to be a fundamental limitation in how `computed()` registers dependencies.

## Use Case

**Goal:** When an LLM generates a Gmail search query, automatically populate the `gmailFilterQuery` field to trigger email fetching.

**Pattern:** Hotel Membership Extractor
- LLM generates a Gmail query (e.g., "from:marriott.com")
- We want to automatically set `gmailFilterQuery` to this value
- This triggers `GmailImporter` to fetch emails with that query

## Code Example

```typescript
const { result: queryResult, pending: queryPending } = generateObject({
  // ... LLM config to generate Gmail queries
});

const gmailFilterQuery = /* Cell<string> from pattern input */;

// Attempt to auto-update gmailFilterQuery when queryResult changes
computed(() => {
  // PROBLEM: If we guard against undefined, dependencies never register
  if (!queryResult || !queryPending) {
    return; // Returns early, never calls .get(), dependencies not registered
  }

  // If we don't guard, we get: "Cannot read properties of undefined (reading 'get')"
  const result = queryResult.get();  // ❌ queryResult may be undefined initially
  const pending = queryPending.get();

  if (!pending && result?.query) {
    gmailFilterQuery.set(result.query); // Auto-update the field
  }
});
```

## The Problem

### Issue 1: Cells from `generateObject()` may not exist initially
- When the pattern first loads, `queryResult` and `queryPending` are undefined
- They only become cell objects after `generateObject()` initializes

### Issue 2: Guards prevent dependency registration
- `computed()` requires calling `.get()` on cells to register them as dependencies
- If we guard with `if (!queryResult) return`, the block returns early
- Dependencies never get registered, so the computed block never re-runs when cells become available

### Issue 3: No guards cause runtime errors
- If we don't guard, calling `queryResult.get()` when `queryResult` is undefined throws:
  ```
  TypeError: Cannot read properties of undefined (reading 'get')
  ```

## What We Tried

### Attempt 1: Guard checks before .get()
```typescript
computed(() => {
  if (!queryResult || !queryPending) return; // Never registers dependencies
  const result = queryResult.get();
  // ...
});
```
**Result:** Computed block never re-runs because dependencies aren't registered.

### Attempt 2: Optional chaining
```typescript
computed(() => {
  const result = queryResult?.get(); // Still fails if queryResult is undefined
  // ...
});
```
**Result:** TypeError - optional chaining doesn't help when the object itself is undefined.

### Attempt 3: Type checking .get() method
```typescript
computed(() => {
  if (typeof queryResult?.get !== 'function') return;
  const result = queryResult.get();
  // ...
});
```
**Result:** Same issue - returns early without registering dependencies.

## Questions for Framework Maintainers

1. **Is there a recommended pattern for "update cell B when cell A changes"?**
   - Our use case: Set `gmailFilterQuery` when `queryResult` from `generateObject()` has a new value
   - We need reactive side effects, not just derived values

2. **How should we handle cells that may not exist initially?**
   - Cells from `generateObject()` aren't available when the pattern first loads
   - How can a `computed()` block register dependencies on cells that don't exist yet?

3. **Is `computed()` the right primitive for this use case?**
   - Should we use `derive()` instead?
   - Is there another pattern we should use?

4. **Could we add a utility like `watchCell()`?**
   ```typescript
   watchCell(queryResult, (result) => {
     if (result?.query) {
       gmailFilterQuery.set(result.query);
     }
   });
   ```

## Workarounds We're Considering

### Option A: Manual button
```typescript
// Show button when LLM generates a query
<ct-button onClick={() => gmailFilterQuery.set(queryResult.get().query)}>
  Use Query: {queryResult.get().query}
</ct-button>
```
**Pros:** Simple, reliable, gives user control
**Cons:** Not automatic, requires user action

### Option B: Use derive() to create a computed cell
```typescript
const autoQuery = derive([queryResult, queryPending], ([result, pending]) => {
  return (!pending && result?.query) ? result.query : gmailFilterQuery.get();
});
// Then pass autoQuery to GmailImporter instead of gmailFilterQuery
```
**Pros:** More reactive
**Cons:** Doesn't work if we need to update an existing input cell

## Environment

- Framework: commontools (labs repository)
- Pattern: patterns/jkomoros/hotel-membership-extractor.tsx
- File: `/Users/alex/Code/community-patterns/patterns/jkomoros/hotel-membership-extractor.tsx`

## Additional Context

This came up while implementing an "agentic" pattern where LLMs automatically orchestrate multi-step workflows. The pattern:
1. User clicks "Scan for Hotel Memberships"
2. LLM generates a Gmail query
3. **[This is where auto-fetch should happen]** → Auto-populate gmailFilterQuery
4. GmailImporter fetches emails
5. LLM extracts membership numbers

Steps 1, 2, 4, and 5 work perfectly. We're stuck on step 3.

---

**Is there a recommended pattern we should use for this reactive side effect?**

---

## ✅ SOLUTION FOUND: Use derive() instead of computed()

**Update (2025-11-21):** We found a working solution! Instead of using `computed()` for side effects, use `derive()` to create a derived cell that automatically switches between LLM-generated and manual queries.

### The Working Solution

```typescript
// AGENTIC: Auto-query - derived cell that automatically uses LLM query when available
const autoQuery = derive(
  [queryResult, queryPending, isScanning, gmailFilterQuery],
  ([result, pending, scanning, manualQuery]) => {
    // During scanning workflow, use LLM-generated query when ready
    if (scanning && !pending && result && result.query && result.query !== "done") {
      return result.query;  // Use LLM query
    }

    // Otherwise use manual query from input
    return manualQuery;  // Fall back to manual query
  }
);

// Import emails - using autoQuery derived cell for automatic LLM integration
const importer = GmailImporter({
  settings: {
    gmailFilterQuery: autoQuery,  // Pass derived cell instead of input cell
    limit,
    historyId: "",
  },
  authCharm: authCharm,
});
```

### Why This Works

1. **No dependency registration issues**: `derive()` handles undefined cells gracefully without runtime errors
2. **Pure computation**: No side effects - just returns the appropriate query value
3. **Automatic reactivity**: When `queryResult` changes, `autoQuery` automatically updates, which triggers `GmailImporter` to refetch
4. **Clean pattern**: This is the idiomatic way to handle "conditional cell switching" in the framework

### Testing Results

Verified working in test-jkomoros-membership12:
- ✅ LLM generates query: `"from:marriott.com"`
- ✅ `autoQuery` derive() propagates it to GmailImporter
- ✅ Gmail Filter Query field shows correct value
- ✅ No runtime errors or reactivity issues
- ✅ Console logs show: `[Auto-query] Using LLM query: "from:marriott.com"`

### Key Insight

**Don't use `computed()` for side effects.** Instead:
- Use `derive()` to create a new derived cell that computes the desired value
- Pass the derived cell to components that need it
- Let reactivity handle the updates automatically

This is more declarative and avoids all the dependency registration issues we encountered with `computed()`.
