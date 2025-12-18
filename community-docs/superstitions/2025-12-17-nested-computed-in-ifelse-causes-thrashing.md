# Nested computed() in ifElse Conditions Causes Thrashing

## TL;DR - The Rule

**Never use nested `computed(() => X.property)` conditions inside ifElse when X reads from wish() results.**

```tsx
// ❌ BAD - nested computed() conditions each create reactive subscriptions
{ifElse(
  computed(() => authInfo.state === "not-found" || authInfo.state === "found-not-authenticated"),
  <ct-card>
    {ifElse(
      computed(() => authInfo.state === "not-found"),  // ANOTHER subscription!
      <JSX for not-found>,
      <JSX for found-not-authenticated>
    )}
  </ct-card>,
  null
)}

// ✅ GOOD - single derive() returning all conditional JSX
{derive(authInfo, (info) => {
  if (info.state === "not-found") return <JSX for not-found>;
  if (info.state === "found-not-authenticated") return <JSX for found-not-authenticated>;
  return null;
})}
```

---

## Summary

When using `wish()` to find a composed pattern (like Google Auth), **do NOT use multiple nested `computed()` conditions in ifElse**. Each `computed()` creates a separate reactive subscription. When the wish result updates, ALL of these subscriptions trigger simultaneously, causing cascading re-evaluations that thrash the UI.

**Use a single `derive()` that returns all conditional JSX branches instead.**

## The Problem

When you have a computed that reads from wish(), then use nested computed() conditions:

```tsx
// authInfo reads from wishResult (a composed pattern from wish())
const authInfo = computed(() => {
  const wr = wishResult;
  return { state, hasRequiredScopes, statusDotColor, statusText, charm };
});

// PROBLEM: Multiple nested computed() in UI
{ifElse(
  computed(() => authInfo.state === "X"),  // Subscription #1
  <SomeJSX>
    {ifElse(
      computed(() => authInfo.state === "Y"),  // Subscription #2
      <MoreJSX />,
      <OtherJSX />
    )}
  </SomeJSX>,
  null
)}
```

When wish() resolves and finds an auth charm:
1. `wishResult` changes
2. `authInfo` recomputes
3. ALL nested `computed()` conditions re-evaluate
4. Each triggers its own reactive update
5. Cascading re-evaluations = **100% CPU, UI thrashing**

## The Fix

Replace nested `ifElse(computed(...))` with a single `derive()` that returns JSX:

```tsx
// FIXED: Single derive() returning all conditional JSX
{derive(authInfo, (info) => {
  if (info.state === "not-found") {
    return (
      <ct-card>
        <p>No auth found</p>
        <ct-button onClick={createAuth({})}>Create Auth</ct-button>
      </ct-card>
    );
  }

  if (info.state === "found-not-authenticated") {
    return (
      <ct-card>
        <p>Found auth but not signed in</p>
        <ct-button onClick={goToAuth({ authCharm: info.charm })}>
          Go to Auth
        </ct-button>
      </ct-card>
    );
  }

  return null;  // "authenticated" or "loading"
})}
```

**Why this works:** Single derive() = single reactive subscription. All conditional logic happens inside the callback, returning the appropriate JSX. No cascading.

## Symptoms of This Problem

1. **100% CPU on both Deno and Chrome** when wish() finds an existing charm
2. **UI thrashing/flickering** - elements rapidly appearing/disappearing
3. **Pattern works initially** but thrashes when returning after favoriting auth
4. **No obvious errors** in console (unlike other reactive loops)

## How We Found This

1. Google Docs Comment Orchestrator thrashed when wish() found favorited auth
2. Initial (WRONG) hypothesis: `derive()` vs `computed()` - but docs say they're equivalent
3. Investigation revealed: gmail-importer.tsx (which works) uses single `derive()` returning JSX
4. Orchestrator used nested `ifElse(computed(...))` pattern
5. Changed to single `derive()` pattern - **fixed immediately**

## Key Insight

**`derive()` and `computed()` are functionally equivalent** (per docs). The problem isn't which one you use, it's **HOW MANY** reactive subscriptions you create in the UI render tree.

- Nested `computed()` in ifElse = N subscriptions = cascade on change
- Single `derive()` returning JSX = 1 subscription = stable updates

## Related

- `2025-12-03-avoid-composed-pattern-cells-in-derives.md` - Related: using child pattern cells
- `2025-12-16-expensive-computation-inside-map-jsx.md` - Related: N² complexity in map

## Metadata

```yaml
topic: computed, derive, ifElse, wish, thrashing, reactive-cascade
discovered: 2025-12-17
confirmed_count: 1
last_confirmed: 2025-12-17
confidence: high
sessions: [google-docs-orchestrator-thrashing-fix]
related_functions: computed, derive, ifElse, wish
related_files:
  - patterns/jkomoros/google-docs-comment-orchestrator.tsx
  - patterns/jkomoros/gmail-importer.tsx
stars: 5
status: confirmed
```

## Guestbook

- 2025-12-17 - Google Docs Comment Orchestrator thrashed at 100% CPU when returning after creating/favoriting Google Auth charm. Root cause was nested `computed(() => authInfo.state === "X")` conditions in ifElse. Fixed by replacing with single `derive(authInfo, (info) => { if (info.state === "X") return <JSX>; ... })`. UI immediately stable. Initially misdiagnosed as derive() vs computed() difference, but docs confirm they're equivalent - the issue is NUMBER of subscriptions, not which primitive you use.
