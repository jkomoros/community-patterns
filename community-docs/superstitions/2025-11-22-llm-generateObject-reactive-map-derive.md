---
topic: llm
discovered: 2025-11-22
confirmed_count: 1
last_confirmed: 2025-11-22
sessions: [codenames-helper-iteration]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

---

# generateObject() with Reactive Arrays: Still Need computed() for Nested Properties

## Problem

When using `generateObject()` inside a `Cell.map()` operation, the prompt parameter needs `computed()` to reactively access nested properties of the mapped items, even though the items themselves are already reactive from `.map()`.

Without `computed()`, the `generateObject()` call stays in `pending` state indefinitely and never makes an API request.

**Symptom:**
- UI shows "Analyzing..." or similar pending state
- No network requests to AI API (check with browser network tab)
- No console errors
- Extraction hangs forever

## Solution That Seemed To Work

Use `computed()` to access nested properties (like `.data`) of items returned from `Cell.map()`:

```typescript
// BEFORE (doesn't work - hangs forever):
const photoExtractions = uploadedPhotos.map((photo) => {
  return generateObject<PhotoExtractionResult>({
    system: `...`,
    // Trying to access photo.data directly - doesn't trigger reactively!
    prompt: [
      { type: "image", image: photo.data },
      { type: "text", text: `...` }
    ]
  });
});

// AFTER (works):
const photoExtractions = uploadedPhotos.map((photo) => {
  return generateObject<PhotoExtractionResult>({
    system: `...`,
    // Use computed() to reactively access photo.data
    prompt: computed(() => {
      if (!photo?.data) {
        return "Waiting for image data...";
      }

      return [
        { type: "image", image: photo.data },
        { type: "text", text: `...` }
      ];
    })
  });
});
```

## Why This Might Be Happening

**Hypothesis:** While `uploadedPhotos.map()` returns reactive references to each photo, accessing nested properties like `photo.data` requires `computed()` to establish reactive dependencies.

Without `computed()`:
- The prompt array is built once with `photo.data` at that moment
- If `photo.data` isn't available yet, it's undefined/null
- The prompt never updates when `photo.data` becomes available later
- `generateObject()` never triggers because the prompt never resolves

With `computed()`:
- The framework tracks access to `photo.data` inside the callback
- When `photo.data` becomes available, `computed()` re-runs
- The prompt updates reactively
- `generateObject()` receives the updated prompt and triggers

## Context

Working on codenames-helper pattern with AI-powered image extraction:
- Used `ct-image-input` with `$images={uploadedPhotos}`
- `uploadedPhotos` is a `Cell.of<ImageData[]>([])`
- Called `.map()` on it to create `generateObject()` for each photo
- Initial attempts hung indefinitely (90+ seconds with no API calls)
- Adding `computed()` fixed the hanging issue

## Example

```typescript
// Image upload cell
const uploadedPhotos = Cell.of<ImageData[]>([]);

// AI extraction for each uploaded photo
const photoExtractions = uploadedPhotos.map((photo) => {
  return generateObject<PhotoExtractionResult>({
    system: `You are an image analysis assistant...`,

    // CRITICAL: Use computed() to access photo properties reactively
    prompt: computed(() => {
      // Safety check: data might not be available immediately
      if (!photo?.data) {
        return "Waiting for image data...";
      }

      // Now build the multipart prompt
      return [
        { type: "image" as const, image: photo.data },
        {
          type: "text" as const,
          text: `Analyze this photo...`
        }
      ];
    })
  });
});
```

## Related Documentation

- **Official docs:** ~/Code/labs/docs/common/LLM.md (generateObject documentation)
- **Related superstition:** 2025-11-22-derive-object-parameter-cell-unwrapping.md
- **Pattern:** patterns/jkomoros/WIP/codenames-helper.tsx (lines 371-427)

## Related Bug

**Also fixed in same session:** Using `.indexOf()` inside `.map()` callback causes wrong indices.

```typescript
// WRONG:
photoExtractions.map((extraction) => {
  const photoIdx = photoExtractions.indexOf(extraction); // Returns -1!
  // ...
});

// RIGHT:
photoExtractions.map((extraction, photoIdx) => {
  // Use photoIdx parameter directly from .map()
  // ...
});
```

This happened because object identity doesn't match in reactive arrays, so `.indexOf()` returns `-1`.

## Next Steps

- [ ] Confirm this behavior with another pattern using generateObject + reactive arrays
- [ ] Check if official docs explain this reactive property access pattern
- [ ] Test if this applies to other LLM functions (generateText, etc.)
- [ ] Verify if this is specific to `ImageData` or applies to all nested objects

## ⚠️ UPDATE (2025-11-29): May Be Context-Specific

Testing on 2025-11-29 showed that **direct property access works** for text content:

```typescript
// This worked fine (no computed needed for text):
const extractions = items.map((item) => ({
  itemId: item.id,
  extraction: generateObject({
    prompt: item.content,  // Direct access, no computed()
    schema: SCHEMA,
  }),
}));
```

**Possible distinction:**
- For **image data** that loads asynchronously → may still need `computed()` to wait for data
- For **text content** that exists immediately → direct access works fine

The original superstition may be specific to image upload scenarios where `photo.data` isn't immediately available. For pre-existing text content, the simpler approach works.

See: `2025-11-29-llm-dumb-map-approach-works.md` for the simpler pattern.

## Notes

**Debugging approach that revealed the issue:**
1. Checked network tab - no API requests being made
2. Checked console - no errors
3. Realized prompt might not be resolving
4. Noticed the double-wrapping: `.map()` returns reactive values, but accessing `.data` needs computed()
5. Added `computed()` to access nested property reactively
6. Fixed!

**Key insight:** Reactivity in CommonTools requires explicit `computed()` for nested property access, even when the parent object is already reactive.

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
