# Cell.of(null) Creates Cell Reference, Not Null Value

## Summary

When you call `Cell.of(null)`, it creates a cell with schema `{ default: null }`. When the cell is read via `.get()`, the runtime returns an **immutable cell reference** to that default value, not the primitive `null`. This causes `!== null` checks to always be truthy, even when you expect them to be false initially.

## The Observation

A modal was appearing on page load even though it should only show when a button is clicked:

```typescript
// ❌ BROKEN - Modal shows on page load
const editingEntry = Cell.of<Entry | null>(null);

// In render:
{ifElse(
  computed(() => editingEntry.get() !== null),  // Always true!
  <Modal>...</Modal>,
  null
)}
```

The `.get()` call returned a Cell object (with a data URI like `data:application/json,%7B%22value%22%3Anull%7D`), not primitive `null`.

## Root Cause (HIGH CONFIDENCE)

Traced through the runtime code:

1. **Cell.of() implementation** (`packages/runner/src/cell.ts:1631-1671`):
   When `Cell.of(null)` is called, `null !== undefined` is true, so it creates a schema with `{ default: null }`.

2. **processDefaultValue** (`packages/runner/src/schema.ts:109-147`):
   When the cell is read, the function detects there's a default value and calls `runtime.getImmutableCell()`.

3. **getImmutableCell** (`packages/runner/src/runtime.ts:448-464`):
   Creates a Cell object with a data URI pointing to `{value: null}`.

**Result:** `Cell.of(null).get()` returns a Cell object, not primitive `null`.

## The Fix

Use `undefined` instead of `null` for "no value" states:

```typescript
// ❌ WRONG - Creates cell pointing to null (not primitive null)
const editingEntry = Cell.of<Entry | null>(null);
if (editingEntry.get() !== null) {
  // Always true! .get() returns a Cell object
}

// ✅ CORRECT - Use undefined and omit argument
const editingEntry = Cell.of<Entry | undefined>();
if (!!editingEntry.get()) {
  // Correctly false when no value set
}

// Also update handlers to use undefined
editingEntry.set(undefined);  // Not null
```

For the modal condition:

```typescript
// ❌ WRONG
computed(() => editingEntry.get() !== null)

// ✅ CORRECT
computed(() => !!editingEntry.get())
```

## Why This Is Counter-Intuitive

1. **JavaScript/TypeScript convention**: `null` is commonly used to represent "no value" in nullable types (`T | null`)
2. **The API appears to work**: `Cell.of(null)` doesn't throw an error
3. **Type system doesn't help**: TypeScript allows `Cell.of<T | null>(null)` and the type signature looks correct
4. **Silent failure**: The bug only manifests at runtime when conditional checks behave unexpectedly

## Known Affected Patterns

Found in production code (potential bugs if using `!== null` checks):
- `packages/patterns/voice-note.tsx:54`
- `packages/patterns/record-backup.tsx:618`
- `packages/patterns/record/extraction/smart-text-input.tsx:303-308` (4 instances)
- `packages/patterns/deprecated/voice-note-simple.tsx:30`
- `packages/patterns/deprecated/calendar-v512.tsx:3286`

## Key Principle

In the Common Tools pattern system, use `undefined` (not `null`) to represent "no value" in Cell types. Call `Cell.of<T | undefined>()` without an argument to create a cell that starts undefined.

## Metadata

```yaml
topic: Cell.of, null, undefined, reactivity, modal, conditional-rendering
discovered: 2025-12-22
confirmed_count: 1
last_confirmed: 2025-12-22
confidence: high
sessions: [record-module-notes-feature]
related_functions: Cell.of, processDefaultValue, getImmutableCell
files_investigated:
  - packages/runner/src/cell.ts
  - packages/runner/src/schema.ts
  - packages/runner/src/runtime.ts
stars: 5
status: confirmed
```
