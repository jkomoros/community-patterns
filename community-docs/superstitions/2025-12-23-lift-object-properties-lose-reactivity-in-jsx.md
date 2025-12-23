# SUPERSTITION: Object Properties from lift() Lose Reactivity in JSX Text Interpolation

**WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

When `lift()` returns an object and JSX accesses individual properties in text interpolation, the reactive tracking breaks and the UI never updates.

## Problem

When you use `lift()` to return an object with multiple properties, and then access those properties individually in JSX text nodes (like `{displayInfo.icon} {displayInfo.label}`), the text nodes are created with the initial values but never update when the lift recomputes.

### What Didn't Work

```typescript
// BROKEN - object properties don't trigger UI updates
const displayInfo = lift(({ entry }) => {
  const def = definitions.find(d => d.type === type);
  const charmLabel = entry?.get()?.label;
  return {
    icon: def?.icon || "📋",
    label: charmLabel || def?.label || type,
  };
})({ entry });

// JSX usage:
<div>{displayInfo.icon} {displayInfo.label}</div>
// Text nodes show initial values and NEVER update!
```

**Symptom:** UI shows stale data. When the underlying cells change and lift recomputes, the text in the DOM doesn't update. Module headers show wrong labels after template application.

## Solution That Seemed to Work

**Option 1: Return a single combined string from lift()**

```typescript
// WORKS - single string updates atomically
const displayText = lift(({ entry }) => {
  const def = definitions.find(d => d.type === type);
  const charmLabel = entry?.get()?.label;
  const icon = def?.icon || "📋";
  const label = charmLabel || def?.label || type;
  return `${icon} ${label}`;
})({ entry });

// JSX usage:
<div>{displayText}</div>
// Text node updates correctly! ✓
```

**Option 2: Use computed() instead of lift()**

```typescript
// ALSO WORKS - computed() maintains reactivity differently
const displayInfo = computed(() => {
  const def = definitions.find(d => d.type === type);
  const charmLabel = entry?.get()?.label;
  return {
    icon: def?.icon || "📋",
    label: charmLabel || def?.label || type,
  };
});

// JSX usage:
<div>{displayInfo.icon} {displayInfo.label}</div>
// Text nodes update correctly! ✓
```

**Result:** UI updates reactively when underlying data changes.

## Context

- **Pattern:** members.tsx / record.tsx module header display bug
- **Use case:** Record pattern showing wrong module labels after TypePicker template application
- **Framework:** CommonTools reactive proxy system
- **Discovered:** 2025-12-22/23 during members module development

## Theory / Hypothesis

This is **INTENTIONAL design**, not a bug. The reactive system is architected to track cells and proxies, not primitives.

### Root Cause Chain:

1. `displayInfo` is a reactive proxy created by `createQueryResultProxy` (from lift's return value)
2. Accessing `.icon` returns another proxy for the nested property path
3. JSX text interpolation coerces the proxy to a primitive string via `.toString()`
4. `effect()` in `render.ts` receives the primitive value, not the proxy
5. Since primitives don't have `.sink()`, no reactive subscription is created
6. Text node is created once with the primitive value and never updates

### Key Insight:

The reactive system in `packages/runner/src/reactivity.ts` only tracks `SinkableCell` types:

```typescript
// From reactivity.ts lines 21-30
export function effect(fn: () => void | (() => void)): () => void {
  // ...
  const sink: Sink = (value, source) => {
    // Only called if source has .sink() method
  };
  // ...
}
```

Primitives (strings, numbers) don't have `.sink()`, so they can't be tracked. This is fundamental to the architecture.

### Why computed() Works:

`computed()` likely maintains Cell wrappers around the object properties, preserving their reactive nature through the access chain.

### Why Single Strings Work:

When lift returns a primitive directly, the proxy itself is what gets accessed, and the proxy has `.sink()`, so reactivity is preserved for that single value.

## Related Official Docs

- `/packages/html/src/render.ts` (lines 214-244) - `effect()` and text node creation logic
- `/packages/runner/src/query-result-proxy.ts` - Property access returns proxies
- `/packages/runner/src/reactivity.ts` (lines 21-30) - `effect()` only tracks SinkableCell

## Metadata

```yaml
topic: reactive-proxies, lift, jsx-text-interpolation
discovered: 2025-12-23
confirmed_count: 1
last_confirmed: 2025-12-23
sessions: [members-module-development]
related_labs_docs:
  - packages/html/src/render.ts
  - packages/runner/src/query-result-proxy.ts
  - packages/runner/src/reactivity.ts
status: superstition
stars:
```

## Guestbook

- 2025-12-23 - Module headers showed stale labels after TypePicker template changes. Fixed by returning combined string from lift() instead of object with separate icon/label properties. (members-module-development)

---

**Remember: This is just one observation. Test thoroughly in your own context!**
