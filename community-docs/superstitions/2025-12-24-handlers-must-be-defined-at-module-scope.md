# SUPERSTITION: Handlers Must Be Defined at Module Scope, Not Inside Recipe Body

**WARNING: This is a SUPERSTITION - unverified folk knowledge from one observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

Handler definition placement - module scope vs inside recipe/pattern function body

## Problem

When you define a `handler<Event, Context>()` **inside** a recipe/pattern function body, and then try to invoke it, you get "Tried to access a reactive reference outside a reactive context" errors.

**This affects:**
- Handlers defined as `const myHandler = handler<...>()` inside the recipe body
- Any handler that needs to call `.get()` or `.set()` on Cells passed via context

### What Didn't Work

```typescript
export const MyModule = recipe<Input, Output>(
  "MyModule",
  ({ parentCell, otherCell }) => {

    // Other computed values...
    const someComputed = computed(() => { ... });

    // INSIDE the recipe body - causes reactive context errors
    const startAction = handler<
      unknown,
      {
        parentCell: Cell<SomeType[]>;
        otherCell: Cell<string>;
      }
    >(
      (_event, { parentCell, otherCell }) => {
        const data = parentCell.get();  // ERROR here!
        otherCell.set("new value");     // ERROR here!
      },
    );

    return {
      [UI]: (
        <button onClick={startAction({ parentCell, otherCell })}>
          Do Action
        </button>
      ),
    };
  },
);
```

**Symptom:**
```
Error: Tried to access a reactive reference outside a reactive context.
Use `computed()` to perform operations on reactive values - it handles closures automatically.
```

**Why:** Handlers defined inside the recipe body capture reactive values via closure. When the handler runs (which is outside the reactive render context), accessing those captured values triggers reactive access errors.

## Solution That Worked

**Move handler definitions to MODULE SCOPE** (outside and before the recipe function):

```typescript
// AT MODULE SCOPE - before the recipe definition
const startAction = handler<
  unknown,
  {
    parentCell: Cell<SomeType[]>;
    otherCell: Cell<string>;
  }
>(
  (_event, { parentCell, otherCell }) => {
    const data = parentCell.get();  // Works!
    otherCell.set("new value");     // Works!
  },
);

// Now define the recipe
export const MyModule = recipe<Input, Output>(
  "MyModule",
  ({ parentCell, otherCell }) => {

    // Other computed values...
    const someComputed = computed(() => { ... });

    return {
      [UI]: (
        <button onClick={startAction({ parentCell, otherCell })}>
          Do Action
        </button>
      ),
    };
  },
);
```

**Result:** The handler receives actual Cell references via its context parameter and can call `.get()`, `.set()`, `.push()`, etc. without errors.

## Context

- **Pattern:** extractor-module.tsx in labs-4/packages/patterns/record/extraction/
- **Use case:** AI Extract module with handlers for "Extract" and "Apply" buttons
- **Framework:** CommonTools with TypeScript
- **Error location:** onClick handlers that need to modify multiple Cells from the parent pattern

## Theory / Hypothesis

There's a fundamental difference in how handlers are evaluated based on where they're defined:

1. **Handler defined INSIDE recipe body:**
   - The handler definition itself is part of the reactive recipe evaluation
   - Variables from the recipe scope (including Cells) get captured in the closure
   - When the handler later invokes, it's OUTSIDE the reactive context
   - Accessing the captured reactive references triggers the error

2. **Handler defined at MODULE SCOPE:**
   - The handler definition is evaluated once when the module loads
   - No reactive context exists at module evaluation time
   - The handler receives Cells via its context parameter at invocation time
   - The framework correctly passes Cell references through the handler parameter system
   - `.get()`, `.set()`, etc. work correctly

**Mental model:**
```
Inside recipe body:   handler captures reactive refs via closure -> ERROR when invoked
At module scope:      handler receives Cells via parameters -> Works correctly
```

