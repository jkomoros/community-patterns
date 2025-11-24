# ⚠️ SUPERSTITION: ct-image-input Requires Cell<ImageData[]>, Not Cell<Array<Cell<ImageData>>>

**⚠️ WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

Two-way binding with `ct-image-input` and Cell array types

## Problem

When using `ct-image-input` with `$images` two-way binding, using `Cell<Array<Cell<ImageData>>>` causes:
- Runtime error: "Cannot create cell link: space is required"
- Pattern fails to deploy
- Images not being processed by the LLM

### What Didn't Work

```typescript
// ❌ Using nested Cells
const uploadedPhotos = cell<Array<Cell<ImageData>>>([]);

// Pattern compiles but fails at runtime with:
// "Error: Cannot create cell link: space is required.
//  This can happen when closing over (opaque) cells in a lift or derive."
```

**Symptom:** Pattern deploys but crashes immediately when trying to access the photos:

```typescript
const photoExtractions = uploadedPhotos.map((photo, photoIndex) => {
  const photoData = photo.get();  // ❌ Fails - trying to .get() on plain ImageData
  // ...
});
```

## Solution That Seemed to Work

Use `Cell<ImageData[]>` - a plain array inside a Cell, not an array of Cells:

```typescript
// ✅ Using plain array in Cell
const uploadedPhotos = cell<ImageData[]>([]);

// Access items directly - they're already unwrapped
const photoExtractions = uploadedPhotos.map((photo, photoIndex) => {
  // photo is ImageData, not Cell<ImageData>
  const extraction = generateObject({
    prompt: [
      { type: "image" as const, image: photo.data },
      // ...
    ],
    // ...
  });

  return {
    photo: photo,  // Store the ImageData directly
    photoName: photo.name,  // Access properties directly
    // ...
  };
});
```

**Result:** Pattern deploys successfully and images are processed by the vision LLM.

## Context

- **Patterns:** store-mapper.tsx (failed), food-recipe.tsx (worked as reference)
- **Use case:** Upload multiple images for vision LLM processing
- **Component:** `ct-image-input` with `$images` two-way binding
- **Framework:** CommonTools JSX with reactive cells

## Theory / Hypothesis

When using `ct-image-input` with two-way binding:
1. The `$images` binding expects `Cell<ImageData[]>`
2. The component internally handles updating the array
3. Using `Cell<Array<Cell<ImageData>>>` creates a mismatch - the component tries to set plain `ImageData[]` into a Cell expecting Cell array
4. The `.map()` on a Cell array automatically unwraps to iterate over the inner array items
5. Those items are plain `ImageData` objects, not Cells

**Pattern from food-recipe.tsx:**
- Uses `Cell<ImageData | null>` for single image upload
- Handler receives `{ detail: { images: ImageData[] } }` - plain array
- Confirms that `ct-image-input` works with plain types, not Cell-wrapped types

## When to Use Each Pattern

### ✅ ct-image-input with $images binding:
```typescript
const uploadedPhotos = cell<ImageData[]>([]);

<ct-image-input
  $images={uploadedPhotos}
  multiple
  maxImages={50}
/>

// Map over items - they're plain ImageData
uploadedPhotos.map((photo) => {
  console.log(photo.name);  // Direct access
});
```

### ✅ Handler receiving images:
```typescript
const handleUpload = handler<
  { detail: { images: ImageData[] } },
  { uploadedPhotos: Cell<ImageData[]> }
>(({ detail }, { uploadedPhotos }) => {
  // detail.images is plain array
  uploadedPhotos.set(detail.images);
});
```

### ❌ Don't use nested Cells with ct-image-input:
```typescript
// DON'T DO THIS
const uploadedPhotos = cell<Array<Cell<ImageData>>>([]);
```

## Related Official Docs

- CommonTools component documentation (ct-image-input)
- Cell reactivity documentation
- Two-way binding ($-prefix) documentation

The official docs don't specifically mention that `ct-image-input` expects plain types in Cells, not nested Cells.

## Metadata

```yaml
topic: ct-image-input, two-way-binding, Cell, arrays, reactivity
discovered: 2025-11-24
confirmed_count: 1
last_confirmed: 2025-11-24
sessions: [fix-grocery-list-bugs]
related_components: ct-image-input
related_patterns: Cell, derive, map
status: superstition
stars: ⭐
```

## Guestbook

- ⭐ 2025-11-24 - Fixed image upload in store-mapper pattern - Using Cell<Array<Cell<ImageData>>> caused "Cannot create cell link: space is required" error. Changed to Cell<ImageData[]> and pattern deployed successfully. Confirmed by referencing food-recipe.tsx which uses Cell<ImageData | null>. (fix-grocery-list-bugs)

---

**Remember: This is just one observation. Test thoroughly in your own context!**
