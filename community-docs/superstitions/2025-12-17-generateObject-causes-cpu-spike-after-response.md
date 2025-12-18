---
topic: performance, llm, generateObject, framework
discovered: 2025-12-17
confirmed_count: 1
last_confirmed: 2025-12-17
sessions: [person-cpu-spike-fix]
related_labs_docs: docs/common/LLM.md
status: superstition
stars: ⭐⭐
---

# ⚠️ SUPERSTITION - ROOT CAUSE FOUND: `navigateTo(Pattern({}))`

## Update 2025-12-17: navigateTo Pattern Creation Causes ~90 Second CPU Spike!

**ROOT CAUSE IDENTIFIED**: The ~90 second CPU spike occurs when:
1. Using `navigateTo(Pattern({ props }))` to create a charm (as page-creator does)
2. That charm then uses `generateObject` for LLM extraction

**Direct `charm new` deployment is FAST** - nearly instant extraction.

### Comparison

| Creation Method | Extraction Time | Notes |
|----------------|-----------------|-------|
| `deno task ct charm new pattern.tsx` | ~instant | ✅ Works correctly |
| `navigateTo(Person({ notes }))` | **~89 seconds** | ❌ CPU spike |

### The Problem

Page-creator uses this pattern:
```typescript
const handleCreatePersonDemo = handler<void, void>(() =>
  navigateTo(Person({ notes: DEMO_PERSON_NOTES }))
);
```

When the created charm then runs `generateObject`, it triggers a ~90 second CPU freeze.

## Original Problem

When using page-creator.tsx → Demo → Person → "Extract Data from Notes":
- Chrome CPU pegs to 100% for ~60 seconds
- Page completely frozen/unresponsive
- `DERIVE DEBUG SUMMARY` shows `total=0` (NOT the reactive system)
- LLM API call completes quickly (~5 seconds)
- CTAutoLayout TypeError often appears during freeze

## What Does NOT Help

### guardedPrompt Pattern (Idiomatic but Doesn't Fix Performance)

```typescript
// This is GOOD HYGIENE but does NOT fix the ~60 second CPU spike
const extractTrigger = cell<string>("");

const guardedPrompt = computed(() => {
  const trigger = extractTrigger.get();
  if (trigger && trigger.includes("---EXTRACT-")) {
    return trigger;
  }
  return undefined;
});

const { result } = generateObject({
  prompt: guardedPrompt,  // Still causes ~60s freeze when triggered
  schema: { /* 14 fields */ }
});
```

The guardedPrompt pattern is idiomatic (used by codenames-helper, food-recipe, etc.) and prevents spurious triggers, but it does NOT reduce the CPU spike when extraction DOES run.

## Root Cause (UNKNOWN - Not What We Thought)

**Original hypothesis was WRONG:**
- Previously blamed `intern()` and `claim()` in `memory/reference.ts`
- Claimed "the more fields, the worse the performance"

**Minimal repro disproves this:**
- Simple 14-field schema: **5.7 seconds** (fast!)
- Complex person.tsx in page-creator flow: **~60 seconds** (slow!)

**Actual root cause is likely:**
1. **Pattern complexity**: person.tsx has many computed cells (~20+) vs minimal repro (~3)
2. **`compareFields` call**: Processing 14 field comparisons in `changesPreview` computed
3. **Cascading computed cells**: `extractionResult` → `changesPreview` → `hasExtractionResults` → `notesDiffChunks`
4. **`.map()` rendering in JSX**: Multiple `.map()` calls in modal and form sections
5. **`ct-autolayout` component**: Has TypeError during rendering, may be blocking

**Key evidence (2025-12-17):**
- Direct deployment of person.tsx (NOT via page-creator) shows same ~60 second freeze
- This proves page-creator is NOT the cause
- The problem is internal to person.tsx pattern complexity

The investigation doc at `patterns/jkomoros/design/todo/cpu-spike-investigation.md` has more details on the original hypothesis.

## Evidence