## Key Differences from Related Superstition

This is DIFFERENT from the "Pass Cells as Handler Parameters, Not Closure" superstition which covers Cells being unwrapped inside reactive contexts like `.map()` and `computed()`.

**That superstition:** Cells captured from closure INSIDE `.map()`/`computed()` get unwrapped to plain values (losing Cell methods)

**This superstition:** Handlers defined INSIDE the recipe body fail with "reactive reference outside reactive context" when invoked

Both are about closures and reactivity, but the symptoms and root causes differ:
- Other superstition: `.set is not a function` (Cell unwrapped to value)
- This superstition: "reactive reference outside reactive context" (accessing reactive ref at wrong time)

## Examples

### Pattern: Module-scope handlers

```typescript
// GOOD: Handler at module scope
const dismiss = handler<
  unknown,
  {
    items: Cell<Item[]>;
    trashedItems: Cell<Item[]>;
  }
>((_event, { items, trashedItems }) => {
  const current = items.get() || [];
  const selfEntry = current.find((e) => e?.type === "extractor");
  if (!selfEntry) return;

  items.set(current.filter((e) => e?.type !== "extractor"));
  trashedItems.push({
    ...selfEntry,
    trashedAt: new Date().toISOString(),
  });
});

// Recipe uses the module-scope handler
export const ExtractorModule = recipe<Input, Output>(
  "ExtractorModule",
  ({ items, trashedItems }) => {
    return {
      [UI]: (
        <button onClick={dismiss({ items, trashedItems })}>
          Dismiss
        </button>
      ),
    };
  },
);
```

### Antipattern: Handler inside recipe

```typescript
// BAD: Handler defined inside recipe body
export const ExtractorModule = recipe<Input, Output>(
  "ExtractorModule",
  ({ items, trashedItems }) => {

    // This will cause "reactive reference outside reactive context" errors!
    const dismiss = handler<unknown, { items: Cell<Item[]> }>(
      (_event, { items }) => {
        const current = items.get();  // ERROR!
        items.set(current.filter(...));  // ERROR!
      },
    );

    return {
      [UI]: (
        <button onClick={dismiss({ items })}>
          Dismiss
        </button>
      ),
    };
  },
);
```

## Verification Steps

If you hit "Tried to access a reactive reference outside a reactive context" in a handler:

1. Check if the handler is defined **inside** the recipe/pattern function body
2. Move the handler definition **outside** the recipe, to module scope
3. Ensure all Cells needed are passed via the handler's context parameter
4. Verify the handler works after the move

## Related Patterns

- **Superstition: Pass Cells as Handler Parameters, Not Closure** - Related issue about Cell unwrapping in reactive contexts
- **Superstition: Prebind Handlers Outside Derive** - Related issue about handlers in computed/derive contexts
- **Handler Pattern Documentation** - Official docs on handler usage

## Metadata

```yaml
topic: handlers, recipe, module-scope, reactive-context, closure, cell-methods
discovered: 2025-12-24
confirmed_count: 1
last_confirmed: 2025-12-24
sessions: [ai-extract-handler-fix]
related_functions: handler, recipe, Cell.get, Cell.set
related_patterns: extractor-module, controller-modules
status: superstition
stars: N/A
```

## Guestbook

- 2025-12-24 - Spent significant time debugging "Tried to access a reactive reference outside a reactive context" errors in extractor-module.tsx. Had `startExtraction` and `applySelected` handlers defined inside the recipe body. Moving them to module scope (before the `ExtractorModule = recipe<>()` definition) fixed the issue completely. Handlers now receive Cells via context parameters and `.get()`, `.set()` work correctly. (ai-extract-handler-fix, labs-4 repo)

---

**Remember: This is just one observation. Test thoroughly in your own context!**

**TIP:** If you see "Tried to access a reactive reference outside a reactive context" inside a handler, check if the handler is defined inside your recipe/pattern function. Move it to module scope!
