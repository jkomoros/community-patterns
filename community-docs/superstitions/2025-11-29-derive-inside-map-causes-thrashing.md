# computed() Inside Map Callbacks Causes Reactivity Loops

> **Note (2025-12-10):** This superstition is NOT related to CT-1102. CT-1102 fixed `.filter().map()` chains inside `computed()` callbacks. This superstition is about a different issue: creating `computed()` cells inside `.map()` callbacks creates new cell references on each reactive pass, causing thrashing. This is about object identity/reference tracking. This remains valid.

## Summary

**Never create `computed()` cells inside `.map()` callbacks.** When deriving values that will be passed to `generateObject`, `fetchData`, or other reactive primitives inside a map, extract the computed outside the map callback. Creating computeds inside map iterations causes the framework to see "new" cells on each reactive pass, triggering constant re-evaluation (thrashing).

## The Problem

When you use `computed()` inside a `.map()` callback, each iteration of the map creates a fresh computed cell. On subsequent reactive passes, the framework sees these as different cells (new object references), which triggers re-evaluation of everything downstream.

```typescript
// ❌ BAD: computed() inside map - creates new cells each pass, causes thrashing
const urlItems = articles.map((article) => {
  const firstUrl = computed(() => article.urls?.[0] || null);

  const webContentBody = computed(() => ({ url: firstUrl, max_tokens: 4000 }));

  const webContent = fetchData({
    url: "/api/web-read",
    options: {
      method: "POST",
      body: webContentBody,  // New computed each iteration!
    },
  });

  return { url: firstUrl, webContent };
});
```

## The Fix

Move computed calls outside the map, or create them at the top level of your `processItem` function before returning:

```typescript
// ✅ GOOD: computed() outside options - stable cell references
const urlItems = articles.map((article) => {
  const firstUrl = computed(() => article.urls?.[0] || null);

  // Create computed BEFORE using in options
  const webContentBody = computed(() => ({ url: firstUrl, max_tokens: 4000 }));

  const webContent = ifElse(
    firstUrl,
    fetchData({
      url: "/api/web-read",
      options: {
        method: "POST",
        body: webContentBody,  // Reference to pre-created computed
      },
    }),
    null
  );

  return { url: firstUrl, webContent };
});
```

The key insight: **the computed must be created and assigned to a variable BEFORE being passed to fetchData/generateObject options**. This ensures the framework sees the same cell reference on each reactive pass.

## Symptoms of This Problem

1. **Console spam**: Debug logs firing constantly, hundreds of times per second
2. **UI thrashing**: Sections flickering or constantly re-rendering
3. **"Too many iterations" errors**: Framework detects reactivity loop after 100+ iterations
4. **High CPU usage**: Browser struggling with constant re-evaluation
5. **`$alias` warnings**: `[WARNING] unexpected object when value was expected {$alias: Object}`

## Why This Happens

The framework's reactivity system works by tracking cell references. When you create a computed inside a map:

1. First reactive pass: `computed(...)` creates Cell A
2. Downstream code uses Cell A
3. Something triggers re-evaluation
4. Second reactive pass: `computed(...)` creates Cell B (different object!)
5. Framework sees "new" cell, triggers downstream re-evaluation
6. Repeat forever → reactivity loop

When you create the computed outside the options object (but still in the map callback):

1. First reactive pass: `computed(...)` creates Cell A, stores in variable
2. Variable reference is passed to options
3. Re-evaluation sees same variable → same cell reference
4. No spurious downstream updates

## Related Patterns

This issue is **different from** the "cell values must be JSON-serializable" superstition. That's about what you store IN cells. This is about WHERE you create cells.

Also related to the "computed() inside map" issue documented in commit 6529af6.

## How We Found This

1. Observed constant DEBUG log spam (~100+ logs per second)
2. UI section not rendering despite counters showing data
3. Added instrumentation showing the same computed values computing repeatedly
4. Identified `computed()` calls inside `generateObject` and `fetchData` options
5. Moved computeds outside options objects
6. Thrashing stopped immediately

## Metadata

```yaml
topic: reactivity, computed, map, thrashing, generateObject, fetchData
discovered: 2025-11-29
confirmed_count: 1
last_confirmed: 2025-11-29
confidence: high
sessions: [prompt-injection-tracker-map-approach]
related_functions: computed, map, generateObject, fetchData, ifElse
related_commits: [6529af6]
stars: 5
status: confirmed
```
