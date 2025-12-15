# Don't Use .get() on Inline computed() in .map() Callbacks

**Status:** Folk Wisdom (CORRECTED by framework author 2025-12-14)

> **CORRECTION (2025-12-14):** Framework author clarified: Creating `computed()` inside `.map()` **SHOULD work** and is "actually the better style." The issue is using `.get()` to read from it. Also, the original comment was wrong - it doesn't recompute on every render, it computes whenever readUrls changes.

> **Note (2025-12-12):** Framework author guidance: "You should just never rely on derives, ONLY use computed()." See `blessed/computed-over-derive.md`.

## Problem

When rendering a list with `.map()` and creating `computed()` inside the callback, using `.get()` to read from the computed causes issues:
- CPU spin (260%+ observed)
- Tab crashes
- Page becomes unresponsive

```typescript
// BAD - Uses .get() to read from inline computed
{myList.map((item) => {
  const isRead = computed(() => readUrls.get().includes(item.url));
  return (
    <div style={{ opacity: isRead.get() ? 0.6 : 1 }}>  // <-- .get() is the problem!
      {isRead.get() ? "✓" : "○"} {item.title}
    </div>
  );
})}
```

**Note:** The computed() itself is fine and is "actually the better style" per framework author. The issue is calling `.get()` on it.

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
- No `.get()` calls on reactive values during render
- Clean separation: reactivity in computed(), plain values in UI

## Alternative: Use Inline computed() Without .get()

Per framework author (2025-12-14), inline `computed()` is actually "the better style" - you just can't use `.get()` on it:

```typescript
// GOOD - Inline computed() without .get() (framework author approved)
{myList.map((item) => {
  const isRead = computed(() => readUrls.get().includes(item.url));
  return (
    <div style={{ opacity: isRead ? 0.6 : 1 }}>  // No .get()!
      {isRead ? "✓" : "○"} {item.title}
    </div>
  );
})}
```

**Note:** This needs verification - how does this work without `.get()`? Framework may auto-unwrap computed values in JSX context.

## General Rule

**Don't call `.get()` on reactive values created inside render callbacks.** Either pre-compute at statement level, or use inline computed() without `.get()` (per framework author guidance).

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
- 2025-12-14 - **CORRECTION**: Framework author clarified that inline `computed()` SHOULD work and is "the better style." The issue is using `.get()` to read from it. Original explanation was wrong. (jkomoros)
