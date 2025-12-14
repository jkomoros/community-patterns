# Never Create computed() Inside .map() Callbacks

**Status:** Folk Wisdom (verified - root cause understood)

> **See also:** `folk_wisdom/2025-12-14-computed-must-be-statement-level.md` for the comprehensive explanation of WHY this happens (node identity and CTS transformation).

> **Note (2025-12-14):** Root cause verified through code analysis. The issue is that `computed()` created inside any function call (`.map()`, `ifElse()`, etc.) creates a **new reactive node on every render**, breaking the dependency chain. Nodes need stable identity to maintain reactive connections.

> **Note (2025-12-12):** Framework author guidance: "You should just never rely on derives, ONLY use computed()." See `blessed/computed-over-derive.md`. This superstition's **solution** uses `derive()`, which should be replaced with `computed()` per framework guidance. The core issue (don't create reactive primitives inside `.map()`) remains valid.

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
// GOOD - Compute once in a computed(), use plain values in render
const listWithReadState = computed(() => {
  return myList.map((item) => ({
    ...item,
    isRead: readUrls.includes(item.url),
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
- Clean separation: reactivity in computed(), plain values in UI

## General Rule

**Never create reactive primitives (`computed()`, `Cell.of()`) inside render callbacks.** All reactive state should be defined at the top level of your pattern function, before the return statement.

## Symptoms to Watch For

- Page constantly flashing/re-rendering
- High CPU usage (check Activity Monitor)
- Tab becoming unresponsive
- Browser tab crash

## Metadata

```yaml
topic: computed, map, reactivity, performance, infinite-loop, node-identity
discovered: 2025-11-29
verified: 2025-12-14
session: prompt-injection-tracker-map-approach
status: folk_wisdom
related: folk_wisdom/2025-12-14-computed-must-be-statement-level.md
```

## Guestbook

- 2025-11-29 - Discovered while building prompt-injection-tracker-v3. Had `computed()` inside `.map()` to check if items were read. Caused 260% CPU and tab crash. Fixed by pre-computing isRead flag in a computed. (prompt-injection-tracker-map-approach)
- 2025-12-14 - Root cause verified: inline `computed()` creates new reactive node on every render, breaking node identity needed for dependency tracking. Same issue affects `ifElse()` and any inline context. (extracurricular-selector / jkomoros)
