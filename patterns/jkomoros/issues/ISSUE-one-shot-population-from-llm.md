# Framework Question: One-Shot Population from LLM Results

**Date:** 2025-12-15
**Pattern:** extracurricular-v2.tsx
**Status:** Seeking framework author guidance

## What We're Trying To Do

We have an LLM extraction that produces a list of classes from pasted schedule text. We want to:

1. **Populate `stagedClasses`** (a Cell array) when the LLM extraction completes
2. **Allow user to toggle checkboxes** on the staged classes to select/deselect them
3. **Not overwrite user's selections** when they interact with the checkboxes

This is an "initialize from derived data, then allow mutation" pattern.

## The Core Challenge

We need a way to say: "When extraction completes, populate stagedClasses ONCE, then never touch it again until the next NEW extraction."

The problem is distinguishing between:
- "Same extraction, don't re-populate" (user is interacting)
- "New extraction, should re-populate" (user pasted new text and clicked Extract)

## Approaches Tried

### Approach 1: Cell-based guard with read/write in same computed

```typescript
const lastProcessedExtractionText = cell<string>("");

computed(() => {
  const response = extractionResponse;
  const triggerText = extractionTriggerText.get();
  const lastText = lastProcessedExtractionText.get();  // READ - creates dependency

  if (!response?.classes || !triggerText) return;
  if (triggerText === lastText) return;  // Guard

  stagedClasses.set(newClasses);
  lastProcessedExtractionText.set(triggerText);  // WRITE - triggers re-run
});
```

**Result:** Thrashing during LLM streaming. 100% CPU, checkboxes flicker wildly. Eventually settles, then checkboxes work. But terrible UX during extraction.

**Hypothesis:** During streaming, `extractionResponse` updates repeatedly. Each update triggers the computed. The guard cell creates a read→write→read cycle that thrashes until streaming stops.

### Approach 2: Closure variable (no reactive dependency)

```typescript
let lastProcessedText = "";  // Closure variable, NOT a cell

computed(() => {
  const response = extractionResponse;
  const triggerText = extractionTriggerText.get();
  const lastText = lastProcessedText;  // No .get() = no dependency

  if (!response?.classes || !triggerText) return;
  if (triggerText === lastText) return;

  stagedClasses.set(newClasses);
  lastProcessedText = triggerText;  // Simple assignment
});
```

**Result:** No thrashing during extraction! But clicking a checkbox causes the selection to immediately revert. The checkbox flickers off then back on.

**Root cause discovered:** Closure variables don't persist across pattern re-instantiation. When user clicks checkbox, reactive update may cause pattern function to re-run, resetting `lastProcessedText = ""`. Guard fails, computed re-populates, overwrites user's changes.

### Approach 3: Cell-based guard with correct operation order

Based on hypothesis that order matters for idempotency:

```typescript
const lastProcessedExtractionText = cell<string>("");

computed(() => {
  const response = extractionResponse;
  const triggerText = extractionTriggerText.get();
  const lastText = lastProcessedExtractionText.get();

  if (!response?.classes || !triggerText) return;
  if (triggerText === lastText) return;

  // CRITICAL ORDER: Set data FIRST, then update guard
  stagedClasses.set(newClasses);
  lastProcessedExtractionText.set(triggerText);
});
```

**Result:** Still thrashing. Same behavior as Approach 1.

## Fundamental Question

How do we implement "one-shot population from derived data" in CommonTools?

The pattern seems common:
1. LLM/fetch produces structured data
2. Populate a Cell with that data (possibly with transformations)
3. User can then modify the Cell contents
4. Don't overwrite user modifications unless there's genuinely NEW source data

Is there a framework-blessed way to do this? Or is this pattern fundamentally incompatible with the reactive model?

## Possible Alternatives We Haven't Tried

1. **Separate derived + user state**: Keep `extractedClasses` as pure derive from LLM, store user selections in separate `selectionOverrides` cell, merge at display time. But this adds complexity and doesn't feel like the "right" way.

2. **Handler-triggered population**: Instead of computed, use a handler that populates on button click. But then we lose automatic re-population when extraction completes.

3. **Some framework primitive we don't know about?**

## Context

- `stagedClasses` is a pattern INPUT (persists across sessions)
- LLM extraction uses `generateObject()` which returns `{ result, pending, error }`
- Checkbox toggle uses handler pattern (not $checked binding, which doesn't work in Cell.map())

## Related Superstitions/Docs

- `community-docs/superstitions/2025-12-15-closure-variables-dont-persist-pattern-reinstantiation.md`
- `community-docs/superstitions/2025-12-14-computed-read-write-infinite-loop.md`
- `community-docs/blessed/reactivity.md` - idempotent side effects

---

**Seeking guidance on the recommended pattern for this use case.**
