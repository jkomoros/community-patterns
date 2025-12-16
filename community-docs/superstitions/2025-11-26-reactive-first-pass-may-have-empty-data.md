# Reactive First Pass May Have Empty/Undefined Data

## Summary

When pattern code runs, the first reactive pass may return empty arrays `[]` or undefined values for data that loads asynchronously (favorites, external cells, etc.). This is **not a bug** - subsequent reactive updates will populate the data correctly. Don't assume early errors indicate broken functionality.

## The Confusion

We spent significant time debugging what we thought was a framework bug:
- `wish({ query: "#googleAuth" })` was returning "No favorite found"
- Console showed error messages
- Deploy command logged the error
- We assumed the framework's favorites/wish system was broken

**But it was working all along.** We got confused by TWO things:

### 1. First reactive pass has empty data
1. First reactive pass runs with empty favorites `[]`
2. Error is thrown/logged on that first pass
3. Reactive system updates with real data
4. Second pass succeeds and returns the correct result
5. UI updates to show success

### 2. The auth charm wasn't authenticated yet
Even after wish found the gmail-auth charm, we still saw "No Auth Found" because:
- The gmail-auth charm existed and was favorited
- But the user hadn't clicked "Authenticate with Google" yet
- So `auth.user.email` was empty string `""`
- Our check `email !== ""` correctly showed "no auth"

We confused "wish can't find the charm" with "charm exists but has no auth data".

## Evidence

Console logs showed the progression:
```
favorites [] googleauth undefined          // First pass - empty
No favorite found matching "googleauth"    // Error thrown
wishResult {error: ...}                    // Error state

favorites [Object x7] googleauth {cell...} // Second pass - populated!
wishResult {result: ...}                   // Success state
```

The pattern was working - we just focused on the error and didn't notice the subsequent success.

## Key Insights

### 1. Early errors don't mean permanent failure
The reactive system may need multiple passes to:
- Load data from storage
- Resolve Cell references
- Populate arrays from async sources
- Sync with remote data

Pattern code using `computed()` handles this automatically - it re-runs when data changes.

### 2. Distinguish "not found" from "found but empty"
When checking for data from a wished charm:
- `wish.error` = charm not found
- `wish.result` exists but data is empty = charm found, but not yet configured

Check both states separately in your UI.

### 3. Framework will stop logging first-pass errors
The framework author (Berni) mentioned he's removing the confusing error logging from the first reactive pass, since it makes it look like something is broken when it's actually just loading.

## What To Do

1. **Don't panic at first-pass errors** - Check if subsequent reactive updates fix it
2. **Use computed() for reactive data** - It automatically re-evaluates when inputs change
3. **Check the final UI state** - Not just console errors during loading
4. **Add console.log in computed()** - To see all reactive passes, not just the first

```typescript
// This will log on EVERY reactive update, showing the progression
computed(() => console.log("wishResult", wishResult));
```

## When This Applies

- `wish()` calls for favorites or other async data
- Accessing properties on Cells loaded from storage
- Arrays populated from external sources
- Any data that loads asynchronously

## Metadata

```yaml
topic: reactivity, async loading, debugging, wish, favorites, first-pass errors
discovered: 2025-11-26
confirmed_count: 1
last_confirmed: 2025-11-26
sessions: [gmail-auth-wish-refactor]
related_functions: wish, computed, Cell.of, favorites
stars: 5
status: confirmed
```
