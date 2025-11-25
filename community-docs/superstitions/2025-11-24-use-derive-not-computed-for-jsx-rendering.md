# ⚠️ LIKELY WRONG: Use derive() Not computed() for Reactive JSX Rendering

**🚨 UPDATE 2025-11-25: This superstition is LIKELY WRONG.**

Code review of `packages/runner/src/builder/module.ts` shows:
- `derive(input, fn)` → calls `lift(fn)(input)` → returns `OpaqueRef<T>`
- `computed(fn)` → calls `lift(fn)(undefined)` → returns `OpaqueRef<T>`

**Both return `OpaqueRef<T>`** - they are fundamentally the same! The only difference is that `derive()` takes explicit input dependencies while `computed()` captures them from closures.

The `[object Object]` issue observed was likely caused by something else (perhaps a different bug that happened to be fixed when refactoring to use `derive()`).

---

**⚠️ ORIGINAL WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

Rendering reactive JSX content - `derive()` vs `computed()`

## Problem

When embedding reactive content inside JSX, using `computed(() => { return <JSX/> })` causes weird rendering issues:
- UI shows `[object Object]` or strange fragments instead of actual content
- JSX elements don't render properly
- Buttons/text appear as object representations

### What Didn't Work

```typescript
// ❌ Using computed() to return JSX
<div>
  {computed(() => {
    const value = someCell.get();

    if (value === "pending") {
      return <div>Loading...</div>;
    }

    return <div>Content: {value}</div>;
  })}
</div>
```

**Symptom:** The UI shows something like:
- `[object Object]` text
- Weird JSX fragment representations
- Content doesn't render as actual HTML elements

**Why:** `computed()` returns a `Cell` object, not rendered JSX. When that Cell is embedded in JSX, it gets converted to a string representation of the object.

## Solution That Seemed to Work

Use `derive()` with explicit dependencies instead of `computed()`:

```typescript
// ✅ Using derive() to return JSX
<div>
  {derive(
    { value: someCell },
    ({ value }) => {
      if (value === "pending") {
        return <div>Loading...</div>;
      }

      return <div>Content: {value}</div>;
    }
  )}
</div>
```

**Result:** JSX renders properly as HTML elements, reactively updating when dependencies change.

## Context

- **Pattern:** store-mapper.tsx
- **Use case:** Conditionally rendering different UI states (pending, success, error) based on LLM response
- **Framework:** CommonTools JSX with reactive cells
- **Error location:** Photo extraction results section showing analysis status

## Theory / Hypothesis

The difference between `computed()` and `derive()`:

1. **computed()**:
   - Returns a `Cell<T>`
   - Meant for computed values that will be read via `.get()`
   - Not designed for direct JSX embedding
   - When embedded in JSX, gets coerced to string → `[object Object]`

2. **derive()**:
   - Can return any type including JSX/RenderNode
   - Explicitly declares dependencies in first argument
   - Framework knows how to render the returned JSX
   - Properly re-renders when dependencies change

**Mental model:**
- Use `computed()` for **values** you'll read with `.get()`
- Use `derive()` for **rendering** JSX reactively

## Examples

### ❌ Don't use computed() for JSX:
```typescript
// DON'T DO THIS
{computed(() => {
  const pending = extraction.pending;
  const result = extraction.result;

  if (pending) return <div>Analyzing...</div>;
  if (!result) return <div>No results</div>;
  return <div>Found: {result.items.length} items</div>;
})}
```

### ✅ Do use derive() for JSX:
```typescript
// DO THIS INSTEAD
{derive(
  { pending: extraction.pending, result: extraction.result },
  ({ pending, result }) => {
    if (pending) return <div>Analyzing...</div>;
    if (!result) return <div>No results</div>;
    return <div>Found: {result.items.length} items</div>;
  }
)}
```

### ✅ computed() is fine for values:
```typescript
// This is fine - you'll call .get() on it
const itemCount = computed(() => {
  const items = itemsCell.get();
  return items.length;
});

// Later:
<div>Total: {itemCount}</div>  // ✅ Works because it's a primitive value
```

### ✅ derive() for complex conditional rendering:
```typescript
{derive(
  {
    isPending: assignment.pending,
    extractedData: assignment.extractedAisles,
    currentAisles: aisles
  },
  ({ isPending, extractedData, currentAisles }) => {
    // Show pending state
    if (isPending) {
      return (
        <div style={{ color: "#16a34a" }}>
          Analyzing photo...
        </div>
      );
    }

    // Show error state
    if (!extractedData || extractedData.aisles.length === 0) {
      return (
        <div style={{ color: "#999" }}>
          No aisles detected
        </div>
      );
    }

    // Show results
    return (
      <div>
        Found {extractedData.aisles.length} aisles
        {/* ... more complex JSX ... */}
      </div>
    );
  }
)}
```

## Key Differences Summary

| Feature | `computed()` | `derive()` |
|---------|-------------|-----------|
| **Returns** | `Cell<T>` | `T` (unwrapped) |
| **Use for** | Computed values | Rendered content |
| **Dependencies** | Implicit (via `.get()`) | Explicit (first arg) |
| **JSX embedding** | ❌ Shows `[object Object]` | ✅ Renders properly |
| **Access pattern** | Call `.get()` | Use directly |

## Related Official Docs

- CommonTools reactivity documentation
- Cell documentation
- derive() vs computed() comparison (if exists)

The official docs may not explicitly warn that `computed()` shouldn't be used for JSX rendering.

## Metadata

```yaml
topic: jsx-rendering, computed, derive, reactivity, cells
discovered: 2025-11-24
confirmed_count: 1
last_confirmed: 2025-11-24
sessions: [fix-grocery-list-bugs]
related_functions: computed, derive
related_patterns: Cell, JSX, conditional-rendering
status: superstition
stars: ⭐
```

## Guestbook

- ⭐ 2025-11-24 - Fixed weird JSX fragments in store-mapper pattern - Using `computed(() => { return <JSX/> })` showed `[object Object]` in UI. Changed to `derive({ deps }, ({ deps }) => { return <JSX/> })` and JSX renders properly. UI suggestions section now shows clean buttons instead of object representations. (fix-grocery-list-bugs)
- ❌ 2025-11-25 - Code review shows `derive()` and `computed()` both return `OpaqueRef<T>` via `lift()`. The original fix likely addressed a different issue. Marking as LIKELY WRONG. (update-patterns-for-labs-changes)

---

**Remember: This is just one observation. Test thoroughly in your own context!**
