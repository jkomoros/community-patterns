# Superstition: Display generateObject Results Directly

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
topic: generateObject, reactivity, computed, display
discovered: 2025-12-06
confirmed_count: 1
last_confirmed: 2025-12-06
sessions: [assumption-surfacer-dev]
related_labs_docs: docs/common/CELLS_AND_REACTIVITY.md, docs/common/LLM.md
related_superstitions: 2025-12-06-computed-set-causes-cpu-loop.md (DISPROVED)
status: superstition
stars: ⭐⭐
```

## Problem

When trying to copy `generateObject` results into cells for accumulation or processing, you encounter various errors:
- "Cannot create cell link: space is required"
- CPU loops
- Null reference errors

## Root Cause

The reactive system expects cells to be passed explicitly as handler parameters, not captured in closures. Trying to "wire up" automatic copying from `generateObject.result` to cells creates problems.

## What Doesn't Work

```typescript
// ❌ BROKEN - Trying to auto-copy results to cells
const analysisResult = generateObject<AnalysisResult>({
  model: "anthropic:claude-haiku-4-5",
  prompt: analysisPrompt,
  system: ANALYZER_SYSTEM_PROMPT,
});

// Option 1: Computed that calls .set() - may cause issues
const _copyResults = computed(() => {
  const result = analysisResult.result;
  if (!result) return;
  myCell.set(result.data);  // ❌ Can cause problems
});

// Option 2: Regular function called from computed - "Cannot create cell link"
const saveResult = () => {
  const result = analysisResult.result;
  if (result) {
    myCell.set(result.data);  // ❌ "Cannot create cell link: space is required"
  }
};
const _trigger = computed(() => {
  if (analysisResult.result) saveResult();
});
```

## What Works

**Display `generateObject` results directly in your JSX computed:**

```typescript
// ✅ WORKS - Display results directly, no copying needed
const analysisResult = generateObject<AnalysisResult>({
  model: "anthropic:claude-haiku-4-5",
  prompt: analysisPrompt,
  system: ANALYZER_SYSTEM_PROMPT,
});

// Only store USER-INITIATED changes (from handlers)
// corrections: Cell<Correction[]> - stores user selections

const displayJsx = computed(() => {
  const result = analysisResult.result;  // Read directly
  const correctionsList = corrections.get();  // Read user corrections

  if (!result) return <div>Loading...</div>;

  // Merge result with user corrections for display
  return result.items.map(item => {
    const correction = correctionsList.find(c => c.id === item.id);
    const displayValue = correction ? correction.value : item.value;
    return <div key={item.id}>{displayValue}</div>;
  });
});
```

## Key Insights

1. **`generateObject.result` is already reactive** - it updates automatically when the LLM returns data

2. **Don't copy to cells** - read the result directly in your computed/JSX

3. **Only store user-initiated changes** - use cells for corrections/selections made via handlers

4. **Merge at display time** - combine `generateObject.result` with user corrections in the display computed

## Pattern: "Read from LLM, Store User Intent"

```typescript
// LLM generates data (read-only, reactive)
const llmResult = generateObject({ ... });

// User makes corrections (stored in cell via handler)
const userCorrections = Cell<Correction[]>([]);

const handleCorrection = handler<
  { id: string; newValue: string },
  { corrections: Cell<Correction[]> }
>((event, { corrections }) => {
  // Only handlers can safely mutate cells
  corrections.set([...corrections.get(), {
    id: event.id,
    value: event.newValue
  }]);
});

// Display merges both sources
const displayJsx = computed(() => {
  const result = llmResult.result;
  const corrections = userCorrections.get();

  if (!result) return null;

  // Apply corrections over original result
  return result.items.map(item => {
    const correction = corrections.find(c => c.id === item.id);
    return correction ? correction.value : item.value;
  });
});
```

## Why This Pattern?

1. **Simpler** - no complex wiring to copy data around
2. **More reliable** - avoids reactive system edge cases
3. **Correct semantics** - LLM data is "source of truth", user corrections are "overrides"
4. **Better UX** - if LLM re-runs, user corrections are preserved

## Related

- **Blessed:** `blessed/reactivity.md` - "Idempotent Side Effects" - `.set()` in computed IS allowed if idempotent
- **Superstition:** `2025-12-06-computed-set-causes-cpu-loop.md` (DISPROVED)
- **Superstition:** `2025-01-24-pass-cells-as-handler-params-not-closure.md`
- **Folk Wisdom:** `folk_wisdom/reactivity.md` - Updated guidance on side effects in computed
- **Pattern:** `patterns/jkomoros/WIP/assumption-surfacer.tsx` - working implementation

## Update (2024-12-08)

**Note:** The guidance "computed cannot call .set()" has been corrected. Per framework author, `.set()` in computed/derive IS allowed if the operation is **idempotent** (running N times = same result as once). See `blessed/reactivity.md`.

The pattern in this superstition (display generateObject directly, store only user corrections) is still a valid and recommended approach - but not because computed "can't" mutate, rather because it's often simpler and avoids needing to ensure idempotency.

## Guestbook

- 2025-12-06 - assumption-surfacer pattern. After multiple failed attempts to copy `generateObject` results into cells (computed+set, function closures, etc.), finally succeeded by displaying `analysisResult.result` directly in JSX computed. Only store user's corrections in cells via handlers. Pattern works reliably now. (assumption-surfacer-dev)

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
