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

# ⚠️ SUPERSTITION - PARTIALLY DISPROVEN

## Update 2025-12-17: Minimal Repro Shows Different Results

**CRITICAL FINDING**: A minimal repro with a simple 14-field schema completes in **~5.7 seconds**, NOT 60 seconds!

This means the CPU spike is NOT caused by:
- Number of fields (14 fields works fine)
- `generateObject` itself
- The `intern()` / `claim()` functions with simple schemas

The problem is **context-specific** to the page-creator → Demo → Person flow.

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
1. Multiple charm instances created during page-creator → Demo → Person navigation
2. Reactive cascade involving many existing cells (not just extraction result)
3. Something specific to how person.tsx renders the changes preview modal
4. The `.map()` rendering in JSX causing repeated re-evaluation

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
- Complex page-creator flow: **~60 seconds**
- The problem is context-specific, not field-count-specific

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

**2025-12-17 (Update)**: Created minimal repro `generateobject-perf-repro.tsx` with 14-field schema. Result: **5.7 seconds** - NOT 60 seconds! This disproves the hypothesis that field count or `intern()`/`claim()` are the root cause. The problem is specific to the page-creator → Demo → Person context, not generateObject itself.

**2025-12-17**: Initial discovery. Confirmed that guardedPrompt pattern does not fix performance, only prevents spurious triggers. Framework-level fix needed.
