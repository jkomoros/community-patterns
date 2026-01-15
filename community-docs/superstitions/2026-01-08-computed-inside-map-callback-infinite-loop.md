# Creating computed() Inside .map() Callbacks Can Cause Infinite Loops

**Date:** 2026-01-08
**Status:** confirmed
**Confidence:** high
**Stars:** 5

## TL;DR - The Rule

**Be careful creating `computed()` (or `derive()`) nodes inside `.map()` callbacks.** This pattern can cause infinite loops when:
1. The input array has **volatile identity** (changes frequently)
2. The computed nodes feed into **async operations** like `generateObject()`
3. The async operations **trigger state changes** that re-evaluate the `.map()`

However, this pattern **does work** in some cases:
- **UI-only computed**: Using `computed()` inside `.map()` for UI display (e.g., `userList.map(user => { const hasAvatar = computed(() => ...) })`) works because UI computations don't trigger further state changes
- **Stable input arrays**: When the input Cell's array identity is stable (elements rarely added/removed), the `.map()` doesn't re-run frequently
- **Non-cascading operations**: When the created computed nodes don't feed back into the reactive graph in ways that invalidate the original `.map()`

```tsx
// BROKEN - Creates new computed() on each evaluation -> infinite loop
const perSourceExtractions = selectedSources.map((source) => {
  const prompt = computed(() => {  // NEW NODE EACH TIME!
    // ... build prompt for this source
    return `Process ${source.label}`;
  });

  return {
    sourceIndex: source.index,
    extraction: generateObject({ prompt }),  // Each gets a NEW prompt computed
  };
});

// CORRECT - Build everything inside a single computed()
const perSourceExtractions = computed(() => {
  const sources = selectedSources;
  const result = [];

  for (const source of sources) {
    // Plain JavaScript, no reactive nodes created per-item
    const prompt = `Process ${source.label}`;
    result.push({
      sourceIndex: source.index,
      prompt,
    });
  }

  return result;
});
```

---

## Summary

When you create `computed()` or `derive()` inside a `.map()` callback, **each time the reactive system re-evaluates**, it creates entirely new computed nodes. These new nodes have different identity from the previous evaluation, which:

1. Invalidates any existing subscriptions
2. Creates new subscriptions
3. Triggers another evaluation
4. Which creates new nodes again
5. **Infinite loop**

This is fundamentally different from:
- **Nested derive() breaking array reactivity** (symptom: missing updates)
- **Expensive computation in map** (symptom: CPU spike, N^2 complexity)
- **Multiple ifElse subscriptions** (symptom: thrashing/cascading updates)

**The key insight:** Reactive node identity must be stable across evaluations.

## Why This Happens

The CommonTools reactive system tracks dependencies by node identity. When you write:

```tsx
const items = array.map((item) => {
  const x = computed(() => item.value);  // Created per-item, per-evaluation
  return { item, computed: x };
});
```

On the first evaluation:
- Map runs, creates computed nodes A1, A2, A3 for items 1, 2, 3
- These nodes subscribe to their dependencies
- Result array contains references to A1, A2, A3

On the second evaluation (triggered by any input change):
- Map runs again, creates NEW computed nodes B1, B2, B3
- Old nodes A1, A2, A3 are orphaned (but may still have subscriptions)
- New nodes B1, B2, B3 subscribe to dependencies
- This subscription change triggers another evaluation
- **Loop continues indefinitely**

The scheduler may detect this via `MAX_ITERATIONS_PER_RUN` and throw, or it may hang.

## Why Some .map() + computed() Patterns Work

Not all `.map()` + `computed()` combinations cause infinite loops. The key factors:

### 1. OCR Example (Works)

```tsx
// This works! No infinite loop.
const ocrCalls = photoSources.map((photo) => {
  const prompt = computed(() => {
    if (!photo?.imageData) return undefined;
    return [{ type: "image", image: photo.imageData.url }];
  });
  return {
    index: photo.index,
    ocr: generateText({ prompt, ... })
  };
});
```

**Why it works:**
- `photoSources` is a stable Cell - photo modules are added/removed infrequently
- The `.map()` only re-runs when photos actually change (rare)
- `generateText` results don't trigger changes to `photoSources`
- No cascading feedback loop

### 2. Extraction Example (Was Broken)

```tsx
// This caused infinite loops
const perSourceExtractions = selectedSourcesForExtraction.map((source) => {
  const prompt = computed(() => {
    const phase = extractPhase.get();  // <-- PROBLEM: reads volatile state
    if (phase !== "extracting") return undefined;
    // ... build prompt
  });
  return {
    extraction: generateObject({ prompt, ... })
  };
});
```

