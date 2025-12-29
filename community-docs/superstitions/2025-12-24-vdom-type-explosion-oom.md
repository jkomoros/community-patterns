# ⚠️ SUPERSTITION: VDOM Type Explosion Causing OOM

**⚠️ WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

TypeScript OOM errors during compilation when patterns return VDOM properties without explicit output interfaces

## Problem

When a pattern/recipe returns VDOM-producing properties (like `[UI]`, `settingsUI`, `fabUI`, `sidebarUI`, `embeddedUI`, `previewUI`) without declaring them in an explicit output interface, TypeScript attempts to infer the full recursive `RenderNode` type. This causes exponential type expansion that can exhaust memory and crash the TypeScript compiler during CI builds.

### Symptom

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

During `npm run build` or TypeScript compilation, especially in CI environments with memory constraints.

### Root Cause

TypeScript's type inference tries to deeply analyze the entire VDOM tree structure when you return JSX without constraining the output type. The `RenderNode` type is deeply recursive, and without an explicit constraint, TypeScript explores all possible type paths exponentially.

## What Doesn't Work

```typescript
// ❌ BAD - causes OOM during TypeScript compilation
export const MyModule = recipe<MyInput, MyInput>(
  "MyModule",
  (input) => {
    return {
      [UI]: <div>...</div>,
      settingsUI: <div>...</div>,  // TypeScript infers full VDOM type = OOM
      fabUI: <CustomComponent />,
      ...input
    };
  }
);
```

**Problem:** The return type is inferred from `MyInput`, but the actual return includes VDOM properties. TypeScript tries to deeply infer the exact structure of each JSX element, causing type explosion.

## Solution That Works

Declare an explicit output interface with `unknown` for any VDOM-returning properties:

```typescript
// ✅ GOOD - prevents OOM
interface MyModuleOutput extends MyInput {
  [NAME]: unknown;
  [UI]: unknown;
  settingsUI: unknown;  // `unknown` prevents deep type inference
  fabUI: unknown;
  sidebarUI: unknown;
  embeddedUI: unknown;  // Minimal UI for ct-render variant="embedded"
  previewUI: unknown;   // Preview UI for pickers/lists
}

export const MyModule = recipe<MyInput, MyModuleOutput>(
  "MyModule",
  (input) => {
    return {
      [UI]: <div>...</div>,
      settingsUI: <div>...</div>,
      fabUI: <CustomComponent />,
      ...input
    };
  }
);
```

**Why this works:** The `unknown` type tells TypeScript "don't try to infer this deeply - just accept it as an opaque value." This prevents the recursive type expansion while still maintaining type safety for the actual data properties.

## Context

- **Issue:** CT-1143
- **Pattern affected:** PhotoModule (packages/patterns/photo.tsx)
- **Revert commit:** 2f4ed7168 "Revert PhotoModule to fix CI OOM (#2369)"
- **Reference implementation:** packages/patterns/system/default-app.tsx (lines 30-38)

## Evidence

1. PhotoModule was introduced with settingsUI pattern in commit 5047799f7
2. CI builds started failing with OOM errors during TypeScript compilation
3. PhotoModule was reverted in commit 2f4ed7168 to restore CI stability
4. default-app.tsx demonstrates the correct pattern with explicit output interface

## Pattern to Follow

Look at `default-app.tsx` for the canonical example:

```typescript
// From packages/patterns/system/default-app.tsx
type CharmsListInput = void;

interface CharmsListOutput {
  [key: string]: unknown;  // Catch-all for safety
  backlinksIndex: {
    mentionable: MentionableCharm[];
  };
  sidebarUI: unknown;  // VDOM property = unknown
  fabUI: unknown;      // VDOM property = unknown
}

export default pattern<CharmsListInput, CharmsListOutput>((_) => {
  // ... implementation
  return {
    backlinksIndex: index,
    [NAME]: computed(() => `DefaultCharmList (${visibleCharms.length})`),
    [UI]: <ct-screen>...</ct-screen>,
    sidebarUI: undefined,
    fabUI: fab[UI],
  };
});
```

## When to Apply This Pattern

Use explicit output interfaces with `unknown` for VDOM properties when:

1. Your pattern/recipe returns any UI-related properties (`[UI]`, `settingsUI`, `fabUI`, `sidebarUI`, `embeddedUI`, `previewUI`, etc.)
2. You're creating patterns that will be used in CI/build environments
3. You notice TypeScript compilation becoming slow or memory-intensive
4. You're exporting patterns that other patterns will compose

## Key Points

1. **Always use explicit output interface** when returning VDOM properties
2. **Use `unknown` type** for all properties that return JSX/RenderNode
3. **Include symbol properties** like `[NAME]` and `[UI]` in the interface
4. **Extend input type** if you're spreading input properties into output
5. **Don't try to type VDOM deeply** - let the runtime handle it

## Theory / Hypothesis

TypeScript's structural type system tries to verify that the return type matches the declared type. When you return JSX elements without constraining the type:

1. TypeScript sees you're returning an object with JSX properties
2. It tries to infer the exact type of each JSX element
3. JSX elements have deeply recursive types (children can contain children can contain children...)
4. TypeScript explores all possible type paths
5. The number of type operations grows exponentially
6. Memory exhaustion occurs before type checking completes

Using `unknown` short-circuits this process - it's a top type that matches anything, so TypeScript doesn't need to explore the VDOM structure.

## Related Official Docs

- `~/Code/labs-2/docs/common/PATTERNS.md` - Pattern documentation
- `~/Code/labs-2/packages/patterns/system/default-app.tsx` - Reference implementation

## Metadata

```yaml
topic: typescript
subtopic: type-inference, vdom, compilation
discovered: 2025-12-24
confirmed_count: 1
last_confirmed: 2025-12-24
issue: CT-1143
related_commits: [2f4ed7168, 5047799f7]
related_files:
  - packages/patterns/system/default-app.tsx
  - packages/patterns/photo.tsx (reverted)
status: superstition
stars: ⭐⭐
severity: critical
```

## Guestbook

- ⭐⭐ 2025-12-24 - PhotoModule caused CI OOM due to settingsUI type inference, fixed by reverting (CT-1143)

---

**Remember: This is just one observation. Test thoroughly in your own context!**

**CRITICAL: If you're creating patterns with UI exports, use explicit output interfaces with `unknown` for VDOM properties to prevent OOM during compilation.**
