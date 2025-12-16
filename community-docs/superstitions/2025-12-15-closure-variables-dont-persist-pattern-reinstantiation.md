# Closure Variables Don't Persist Across Pattern Re-instantiation

**Date:** 2025-12-15
**Status:** Superstition (single observation, needs verification)
**Symptom:** State managed by closure variable resets unexpectedly, causing computeds to re-run when they shouldn't

## The Problem

When you use a closure variable (regular `let` variable) inside a pattern to track state for a computed guard, the variable resets to its initial value during reactive updates.

```typescript
export default pattern<Input>(({ ... }) => {
  // ❌ WRONG - Closure variable resets on pattern re-instantiation
  let lastProcessedText = "";

  computed(() => {
    const triggerText = extractionTriggerText.get();

    // Guard check - supposed to prevent re-processing
    if (triggerText === lastProcessedText) return;

    // Process data...
    stagedClasses.set(newClasses);
    lastProcessedText = triggerText;  // This won't persist!
  });
});
```

## Observed Behavior

1. User triggers extraction → computed runs → sets `lastProcessedText = "prompt"`
2. User clicks checkbox → triggers reactive update
3. Pattern function may re-run → `lastProcessedText` resets to `""`
4. Computed re-runs with guard `"prompt" === ""` → guard FAILS
5. `stagedClasses.set(newClasses)` overwrites user's checkbox changes
6. **Result**: Checkbox "flickers" back to original state

## Root Cause

The pattern function body runs during reactive graph construction. When the framework needs to re-evaluate the reactive graph, it may re-run the pattern function, which re-initializes all local variables including closure variables.

Unlike Cells (which persist their state), closure variables are just JavaScript variables that get reset.

## Solution: Use Cell with Idempotent Pattern

Use a Cell for state that must persist, with an idempotent computed pattern:

```typescript
export default pattern<Input>(({ ... }) => {
  // ✅ CORRECT - Cell persists across re-instantiation
  const lastProcessedExtractionText = cell<string>("");

  computed(() => {
    const triggerText = extractionTriggerText.get();
    const lastText = lastProcessedExtractionText.get();  // Creates dependency

    // Guard check - will work correctly because cell persists
    if (triggerText === lastText) return;

    // Process data...
    // CRITICAL ORDER: Set data FIRST, then update guard
    stagedClasses.set(newClasses);
    lastProcessedExtractionText.set(triggerText);
  });
});
```

### Why This Works

1. **Run 1**: `lastText = ""`, `triggerText = "prompt"` → guard fails → process → set lastText
2. **Run 2** (triggered by lastText change): `lastText = "prompt"`, `triggerText = "prompt"` → guard matches → return early
3. **System settles** - no more writes

### Critical: Operation Order

Always set data BEFORE updating the guard cell:

```typescript
// ✅ CORRECT ORDER
stagedClasses.set(newClasses);      // 1. Set data first
lastProcessedExtractionText.set(triggerText);  // 2. Update guard second
```

If reversed, the guard update triggers re-run BEFORE data is set, and data never gets written.

## Quick Reference

| Approach | Persists? | Use Case |
|----------|-----------|----------|
| `let variable = ""` | ❌ No | Temporary computation only |
| `cell<string>("")` | ✅ Yes | State that must persist |

## Related

- `2025-12-08-cells-in-handlers-must-use-state-schema.md` - Similar closure issues in handlers
- `2025-12-14-computed-read-write-infinite-loop.md` - Idempotent computed patterns
- `blessed/reactivity.md` - Idempotent side effects in computed

## Guestbook

- 2025-12-15 - Discovered while fixing checkbox flicker in extracurricular-selector. Closure variable `let lastProcessedText` kept resetting, causing computed to overwrite user's checkbox selections. Fixed by using cell with idempotent pattern. (extracurricular-selector / jkomoros)