**Why it broke:**
- `selectedSourcesForExtraction` depends on `extractPhase`, which changes during extraction
- The `computed()` inside also reads `extractPhase`, creating multiple dependency paths
- When `generateObject` completes, it may trigger state changes that propagate back
- This creates a feedback loop where the `.map()` keeps re-running

### Key Differentiator: Feedback Loops

The pattern is safe when:
- Input array is **stable** (doesn't depend on the async operation's output)
- Computed nodes are **read-only** (don't write to state that affects the input)
- Async operations are **isolated** (their completion doesn't cascade back to the `.map()`)

The pattern breaks when:
- Input depends on **volatile state** (like extraction phase)
- Computed nodes **read state** that changes during the async operation
- **Async completion triggers re-evaluation** of the `.map()` source

## Symptoms

- **100% CPU** in both Deno runtime and browser
- **"Maximum iterations exceeded"** or similar error from scheduler
- **Browser tab becomes unresponsive**
- **No visible errors** in some cases - just hangs
- **Works initially**, then loops when any reactive input changes

## The Problematic Pattern

This pattern appears when you want to create per-item reactive computations:

```tsx
// BROKEN: Per-item computed() inside .map()
const perItemResults = items.map((item) => {
  // These are created fresh on EVERY reactive pass
  const itemPrompt = computed(() => buildPrompt(item));
  const itemResult = generateObject({ prompt: itemPrompt });

  return {
    index: item.index,
    result: itemResult,
  };
});
```

This seems logical but violates reactive node identity stability.

## Correct Patterns

### Option 1: Single Combined Computation

Instead of per-item computations, combine into one:

```tsx
// CORRECT: Single computed() with internal loop
const combinedPrompt = computed(() => {
  const sources = items;
  const parts = [];

  for (const source of sources) {
    parts.push(`--- ${source.label} ---\n${source.content}`);
  }

  return parts.join('\n\n');
});

// Single call with combined input
const result = generateObject({
  prompt: combinedPrompt,
  schema: mySchema,
});
```

### Option 2: Pre-compute Outside Map, Reference Inside

```tsx
// Compute the expensive/reactive part outside .map()
const allPrompts = computed(() => {
  return items.map((item) => ({
    index: item.index,
    prompt: buildPrompt(item),  // Plain value, not reactive node
  }));
});

// Then use in JSX or handlers with stable references
{allPrompts.map((p) => <div>{p.prompt}</div>)}
```

### Option 3: Wrap the Entire .map() in computed()

```tsx
// CORRECT: computed() wraps the map, not inside it
const results = computed(() => {
  const items = sourceArray.get();
  const result = [];

  for (const item of items) {
    // Plain JavaScript operations
    result.push({
      index: item.index,
      value: transformItem(item),
    });
  }

  return result;
});
```

## Real-World Example

**Pattern:** ExtractorModule - AI extraction from multiple sources
**Bug:** Per-source extraction with `computed()` inside `.map()` caused infinite loops

### Before (Infinite Loop)

```tsx
// Build per-source extraction calls using .map() pattern
const perSourceExtractions = selectedSourcesForExtraction.map(
  (source: ExtractableSource) => {
    // PROBLEM: computed() created inside .map() callback
    const prompt = computed((): string | undefined => {
      const phase = extractPhase.get() || "select";
      if (phase !== "extracting") return undefined;

      if (source.type === "photo") {
        const ocrMap = ocrResults;
        const ocrText = ocrMap[source.index];
        if (!ocrText || !ocrText.trim()) return undefined;
        return `--- ${source.label} (OCR) ---\n${ocrText}`;
      } else {
        // Read live content via Cell navigation
        const entry = (parentSubCharms as Cell<SubCharmEntry[]>)
          .key(source.index)
          .get();
        const charm = entry?.charm as Record<string, unknown>;
        const liveContent = getCellValue<unknown>(charm?.content);
        const content = typeof liveContent === "string" ? liveContent : "";
        if (!content.trim()) return undefined;
        return `--- ${source.label} ---\n${content}`;
      }
    });

    // PROBLEM: generateObject() with per-item computed prompt
    const extraction = generateObject({
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt,
      schema: RECOMMENDATIONS_SCHEMA,
      model: "anthropic:claude-haiku-4-5",
    });

    return {
      sourceIndex: source.index,
      sourceType: source.type,
      sourceLabel: source.label,
      extraction,
    };
  },
);
```

**Result:** Infinite reactive loop, 100% CPU, pattern hung on extraction start.

### After (Fixed)

```tsx
// SINGLE COMBINED EXTRACTION
// Build a single combined prompt from all sources
const combinedExtractionPrompt = computed((): string | undefined => {
  const phase = extractPhase.get() || "select";
  if (phase !== "extracting") return undefined;

  const sources = selectedSourcesForExtraction;
  const ocrMap = ocrResults;
  const promptParts: string[] = [];

  for (const source of sources) {
    if (source.type === "photo") {
      const ocrText = ocrMap[source.index];
      if (ocrText && ocrText.trim()) {
        promptParts.push(`--- ${source.label} (OCR) ---\n${ocrText}`);
      }
    } else {
      const content = source.content || "";
      if (content.trim()) {
        promptParts.push(`--- ${source.label} ---\n${content}`);
      }
    }
  }

  if (promptParts.length === 0) return undefined;
  return promptParts.join("\n\n");
});

// Single extraction call for all sources combined
const singleExtraction = generateObject({
  system: EXTRACTION_SYSTEM_PROMPT,
  prompt: combinedExtractionPrompt,
  schema: RECOMMENDATIONS_SCHEMA,
  model: "anthropic:claude-haiku-4-5",
});

// Build synthetic per-source array inside computed() for compatibility
const perSourceExtractions = computed(() => {
  const sources = selectedSourcesForExtraction;
  if (!sources || sources.length === 0) return [];

  const result = [];
  for (const source of sources) {
    result.push({
      sourceIndex: source.index,
      sourceType: source.type,
      sourceLabel: source.label,
      extraction: singleExtraction,  // All share the same extraction
    });
  }
  return result;
});
```

**Result:** Pattern works correctly, no infinite loop.

## Differentiating from Related Issues

| Issue | Symptom | Root Cause |
|-------|---------|------------|
| **This issue** | Infinite loop, hang | New computed nodes created each evaluation |
| Nested derive() in map | Missing UI updates | Array reactivity broken |
| Expensive computation in map | CPU spike, slow | N^2 complexity |
| Multiple ifElse subscriptions | Thrashing/flickering | Cascading reactive updates |
| Early return dependency tracking | Missing updates | Dependency never registered |

## Key Rules

1. **Avoid creating `computed()` or `derive()` inside `.map()` callbacks** unless you're certain there's no feedback loop
2. **Reactive node identity must be stable** - same nodes on each evaluation
3. **Wrap .map() in computed()** if you need per-item transformation
4. **Combine into single computation** when possible (safest for async operations)
5. **Read from source Cells inside computed()**, iterate with plain for loops
6. **Check for feedback loops**: Does the async operation's completion affect the `.map()` source?
7. **UI-only computed is safe**: Using `computed()` for display properties in `.map()` works fine

## Related Issues

- `2025-12-23-nested-derive-in-map-breaks-array-reactivity.md` - Different symptom (missing updates)
- `2025-12-17-nested-computed-in-ifelse-causes-thrashing.md` - Different cause (multiple subscriptions)
- `2025-12-16-expensive-computation-inside-map-jsx.md` - Different cause (N^2 complexity)
- `2026-01-05-computed-early-return-dependency-tracking.md` - Different cause (early returns)

## Metadata

```yaml
topic: reactivity, computed, map, infinite-loop, node-identity, scheduler
discovered: 2026-01-08
confirmed_count: 1
last_confirmed: 2026-01-08
sessions: [extractor-module-per-source-extraction]
related_functions: computed, derive, map, generateObject
pattern: packages/patterns/record/extraction/extractor-module.tsx
commits: [cab22ddd4, 7a5415d4a]
status: confirmed
confidence: high
stars: 5
applies_to: [CommonTools, general-reactive-programming]
```

## Guestbook

- 2026-01-08 - ExtractorModule per-source extraction. Created `computed()` inside `.map()` to build per-source prompts for LLM extraction. Caused infinite loops because the `.map()` source (`selectedSourcesForExtraction`) depended on volatile state (`extractPhase`), creating a feedback loop when `generateObject()` completed. Fixed by combining all sources into single `combinedExtractionPrompt` computed(). Notable: OCR in the same file uses `.map()` + `computed()` successfully because `photoSources` is stable (photos don't change during extraction). The key insight: the pattern breaks when async completion can trigger re-evaluation of the `.map()` source - not all `.map()` + `computed()` combinations are problematic. (extractor-module-per-source-extraction)

---

**Remember:** The pattern is risky when async operations feed back into the reactive graph. For UI-only computed or stable input arrays, `.map()` + `computed()` can work fine.
