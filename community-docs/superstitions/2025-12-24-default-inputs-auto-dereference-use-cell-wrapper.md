---
topic: patterns, types, cells, defaults
discovered: 2025-12-24
sessions: [labs-4/extractor-module-fix, labs-4/notes-module-auto-populate]
related_labs_docs: ~/Code/labs/docs/common/TYPES_AND_SCHEMAS.md
status: superstition
updated: 2025-12-25
---

# Default<> in Pattern Inputs Auto-Dereferences - Use Cell<Default<>> for Write Access

## Problem

Pattern inputs declared with `Default<T, V>` are **auto-dereferenced** to plain values at runtime. Attempting to call `.get()` or `.set()` on them fails with runtime errors, even though TypeScript doesn't warn.

**Example that FAILS:**

```typescript
interface ExtractorModuleInput {
  // WRONG - Will be dereferenced to plain value
  extractPhase?: Default<"select" | "extracting" | "preview", "select">;
  trashSelections?: Default<Record<number, boolean>, Record<number, never>>;
}

export default recipe<ExtractorModuleInput>(
  ({ extractPhase, trashSelections }) => {
    const startExtract = handler<unknown, { phase: any }>(
      (_event, { phase }) => {
        // TypeError: extractPhase.set is not a function
        phase.set("extracting");
      }
    );

    const toggleTrash = handler<unknown, { trash: any }>(
      (_event, { trash }) => {
        // TypeError: trashSelections.get is not a function
        const current = trash.get() || {};
        trash.set({ ...current, [0]: true });
      }
    );

    return { /* ... */ };
  }
);
```

**Runtime errors:**
```
TypeError: extractPhase.set is not a function
TypeError: trashSelections.get is not a function
```

**Symptoms:**
- Runtime errors about `.get` or `.set` not being a function
- TypeScript compiles without warnings
- Error occurs when handler tries to mutate the field
- The field appears to be `undefined` or a plain value when logged

## Solution That Seemed To Work

Wrap `Default<>` fields in `Cell<>` to preserve Cell methods:

```typescript
interface ExtractorModuleInput {
  // CORRECT - Preserves Cell methods
  extractPhase: Cell<Default<"select" | "extracting" | "preview", "select">>;
  trashSelections: Cell<Default<Record<number, boolean>, Record<number, never>>>;
}

export default recipe<ExtractorModuleInput>(
  ({ extractPhase, trashSelections }) => {
    const startExtract = handler<
      unknown,
      { phase: Cell<Default<"select" | "extracting" | "preview", "select">> }
    >((_event, { phase }) => {
      // WORKS - .set() is available
      phase.set("extracting");
    });

    const toggleTrash = handler<
      unknown,
      { trash: Cell<Default<Record<number, boolean>, Record<number, never>>> }
    >((_event, { trash }) => {
      // WORKS - .get() and .set() are available
      const current = trash.get() || {};
      trash.set({ ...current, [0]: true });
    });

    // In computed() bodies, use .get() to access value
    const currentPhase = computed(() => {
      const phase = extractPhase.get() || "select";  // WORKS
      return phase;
    });

    return { /* ... */ };
  }
);
```

**Key changes:**
1. Input type: `Default<T, V>` -> `Cell<Default<T, V>>`
2. Handler state types: Match the Cell wrapper
3. Access pattern: Use `.get()` in computed bodies, `.set()` in handlers

## Why This Works

The framework treats `Default<>` and `Cell<Default<>>` differently:

| Declaration | Runtime Type | Methods Available |
|-------------|--------------|-------------------|
| `field?: Default<T, V>` | Plain `T | V` | None - auto-dereferenced |
| `field: Cell<Default<T, V>>` | Cell wrapper | `.get()`, `.set()`, `.key()`, etc. |

**The framework auto-dereferences `Default<>` to improve ergonomics for read-only defaults.** But when you need write access, you must explicitly request it with `Cell<>`.

This aligns with the "Cell<> = write intent" principle from official docs:
- No `Cell<>` -> read-only access (reactive, but no mutation)
- With `Cell<>` -> write access (`.get()`, `.set()`, `.push()`, etc.)

## Comparison: When to Use Each Pattern

| Use Case | Input Type | Access Pattern |
|----------|------------|----------------|
| Read-only default (display only) | `field?: Default<T, V>` | Direct access: `{field}` |
| Writable default (need .set()) | `field: Cell<Default<T, V>>` | Cell methods: `field.get()`, `field.set()` |
| Local UI state | `Cell.of(defaultValue)` | Cell methods: `local.get()`, `local.set()` |

**Rule of thumb:**
- Use `Default<T, V>` when the field is read-only (never mutated)
- Use `Cell<Default<T, V>>` when handlers or computed need to mutate it
- Use `Cell.of()` for internal state not exposed as input

## Additional Gotcha: Cell<Default<>> .get() May Return Wrapper Object

**Update 2025-12-25:** When you call `.get()` on a `Cell<Default<T, V>>`, you may receive a Default type wrapper object instead of the primitive value:

```typescript
const content: Cell<Default<string, "">> = /* ... */;

// May return Default wrapper object, not string
const rawValue = content.get();
console.log(rawValue);  // Could be { [Symbol]: ..., toString: ..., ... }
console.log(typeof rawValue);  // "object" not "string"

// Need to handle both cases defensively
const actualValue = typeof rawValue === "string" ? rawValue : "";
```

**Pattern for defensive access:**
```typescript
// For primitive defaults (string, number, boolean)
const stringValue = typeof cell.get() === "string" ? cell.get() : "";
const numberValue = typeof cell.get() === "number" ? cell.get() : 0;

// For object defaults, usually fine to use directly
const objectValue = cell.get() || {};
```

This appears to be related to how the framework handles Default type wrappers at runtime. The wrapper object has methods like `toString()` that sometimes get called automatically in JSX contexts, but explicit type checking is safer.

## Relation to Other Patterns

This is **different from** `2025-12-04-default-inputs-readonly-use-local-cell.md`:
- That issue: Default inputs may be read-only when parent doesn't provide them
- That solution: Create local `Cell.of()` for UI state
- This issue: Default inputs are auto-dereferenced regardless of parent
- This solution: Wrap in `Cell<>` to preserve Cell methods

Both involve `Default<>` but have different root causes and solutions.

## Context

Discovered while implementing the ExtractorModule pattern:
- Pattern needed mutable state fields for UI (phase, selections)
- Initially declared as `Default<T, V>` for default values
- Runtime errors appeared when handlers called `.get()` and `.set()`
- TypeScript compiled without warnings
- Fix: Wrapped all mutable fields in `Cell<Default<>>`
- File: `packages/patterns/record/extraction/extractor-module.tsx`
- Commit: `45d7e478f` - "fix(extract): use Cell<Default<>> for mutable state fields"

**Code changes:**
- Lines 52-61: Changed input interface from `Default<>` to `Cell<Default<>>`
- Lines 382-427: Updated handler state types to match
- Lines 667-773: Added `.get()` calls in computed bodies

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/TYPES_AND_SCHEMAS.md` (Cell<> = write intent, Default<> for schemas)
- **Related superstition:** `2025-12-04-default-inputs-readonly-use-local-cell.md` (different issue: read-only defaults)
- **Related superstition:** `2025-12-20-pattern-output-proxy-auto-dereferences.md` (outputs auto-dereference)
