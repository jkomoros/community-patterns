# Cell.of() Inside Sub-Pattern Breaks generateObject Reactivity

**Date**: 2025-12-19
**Severity**: Critical
**Component**: Sub-patterns, generateObject, Cell.of()

## Summary

When a sub-pattern (composed pattern) creates `Cell.of()` internally as a default value, `generateObject` reactivity breaks. The LLM call will never fire, even though the trigger cell updates correctly.

This is distinct from the "optional non-Cell inputs" issue - this specifically affects Cell creation inside sub-patterns.

## Symptoms

1. Sub-pattern's generateObject never fires
2. `pending` stays false, no network requests to LLM endpoint
3. Parent pattern works fine when it creates the Cell and passes it as a prop

## Root Cause

When `Cell.of()` is created inside a sub-pattern function body and used as a default value:
```typescript
// Inside sub-pattern
const effectiveSchema = schemaInput ?? Cell.of(DEFAULT_SCHEMA);
```

The reactive graph is not properly established for `generateObject`. The framework appears to require that Cells passed to `generateObject` be created in the parent pattern's scope.

## Failing Pattern

```typescript
// Sub-pattern that BREAKS generateObject
const SubPattern = pattern<{ schema?: Cell<object>; trigger: Cell<string> }>(
  ({ schema: schemaInput, trigger }) => {
    // THIS BREAKS IT - Cell.of() inside sub-pattern body
    const effectiveSchema = schemaInput ?? Cell.of(DEFAULT_SCHEMA);

    const { result, pending } = generateObject({
      prompt: trigger,
      schema: effectiveSchema,  // ❌ Won't work if schemaInput not provided
    });
    // ...
  }
);

// Parent using sub-pattern WITHOUT passing schema
const Parent = pattern(() => {
  const trigger = cell("");
  const sub = SubPattern({ trigger });  // ❌ generateObject never fires!
  // ...
});
```

## Working Pattern

```typescript
// Parent MUST create Cell.of() and pass it to sub-pattern
const Parent = pattern(() => {
  const trigger = cell("");
  const schema = Cell.of(DEFAULT_SCHEMA);  // ✅ Create Cell in parent

  const sub = SubPattern({
    trigger,
    schema,  // ✅ Pass to sub-pattern
  });
  // ...
});
```

## The Fix

**Option 1: Always pass Cell props from parent**
- Export schema/config constants from sub-pattern module
- Require parent to wrap in Cell.of() and pass as props
- Document that these props are required for generateObject to work

**Option 2: Export pre-built helpers**
```typescript
// In sub-pattern module
export const ITEM_LIST_SCHEMA = { ... };
export const ITEM_LIST_SYSTEM_PROMPT = "...";

// In parent pattern
import { SubPattern, ITEM_LIST_SCHEMA, ITEM_LIST_SYSTEM_PROMPT } from "./sub-pattern";

const schema = Cell.of(ITEM_LIST_SCHEMA);
const systemPrompt = Cell.of(ITEM_LIST_SYSTEM_PROMPT);

const sub = SubPattern({ trigger, schema, systemPrompt });
```

## Test Evidence

`test-import-review-items.tsx`:
- Without explicit schema prop: generateObject never fires, 0 network requests
- With schema Cell created in parent: Works correctly, items extracted

## What Works

- `Cell.of()` created in parent pattern and passed as prop - ✅ WORKS
- Constants defined at module level - ✅ WORKS (as long as parent wraps in Cell.of())
- `cell<T>()` for local state inside sub-pattern - ✅ WORKS (not used with generateObject)

## What Breaks

- `Cell.of()` created inside sub-pattern body as default - ❌ BREAKS generateObject
- Module-level `Cell.of()` used as fallback inside sub-pattern - ❌ Also breaks (tested)

## Related

- `2025-12-17-optional-non-cell-inputs-break-generateobject.md` - Related but different issue
- `lib/import-review.tsx` - Fixed by exporting ITEM_LIST_SCHEMA constants
- `test-import-review-items.tsx` - Test pattern demonstrating the fix

## Tags

`generateObject` `reactivity` `sub-pattern` `Cell.of` `composed-patterns`
