# ISSUE: ~30 Second Delay with navigateTo + person.tsx + generateObject + Many Extracted Fields

## Summary

When `navigateTo(Person({ notes }))` creates a person charm with **long notes containing many extractable fields** (Twitter, LinkedIn, etc.), subsequent `generateObject` extraction causes a ~30 second delay before the modal appears. The same pattern with **shorter notes** (fewer fields to extract) completes instantly.

## Root Cause Identified (2025-12-17)

**The bug is triggered by the NUMBER OF FIELDS being extracted, not by navigateTo() or person.tsx complexity.**

### Critical Discovery

| Notes Content | Fields Extracted | Result |
|---------------|------------------|--------|
| Short (6 lines, no social) | ~6 fields | **FAST (instant)** |
| Long (with Twitter, LinkedIn) | ~9 fields | **SLOW (~30s)** |

The same launcher, same person.tsx, same navigateTo() - the ONLY difference is the demo notes content.

## Reproduction

### Slow Path (~30 seconds)
```typescript
// Notes with Twitter/LinkedIn trigger the bug
const DEMO_NOTES = `Dr. Maya Rodriguez (she/her)
maya.rodriguez@biotech.com
+1-617-555-7890
Born: 1988-11-03
Twitter: @drmayar
LinkedIn: linkedin.com/in/maya-rodriguez

Biotech researcher specializing in CRISPR gene editing...`;

navigateTo(Person({ notes: DEMO_NOTES }))
// Then click "Extract Data from Notes" → ~30s delay
```

### Fast Path (instant)
```typescript
// Notes WITHOUT Twitter/LinkedIn are fast
const DEMO_NOTES = `Dr. Maya Rodriguez (she/her)
maya.rodriguez@biotech.com
+1-617-555-7890
Born: 1988-11-03

Biotech researcher at GeneTech Labs.`;

navigateTo(Person({ notes: DEMO_NOTES }))
// Then click "Extract Data from Notes" → instant
```

## Evidence (2025-12-17 Testing)

| Scenario | Notes | Extraction Time |
|----------|-------|-----------------|
| Direct `charm new` of person.tsx | manual entry | ~5-10 seconds |
| navigateTo + short notes (6 fields) | short | **instant** |
| navigateTo + long notes (9 fields) | long | **~30 seconds** |
| person-debug.tsx (copy) + short notes | short | **instant** |
| person-debug.tsx (copy) + long notes | short | **instant** |

## Key Findings

### What DOES Trigger the Bug
- `navigateTo(Person({ notes: LONG_NOTES }))` where LONG_NOTES extracts 8+ fields
- The extraction modal (`changesPreview.map()`) with many items
- Specifically the Notes diff rendering (`notesDiffChunks.map()`)

### What Does NOT Trigger the Bug
- Direct deployment via `charm new`
- Short notes with fewer fields to extract
- `navigateTo()` itself (works fine with short notes)
- `ct-autolayout` itself (works fine in minimal repros)
- `recipe()` wrapper (works fine in minimal repros)

### Console Observations During Delay
- `TypeError: Cannot read properties of undefined (reading 'length')` in CTAutoLayout.render
- The delay happens AFTER the LLM API returns (API is fast)
- UI freezes during the delay

## Hypothesis

The bug is in the **changesPreview modal rendering** when there are many fields to display. Specifically:
1. The `changesPreview.map()` creating many change items
2. The `notesDiffChunks.map()` rendering word-by-word diffs
3. Some interaction between `ifElse()` conditional rendering and the map iterations

The issue scales with the NUMBER of extracted fields, not the complexity of person.tsx itself.

## Test Patterns Created

```
patterns/jkomoros/
├── person-test-launcher.tsx      # Launcher with configurable demo notes
├── person-debug-launcher.tsx     # Launcher for person-debug.tsx (copy)
├── person-debug.tsx              # Exact copy of person.tsx for comparison
└── navigateto-generateobject-launcher-real.tsx # Launches REAL person.tsx with LONG notes

patterns/jkomoros/WIP/
├── person-minimal-v1.tsx         # Minimal person skeleton - FAST
├── person-minimal-v2.tsx         # With ct-autolayout - FAST
└── person-minimal-launcher.tsx   # Launcher for minimal versions
```

## Reproduction Commands

```bash
cd ~/Code/labs

# Bug reproduction (SLOW - ~30s) - Long notes with Twitter/LinkedIn
deno task ct charm new --api-url http://localhost:8000 --identity ../community-patterns/claude.key --space person-long-notes ../community-patterns/patterns/jkomoros/person-test-launcher.tsx
# person-test-launcher.tsx uses long DEMO_NOTES with Twitter/LinkedIn
# Then: Click Launch Person → Extract Data from Notes → ~30s delay

# Fast path - Short notes
# Edit person-test-launcher.tsx to use short notes (remove Twitter/LinkedIn lines)
# Deploy and test → instant extraction
```

---

## Investigation Log (2025-12-17 Continued)

### Attempt 1: Nested Maps with Static Data
**File:** `WIP/nested-map-perf-repro.tsx`
**Hypothesis:** O(n²) in scheduler.topologicalSort() with nested `.map()`
**Test:** 9 outer items × 5 inner items = 45 cells, button click to load
**Result:** **INSTANT** - No delay

### Attempt 2: generateObject + ifElse + Nested Maps
**File:** `WIP/generateobject-map-perf-repro.tsx`
**Hypothesis:** Combination of generateObject + ifElse branch switch + nested maps
**Test:** Mimics person.tsx flow with generateObject triggering ifElse switch to modal with nested maps
**Result:** **INSTANT** - No delay

