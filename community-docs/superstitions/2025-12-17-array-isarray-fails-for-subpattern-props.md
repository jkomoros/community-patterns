# Array.isArray() Returns False for Sub-Pattern Array Props

**Date:** 2025-12-17
**Author:** jkomoros
**Pattern:** import-review.tsx, person.tsx
**Status:** Superstition (confirmed behavior, mechanism understood)

## Problem

When you pass an array prop to a sub-pattern (composable pattern), `Array.isArray()` returns `false` inside the sub-pattern, even though the array is valid.

```typescript
// Parent pattern (person.tsx)
const extraction = ImportReview({
  trigger: extractTrigger,
  fieldMappings: [  // <-- This is a real array
    { key: "displayName", label: "Display Name" },
    // ...
  ],
});

// Inside ImportReview sub-pattern
console.log(Array.isArray(fieldMappings));  // false!
console.log(fieldMappings.length);           // 14 (works!)
```

## Root Cause

The CTS (CommonTools Source Transform) transformer wraps array props in **OpaqueRef** - a JavaScript Proxy that enables reactivity. JavaScript's `Array.isArray()` checks the internal `[[Class]]` slot, which Proxies cannot override.

This is **by design**, not a bug. The OpaqueRef proxy behavior differs inside vs outside `computed()`:

**Outside `computed()`:**
- ✅ Truthiness check (`!!fieldMappings`)
- ✅ `for...of` iteration (Symbol.iterator is implemented)
- ❌ `.length` property access → throws "Tried to directly access opaque value"
- ❌ Index access (`arr[0]`) → throws
- ❌ `Array.isArray()` → returns `false`
- ❌ **Property access on iterated items** (`mapping.key`) → throws (items are ALSO OpaqueRef!)

**Inside `computed()`:**
- ✅ All of the above work correctly
- ✅ `.length`, `[0]`, `.map()`, `.filter()` all work
- ✅ Property access on iterated items works

**CRITICAL: Items from `for...of` are ALSO wrapped in OpaqueRef!**
```typescript
// ❌ THIS THROWS - even though for...of works, items are OpaqueRef
for (const mapping of fieldMappings as FieldMapping[]) {
  fieldProperties[mapping.key] = { ... };  // THROWS: mapping.key accesses OpaqueRef!
}
```

## Solution: Schema as Cell Prop

**The fundamental constraint:** You cannot build dynamic schemas from OpaqueRef-wrapped array props at pattern initialization time.

**Solution:** Have the parent build the schema as a `Cell<object>` and pass it. Cells are NOT wrapped in OpaqueRef.

```typescript
// ✅ Parent builds schema as Cell (person.tsx)
const personExtractionSchema = Cell.of({
  type: "object",
  properties: {
    displayName: { type: "string", description: "Display Name" },
    givenName: { type: "string", description: "First Name" },
    // ... all fields
  },
  required: ["displayName", "givenName", ...],
});

const extraction = ImportReview({
  trigger: extractTrigger,
  schema: personExtractionSchema,  // Cell<object> - NOT wrapped in OpaqueRef
  fieldMappings: [...],            // Still pass for UI/diff purposes (accessed in computed)
});

// ✅ Sub-pattern uses schema Cell directly (import-review.tsx)
const effectiveSchema = schemaInput ?? Cell.of(DEFAULT_SCHEMA);
const { result } = generateObject({
  schema: effectiveSchema,  // Cell input works with generateObject
  prompt: trigger,
});
```

**Why this is idiomatic:**
- Follows chatbot.tsx pattern (tools merged with `computed()`)
- Cells are first-class citizens - no OpaqueRef wrapping
- Clear separation: parent knows fields, builds schema
- fieldMappings only accessed inside `computed()` for UI diff display

## When This Applies

- Sub-patterns (patterns called from other patterns)
- Any array passed as a prop to a `pattern<T>()` function
- Building dynamic objects from array prop data at init time

## When This Does NOT Apply

- Arrays from external APIs (Gmail, etc.) - these are real arrays
- Arrays created locally with `cell<T[]>([])` or `Cell.of<T[]>([])`
- Arrays returned from `generateObject` result
- **Cell props** - Cells are NOT wrapped in OpaqueRef

## Technical Details

From `labs/packages/runner/src/cell.ts`:
- `getAsOpaqueRefProxy()` creates a Proxy with `Symbol.iterator` support
- The proxy has an `isOpaqueRefMarker` symbol for identification
- Child elements are recursively wrapped in OpaqueRef on access
- **This recursive wrapping is why iterated items are also OpaqueRef**

## Guestbook

- ✅ 2025-12-17 - Confirmed: `Array.isArray(fieldMappings)` returns false in ImportReview when called from person.tsx
- ✅ 2025-12-17 - Confirmed: `.length` property access works correctly **inside computed() only**
- ✅ 2025-12-17 - Confirmed: `.length` outside computed() throws "Tried to directly access opaque value"
- ✅ 2025-12-17 - Confirmed: `for...of` iteration works correctly outside computed() (Symbol.iterator implemented)
- ✅ 2025-12-17 - **CRITICAL**: Items from `for...of` are ALSO OpaqueRef! `mapping.key` throws outside computed()
- ✅ 2025-12-17 - Root cause: CTS transformer wraps props in OpaqueRef Proxy
- ✅ 2025-12-17 - Solution: Schema as Cell Prop - parent builds schema, Cells don't get OpaqueRef wrapped
