# JSX Automatically Renders [UI] Property

**Date:** 2025-12-17
**Status:** superstition
**Confidence:** high (verified in framework source code)

## Summary

When rendering an object with a `[UI]` property in JSX, the framework automatically extracts and renders that UI. You don't need to explicitly access `object[UI]` - just render the object directly.

## The Pattern

```typescript
// You have a charm or wish result with a [UI] property
const wishResult = wish<SomeCharm>({ query: "#tag" });

// DON'T do this - unnecessary explicit access:
{wishResult.result?.[UI]}

// DO this - framework auto-extracts [UI]:
{wishResult.result}
```

## Why This Works

The framework's render system (`labs/packages/html/src/render.ts` lines 157-171) explicitly follows `[UI]` chains:

```typescript
// Follow `[UI]` to actual vdom. Do this before otherwise parsing the vnode,
// so that if there are both, the `[UI]` annotation takes precedence
while (node[UI]) {
  // Detect cycles in UI chain
  if (visited.has(node)) {
    logger.warn("render", "Cycle detected in [UI] chain", node);
    return [createCyclePlaceholder(document), cancel];
  }
  visited.add(node);
  node = node[UI];
}
```

Key behaviors:
1. The renderer enters a `while` loop that traverses the `[UI]` chain
2. It extracts the nested VNode until it reaches an actual renderable element
3. This happens **before** normal vnode rendering
4. If both `[UI]` and other vnode properties exist, `[UI]` takes precedence
5. Cycle detection prevents infinite loops

## Use Cases

### Rendering Wished Charms Inline

```typescript
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });

// Render the charm's UI inline - just use wishResult.result
return {
  [UI]: (
    <div>
      <h2>Auth Status</h2>
      {wishResult.result}  {/* Auto-renders charm's [UI] */}
    </div>
  ),
};
```

### Conditional Charm Rendering

```typescript
// If auth needs attention, render the auth charm inline
if (needsLogin) {
  return (
    <div>
      <p>Please sign in:</p>
      {wishResult.result}  {/* Shows full Google Auth UI */}
    </div>
  );
}
```

## Related

- `labs/packages/html/src/jsx.ts` - `isVNode` also follows `[UI]` chains
- `labs/packages/runner/src/builtins/wish.ts` - Wish results return objects with `[UI]`
- The `[UI]` symbol is from `commontools` package

## Verification

Confirmed by exploring:
1. `labs/packages/html/src/render.ts` - Core rendering logic
2. `labs/packages/html/src/jsx.ts` - VNode type checking
3. Multiple patterns in community-patterns that render wish results directly