**Minimal repro results (2025-12-17):**
```
[PERF] Starting 14-field extraction...
[PERF] Start time: 1766007124148
[PERF] 14 fields extraction completed in 5748ms
```
**Pattern:** `patterns/jkomoros/WIP/generateobject-perf-repro.tsx`

**Original page-creator flow (still shows problem):**
```
[DERIVE DEBUG SUMMARY] total=0, perRow=0, elapsed=50021ms  # Before click
[DERIVE DEBUG SUMMARY] total=0, perRow=0, elapsed=109859ms # After ~60s gap
TypeError: Cannot read properties of undefined (reading 'length')
    at CTAutoLayout.render
```

- Minimal repro with same field count: **5.7 seconds**
- person.tsx via page-creator flow: **~60 seconds**
- person.tsx direct deployment: **~60 seconds** (SAME as page-creator!)
- The problem is pattern-complexity-specific, not page-creator-specific

## Current Workarounds

1. **Use fewer fields in schema** - Reduces processing time proportionally
2. **Accept the delay** - Document that users should expect ~60 second wait
3. **Keep guardedPrompt** - Prevents accidental triggers during pattern initialization

## What Would Actually Fix This

Framework-level changes needed:
- Optimize `intern()` to avoid JSON.stringify on every object
- Batch or lazy-load LLM result processing
- Port `sharedSchemaTracker` optimization from Deno to Chrome

## Context

- Pattern: `patterns/jkomoros/person.tsx`, `patterns/jkomoros/food-recipe.tsx`
- Issue discovered when navigating page-creator → Demo → Person → Extract
- Direct pattern deployment shows same issue
- Investigation documented in `patterns/jkomoros/design/todo/cpu-spike-investigation.md`

## Related Documentation

- `~/Code/labs/docs/common/LLM.md` - generateObject usage
- `community-docs/superstitions/2025-12-16-expensive-computation-inside-map-jsx.md` - Related performance issue

---

## Metadata

**How to diagnose similar issues:**
1. Check `DERIVE DEBUG SUMMARY` - if total=0, it's NOT reactive blocking
2. Check network tab for LLM response time
3. Look for gaps in console timestamps - indicates main thread blocking
4. CPU profiling in Chrome DevTools will show `intern()` / `claim()` as hot paths

---

## Guestbook

**2025-12-17 (Phase 7 - ROOT CAUSE FOUND)**: Deployed fresh page-creator, clicked Demo → Person, ran extraction. Result: **~89 seconds**! Even with a FRESH page-creator, the `navigateTo(Person({ notes }))` pattern causes the CPU spike. This identifies `navigateTo(Pattern({}))` as the root cause.

**2025-12-17 (Phase 6)**: Deployed **fresh person.tsx directly**. Result: **Nearly instant!** This proves the person.tsx code itself is fine.

**2025-12-17 (Phase 5)**: Created `person-perf-tabs.tsx` with tabbed interface (ct-autolayout tabNames). Result: **3.8 seconds** - tabs are NOT the cause.

**2025-12-17 (Phase 4)**: Created `person-perf-autolayout.tsx` with ct-autolayout wrapper. Result: **4.6 seconds** - ct-autolayout is NOT the cause.

**2025-12-17 (Phase 3)**: Created stripped-down repro `person-perf-stripped.tsx` with changesPreview + modal + .map() rendering. Result: **~3.9 seconds** - NOT 60 seconds! This proves changesPreview/modal/.map() is NOT the cause.

**2025-12-17 (Phase 2)**: Tested person.tsx deployed DIRECTLY (not via page-creator). Initial measurement showed ~60s but this was from an existing charm, not a fresh deployment.

**2025-12-17 (Phase 1)**: Created minimal repro `generateobject-perf-repro.tsx` with 14-field schema. Result: **5.7 seconds** - NOT 60 seconds! This disproves the hypothesis that field count or `intern()`/`claim()` are the root cause.

**2025-12-17**: Initial discovery. Confirmed that guardedPrompt pattern does not fix performance, only prevents spurious triggers.
