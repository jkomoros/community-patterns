# Wish Inside Derive Causes Infinite Loop

**SUPERSTITION** - Single observation, unverified. Use with skepticism!

## Topic

Calling `wish()` inside a `derive()` callback

## Problem

When you call `wish()` inside a `derive()` callback, each time the derive re-evaluates, it creates a **new wish** call. This can cause:

- "Too many iterations: 101" errors
- Infinite reactive loops
- Pattern failing to render
- 100% CPU usage

### What Didn't Work

```typescript
// ❌ PROBLEM: wish() inside derive() - creates new wish on each evaluation
const registryWish = derive(enableCommunityQueries, (enabled: boolean) => {
  if (!enabled) return null;
  return wish<SomeOutput>({ query: "#someTag" });  // New wish each time!
});

// Even worse: wish inside derive that depends on the wish result
const data = derive(registryWish, (wishResult) => {
  // This causes cascading re-evaluation
  return wishResult?.result?.data || [];
});
```

**Symptoms:**
- `charm new` fails with "Too many iterations: 101"
- Pattern deploys but doesn't render (blank/loading forever)
- Browser console shows reactivity errors
- 100% CPU in Deno process

### Why This Happens (Hypothesis) - UNCERTAIN

1. `derive()` callback runs whenever dependencies change
2. Each run creates a NEW `wish()` call (new object reference)
3. The new wish is seen as a "changed" value by the framework
4. This triggers downstream derives to re-evaluate
5. Which may trigger the original derive again
6. Infinite loop or "too many iterations" error

The problem is that `wish()` likely returns a new reactive cell/proxy each time it's called. Unlike primitive values that can be compared for equality, each `wish()` call creates a fresh object.

## Solution That Worked

**Move wish OUTSIDE the derive - call it unconditionally:**

```typescript
// ✅ CORRECT: wish() called once at pattern level, not inside derive
const registryWish = wish<SomeOutput>({ query: "#someTag" });

// Then use derive to conditionally process the result
const communityData = derive(
  [registryWish, enableCommunityQueries],
  ([wishResult, enabled]: [any, boolean]) => {
    if (!enabled) return [];  // Guard condition moved here
    if (!wishResult?.result) return [];
    return wishResult.result.data;
  }
);
```

**Key insight:** The wish itself should be called once. The conditional logic should be in how you USE the wish result, not in whether you CREATE the wish.

**Alternative if you really need conditional wish:**

```typescript
// ✅ If you must conditionally wish, use a separate pattern
// or accept that the wish runs even when disabled (usually fine)

// Option 1: Always wish, ignore result when disabled
const registryWish = wish<SomeOutput>({ query: "#someTag" });
const useRegistry = derive(
  [registryWish, enableCommunityQueries],
  ([result, enabled]) => enabled ? result : null
);

// Option 2: Don't use wish at all if it's optional
// Pass the data as an input from parent pattern instead
```

## Detection

If you see:
- "Too many iterations: 101" during deployment
- Pattern renders blank/loading
- CPU spikes during pattern evaluation

Search your code for:
```bash
grep -n "derive.*wish\|wish.*derive" your-pattern.tsx
```

Look for patterns like:
- `derive(something, () => { ... wish(...) ... })`
- `derive(..., () => wish(...))`

## Context

- **Pattern:** gmail-agentic-search.tsx
- **Use case:** Conditionally wish for community registry based on `enableCommunityQueries` flag
- **Problematic code:** `derive(enableCommunityQueries, (enabled) => enabled ? wish(...) : null)`
- **Result:** "Too many iterations: 101" when composed patterns tried to deploy

## Related

- **Superstition: derive-inside-map-causes-thrashing.md** - Similar issue with derive in iteration
- **Superstition: self-referential-wish-causes-infinite-loop.md** - Other wish-related loops
- **Official docs:** Check ~/Code/labs/docs/common/ for wish documentation

## Metadata

```yaml
topic: wish, derive, infinite-loop, reactivity, deployment
discovered: 2025-12-06
confirmed_count: 1
last_confirmed: 2025-12-06
sessions: [gmail-shared-search-strings]
related_functions: wish, derive
status: superstition
stars: ⭐
```

## Guestbook

- 2025-12-06 - gmail-agentic-search.tsx. Added `derive(enableCommunityQueries, (enabled) => enabled ? wish<GmailSearchRegistryOutput>({ query: "#gmailSearchRegistry" }) : null)` to conditionally discover community registry. The base pattern (gmail-agentic-search) deployed fine, but when hotel-membership-gmail-agent (which composes GmailAgenticSearch) tried to deploy, got "Too many iterations: 101" error. The wish-inside-derive creates new wish each evaluation cycle. Fix: move wish outside derive, make conditional logic in the result processing instead. (gmail-shared-search-strings)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
