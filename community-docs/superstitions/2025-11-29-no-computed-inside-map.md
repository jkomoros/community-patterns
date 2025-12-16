# Never Create computed() Inside .map() Callbacks

**Status:** Superstition (single observation)

> **Note (2025-12-10):** This superstition is NOT related to CT-1102. CT-1102 fixed `.filter().map()` chains inside `derive()` callbacks. This superstition is about a different issue: creating reactive primitives (`computed()`, `cell()`, `derive()`) inside render callbacks causes object identity issues and thrashing. This remains valid.

## Problem

When rendering a list with `.map()` and creating `computed()` inside the callback, the pattern causes:
- Infinite reactivity loops
- CPU spin (260%+ observed)
- Tab crashes
- Constant re-rendering (page flashes white repeatedly)

```typescript
// BAD - Creates new computed on every render, triggers more renders
{myList.map((item) => {
  const isRead = computed(() => readUrls.get().includes(item.url));
  return (
    <div style={{ opacity: isRead.get() ? 0.6 : 1 }}>
      {isRead.get() ? "✓" : "○"} {item.title}
    </div>
  );
})}
```

Each `computed()` creation triggers a subscription, which can trigger re-renders, which creates more `computed()` instances, causing an infinite loop.

## Solution

**Pre-compute the derived state in a `computed()` BEFORE the render:**

```typescript
// GOOD - Compute once in a computed, use plain values in render
const listWithReadState = computed(() => {
  const list = myList;
  const read = readUrls;
  return list.map((item) => ({
    ...item,
    isRead: read.includes(item.url),
  }));
});

// In render - just use the pre-computed value
{listWithReadState.map((item) => (
  <div style={{ opacity: item.isRead ? 0.6 : 1 }}>
    {item.isRead ? "✓" : "○"} {item.title}
  </div>
))}
```

## Why This Works

- `computed()` creates a single reactive computation that updates when inputs change
- The `.map()` in render only deals with plain JavaScript values
- No new reactive subscriptions created during render
- Clean separation: reactivity in computeds, plain values in UI

## General Rule

**Never create reactive primitives (`computed()`, `Cell.of()`) inside render callbacks.** All reactive state should be defined at the top level of your pattern function, before the return statement.

## Symptoms to Watch For

- Page constantly flashing/re-rendering
- High CPU usage (check Activity Monitor)
- Tab becoming unresponsive
- Browser tab crash

## Metadata

```yaml
topic: computed, map, reactivity, performance, infinite-loop
discovered: 2025-11-29
session: prompt-injection-tracker-map-approach
status: superstition
```

## Guestbook

- 2025-11-29 - Discovered while building prompt-injection-tracker-v3. Had `computed()` inside `.map()` to check if items were read. Caused 260% CPU and tab crash. Fixed by pre-computing isRead flag in a computed. (prompt-injection-tracker-map-approach)
