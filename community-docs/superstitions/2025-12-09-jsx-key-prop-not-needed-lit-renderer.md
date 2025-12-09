# JSX `key` Prop Not Needed - Lit Renderer

**WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Observation

Unlike React, the CommonTools framework does NOT require (or even support) the `key=` prop on mapped JSX elements. The framework uses Lit for rendering, not React's virtual DOM reconciliation.

## What Didn't Work

```typescript
// Causes compiler error: Type 'string' is not assignable to type 'number | CellLike<number | undefined> | undefined'
{items.map((item) => (
  <div key={item.id}>  // ❌ ERROR - key prop not supported
    {item.name}
  </div>
))}
```

**Error:**
```
CompilerError: [ERROR] Type 'string' is not assignable to type 'number | CellLike<number | undefined> | undefined'.
```

## What Works

Simply remove the `key` prop entirely:

```typescript
// Works fine without key
{items.map((item) => (
  <div>  // ✅ No key needed
    {item.name}
  </div>
))}
```

## Why This Works

The CommonTools framework uses Lit (lit-html) for rendering, not React. Lit has its own change detection mechanism that doesn't rely on React-style keys for list reconciliation.

Reference pattern: `patterns/jkomoros/shopping-list.tsx` - uses `.map()` extensively without any `key` props.

## Context

- Discovered when adding calendar filter chips to calendar-viewer.tsx
- Error occurred at compile/deploy time, not runtime
- Removing `key={name}` from mapped buttons fixed the issue immediately

## Metadata

```yaml
topic: jsx
discovered: 2025-12-09
confirmed_count: 1
last_confirmed: 2025-12-09
sessions: [calendar-viewer-filter-enhancement]
related_labs_docs: none
status: superstition
stars: ⭐
```

---

**Remember: This is just one observation. Test thoroughly in your own context!**
