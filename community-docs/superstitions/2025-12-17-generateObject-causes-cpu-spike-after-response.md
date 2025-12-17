---
topic: performance, llm, generateObject, framework
discovered: 2025-12-17
confirmed_count: 1
last_confirmed: 2025-12-17
sessions: [person-cpu-spike-fix]
related_labs_docs: docs/common/LLM.md
status: superstition
stars: ⭐⭐⭐⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

## Problem

When using `generateObject` with a complex schema (14+ fields), clicking the extract button causes:
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

## Root Cause (Framework-Level)

The CPU spike happens AFTER the LLM response arrives, during framework processing:
- `intern()` in `memory/reference.ts` - JSON.stringify on every nested object
- `claim()` - called excessively during LLM result processing
- The more fields in the schema, the worse the performance (O(fields) or worse)

This is NOT a pattern-level issue that can be worked around.

## Evidence

Console logs during extraction:
```
[DERIVE DEBUG SUMMARY] total=0, perRow=0, elapsed=50021ms  # Before click
[DERIVE DEBUG SUMMARY] total=0, perRow=0, elapsed=109859ms # After ~60s gap
TypeError: Cannot read properties of undefined (reading 'length')
    at CTAutoLayout.render
```

- The ~60 second gap with total=0 proves the blocking is NOT in derive operations
- LLM network request shows 200 OK (fast response)
- Freeze happens during result processing, not LLM call

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

**2025-12-17**: Initial discovery. Confirmed that guardedPrompt pattern does not fix performance, only prevents spurious triggers. Framework-level fix needed.