### Attempt 3: Dynamic Cell Creation (540 items)
**File:** `WIP/dynamic-cell-creation-repro.tsx`
**Hypothesis:** O(n²) only manifests during DYNAMIC cell creation, not static
**Test:** Start empty, button click creates 9 × 60 = 540 nested items dynamically
**Result:** **INSTANT** - No delay

### Attempt 4: ct-autolayout + ifElse + Dynamic Maps (540 items)
**File:** `WIP/dynamic-cell-autolayout-repro.tsx`
**Hypothesis:** ct-autolayout component causes the freeze (CTAutoLayout.render error during freeze)
**Test:** ct-autolayout with ifElse switching between Form view and Results view with 540 dynamic items
**Result:** **INSTANT** - No delay

### Attempt 5: Properly Instrumented Repro (call counts, not handler timing)
**File:** `WIP/perf-instrumented-repro.tsx`
**Hypothesis:** We were measuring the wrong thing - handler timing only measures graph setup, not reactive execution
**Test:** Added global counters inside .map() closures to count actual render calls
**Result:** **INSTANT** - No delay, items.set() took ~481ms but reactive render was fast
**Learning:** The superstition about measuring correctly is valid, but our simplified repros genuinely ARE fast - the bug isn't a measurement artifact

### Key Finding: Our Repros Don't Reproduce the Bug

| Repro Pattern | Items | Dynamic? | Result |
|---------------|-------|----------|--------|
| nested-map-perf-repro.tsx | 45 | Yes (button) | FAST |
| generateobject-map-perf-repro.tsx | 45 | Yes (generateObject) | FAST |
| dynamic-cell-creation-repro.tsx | 540 | Yes (button) | FAST |
| dynamic-cell-autolayout-repro.tsx | 540 | Yes (button + ct-autolayout) | FAST |
| perf-instrumented-repro.tsx | 540 | Yes (button + call counting) | FAST |
| **person.tsx (real)** | ~70 | Yes (generateObject) | **~35s FREEZE** |

### What We've Ruled Out

These do NOT cause the bug (confirmed by fast repros):
- ❌ `navigateTo()` itself
- ❌ `generateObject()` alone
- ❌ `ifElse()` with nested maps
- ❌ Simple nested `.map()` operations (even 540 items)
- ❌ `pattern()` wrapper
- ❌ Dynamic cell creation in general
- ❌ O(n²) in scheduler (at least not at this scale)
- ❌ `ct-autolayout` component alone
- ❌ `ct-autolayout` + `ifElse` + dynamic maps combination

### What's Different About person.tsx?

| Aspect | person.tsx | Our Repros |
|--------|------------|------------|
| Wrapper | `recipe()` | `pattern()` |
| Field Cells | 14+ separate Cells | Single prop or few cells |
| `changesPreview` | Depends on 14 field Cells via `compareFields()` | Simple computed |
| Reactive Graph | Deep - many interdependent cells | Shallow |
| Components | `ct-autolayout`, `ct-vscroll`, `ct-screen` | Simple divs |
| Console Error | `TypeError in CTAutoLayout.render` | None |

### Suspicious Clue: CTAutoLayout Error

During the freeze, console shows:
```
TypeError: Cannot read properties of undefined (reading 'length')
    at CTAutoLayout.render
```

This error appears repeatedly during the ~35s freeze. Could `ct-autolayout` be crashing and retrying in a loop?

---

## Next Steps

### Ruled Out (Tested):
- ~~Test with `ct-autolayout`~~ - TESTED: ct-autolayout + ifElse + 540 items = FAST

### Remaining Hypotheses:

1. **Test with `recipe()` wrapper** - Does switching from `pattern()` to `recipe()` trigger the bug?
2. **Test with many field Cells (14+)** - person.tsx has 14+ individual Cells that `changesPreview` depends on via `compareFields()`
3. **Test with deep reactive graph** - person.tsx has many interdependent computed cells
4. **Profile person.tsx directly** - Add instrumentation (call counters, not timing) to person.tsx itself
5. **Test the exact `compareFields()` + `notesDiffChunks` combination** - These may have expensive operations

### Key Insight (2025-12-17)

The bug is NOT caused by any single factor we've tested in isolation. It must be a **combination** of factors unique to person.tsx, or there's something we haven't identified yet.

Possible unexplored factors:
- The `recipe()` wrapper creating additional reactive overhead
- The `compareFields()` function doing expensive operations on every recompute
- The `computeWordDiff()` function (even though it was moved to pre-computed)
- Some interaction between navigateTo() and the charm's initialization state

---

## Test Patterns Created

```
patterns/jkomoros/WIP/
├── nested-map-perf-repro.tsx           # Test nested maps - FAST
├── generateobject-map-perf-repro.tsx   # Test generateObject + ifElse + maps - FAST
├── generateobject-map-launcher.tsx     # Launcher for above
├── dynamic-cell-creation-repro.tsx     # Test 540 dynamic items - FAST
├── dynamic-cell-autolayout-repro.tsx   # Test ct-autolayout + ifElse + 540 items - FAST
└── perf-instrumented-repro.tsx         # Test with call counters (correct measurement) - FAST
```

## Related Documentation

- Investigation plan: `~/.claude/plans/virtual-baking-fog.md`
- Superstition: `community-docs/superstitions/2025-12-17-generateObject-causes-cpu-spike-after-response.md`

---

**Filed:** 2025-12-17
**Updated:** 2025-12-17
**Status:** MYSTERY - Simplified repros are all FAST, but person.tsx still freezes for ~35s. Need to identify what's unique about person.tsx.
