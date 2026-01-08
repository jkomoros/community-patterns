# Inline computed() in .map() Is Fine - Just Don't Use .get()

**Status:** Blessed (framework author confirmed 2025-12-14)
**Source:** Framework author direct guidance

## The Rule

Creating `computed()` inside `.map()` callbacks **SHOULD work** and is **"actually the better style"** per framework author.

The issue that causes problems is using `.get()` to read from it.

## What Works

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

The framework auto-unwraps computed values in JSX context, so you don't need `.get()`.

## What Doesn't Work

```typescript
// BAD - Uses .get() on inline computed
{myList.map((item) => {
  const isRead = computed(() => readUrls.get().includes(item.url));
  return (
    <div style={{ opacity: isRead.get() ? 0.6 : 1 }}>  // <-- .get() causes problems!
      {isRead.get() ? "✓" : "○"} {item.title}
    </div>
  );
})}
```

## Alternative: Pre-compute

If you need to use `.get()` for some reason, pre-compute at statement level:

```typescript
// GOOD - Compute once, use plain values in render
const listWithReadState = computed(() => {
  return myList.map((item) => ({
    ...item,
    isRead: readUrls.includes(item.url),
  }));
});

// In render - just plain values
{listWithReadState.map((item) => (
  <div style={{ opacity: item.isRead ? 0.6 : 1 }}>
    {item.isRead ? "✓" : "○"} {item.title}
  </div>
))}
```

## Framework Author Quotes (2025-12-14)

> "the reason [...] doesn't work is that it uses .get() to read from isRead. That should otherwise work and is actually the better style."

> "(The comment is also wrong, it doesn't recompute it on every render, it computes it whenever readUrls changes)"

## Previous Misconceptions Corrected

- **WRONG**: "Never create computed() inside .map() callbacks"
- **WRONG**: "Creates new computed on every render, triggers more renders"
- **RIGHT**: Inline computed() is fine and preferred, just don't call `.get()` on it

## Metadata

```yaml
topic: computed, map, reactivity, inline-computed
status: blessed
source: framework-author
date: 2025-12-14
supersedes: superstitions/2025-11-29-no-computed-inside-map.md
```
