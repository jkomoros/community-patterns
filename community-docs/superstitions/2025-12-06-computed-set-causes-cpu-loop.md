# Superstition: Calling .set() Inside computed() Causes CPU Loop

---

## DISCLAIMER

This is a **SUPERSTITION** - an unverified observation from a single session. It may be:
- Wrong or incomplete
- Context-specific
- A misunderstanding of the actual cause
- Fixed in newer framework versions

**Treat with extreme skepticism.** Verify against official docs and test thoroughly.

---

## Metadata

```yaml
topic: reactivity, computed, generateObject, cpu-loop
discovered: 2025-12-06
confirmed_count: 1
last_confirmed: 2025-12-06
disproved: 2025-12-06
sessions: [assumption-surfacer-dev, cpu-loop-investigation]
related_labs_docs: docs/common/CELLS_AND_REACTIVITY.md
related_folk_wisdom: folk_wisdom/reactivity.md
status: DISPROVED
stars: ⭐
```

## Problem

Using `computed()` to automatically copy `generateObject` results into cells causes 100% CPU usage. The pattern hangs and becomes unresponsive.

## What Doesn't Work

```typescript
// ❌ BROKEN - This causes CPU loop
const analysisResult = generateObject<AnalysisResult>({
  prompt: analysisPrompt,
  system: ANALYZER_SYSTEM_PROMPT,
});

// Trying to "auto-copy" results into cells from computed
const _updateAssumptions = computed(() => {
  const result = analysisResult.result;
  if (!result) return;

  // These .set() calls cause the CPU loop!
  analyzedCount.set(newValue);
  assumptions.set([...assumptions.get(), ...newAssumptions]);
  flatAlternatives.set([...flatAlternatives.get(), ...newAlts]);
});
```

**Symptoms:**
- 100% CPU usage
- Pattern becomes unresponsive
- No error messages (silent failure)
- Browser tab may freeze

## Why This Happens

According to folk_wisdom/reactivity.md, `computed()` and `derive()` are **read-only pure functions**. They cannot mutate cells.

The `.set()` calls inside computed:
1. Should silently fail (per documented behavior)
2. But something in the reactive system creates a loop
3. Possibly: the computed re-runs, tries to set again, triggers re-evaluation, etc.

The key insight: **Computed describes "what is true", not "what to do"**. Mutations belong in handlers.

## What Works

**Option 1: Display generateObject result directly (preferred)**

Don't copy to cells - display `analysisResult.result` directly in JSX:

```typescript
// ✅ WORKS - Display result directly, no copying
const analysisResult = generateObject<AnalysisResult>({
  prompt: analysisPrompt,
  system: ANALYZER_SYSTEM_PROMPT,
});

// Only store USER CORRECTIONS (mutations from handlers)
// corrections: Cell<Correction[]> - stores user's changed selections

const assumptionsJsx = computed(() => {
  const result = analysisResult.result;  // Read directly
  const correctionsList = corrections.get();  // Read corrections

  if (!result) return <div>No assumptions yet</div>;

  // Merge result with corrections for display
  return result.assumptions.map(a => {
    const correction = correctionsList.find(c => c.label === a.label);
    const selectedIndex = correction ? correction.correctedIndex : a.selectedIndex;
    // ... render with merged data
  });
});
```

**Option 2: Use handlers for mutations**

If you truly need to accumulate into cells, use a button + handler:

```typescript
// ✅ WORKS - Handler for mutations
const saveResults = handler<void, { assumptions: Cell<Assumption[]> }>(
  (_, { assumptions }) => {
    const result = analysisResult.result;
    if (!result) return;

    // Handlers CAN mutate cells
    assumptions.set([...assumptions.get(), ...newAssumptions]);
  }
);

// User clicks button to save
<ct-button onClick={saveResults({ assumptions })}>
  Save Analysis
</ct-button>
```

## The Pattern That Fixed It

For the assumption-surfacer pattern:

**Before (broken):**
- `generateObject` analyzes messages
- `computed` copies results into `assumptions` and `flatAlternatives` cells
- CPU loop on every analysis

**After (working):**
- `generateObject` analyzes messages
- `assumptionsJsx` computed reads `analysisResult.result` DIRECTLY
- Only `corrections` cell stores user's changed selections (from handler)
- Handler updates `corrections` when user clicks an alternative
- Display merges `result + corrections` in computed

## Key Takeaways

1. **Never call `.set()` inside `computed()`** - it causes CPU loops
2. **Display `generateObject` results directly** - they're already reactive
3. **Only store user-initiated changes in cells** - mutations from handlers
4. **Computed = "what is true"** - pure transformations only
5. **Handlers = "what to do"** - side effects and mutations

## Related

- **Folk Wisdom:** `community-docs/folk_wisdom/reactivity.md` - "Derives Cannot Mutate Cells"
- **Official Docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`
- **Pattern:** `patterns/jkomoros/WIP/assumption-surfacer.tsx` - working implementation

## Guestbook

- 2025-12-06 - assumption-surfacer pattern. Had `_updateAssumptions` computed that copied `generateObject` results into cells. Pattern caused 100% CPU, browser became unresponsive. Fix: removed the computed, display `analysisResult.result` directly in JSX, only store user corrections in cells. Pattern works perfectly now. (assumption-surfacer-dev)

- 2025-12-06 - **DISPROVED**: Created minimal repro patterns to test this theory:
  1. `cpu-loop-repro-minimal.tsx` - computed calling .set() on a number cell - **NO CPU LOOP**
  2. `cpu-loop-repro.tsx` - generateObject + computed calling .set() - **NO CPU LOOP**

  The .set() call inside computed() actually **worked** - the cell was updated (Items in cell: 3).

  **Root cause of original issue was likely:**
  - Missing `model` parameter in generateObject (causes 400 errors, possible retry loop)
  - Or something else in the original pattern, not the computed+set combination

  **Key finding:** generateObject REQUIRES a `model` parameter (e.g., `model: "anthropic:claude-haiku-4-5"`). Without it, you get 400 Bad Request errors. (cpu-loop-investigation)

---

**STATUS: DISPROVED** - The original observation was likely caused by something else (possibly missing model parameter causing 400 errors). The computed+.set() combination does NOT cause CPU loops in current framework version.

**See:** `blessed/reactivity.md` - "Idempotent Side Effects in computed/lift/derive" for authoritative guidance. `.set()` in computed IS allowed if the operation is idempotent.
