# Verification: Cannot Map Computed/Derive Arrays in JSX

**Superstition:** `../2025-11-21-cannot-map-computed-arrays-in-jsx.md`
**Last verified:** 2025-12-16
**Status:** awaiting-maintainer-review
**Evidence level:** high (confirmed_count=3, multiple real patterns affected)

---

## Framework Author Review

> **Please respond by commenting on this section in the PR.**

### Context

When mapping over a `computed()` or `derive()` array in JSX, the pattern fails at runtime with `mapWithPattern is not a function`. The framework transforms `.map()` calls to `.mapWithPattern()` for reactive arrays, but computed/derive values don't have this method.

This was discovered in `reward-spinner.tsx` and confirmed in `store-mapper.tsx` where the workaround is to compute the JSX inside the computed rather than computing data and mapping in JSX.

### Minimal Repro

<!-- Source: repros/2025-11-21-cannot-map-computed-arrays-in-jsx.tsx -->
```tsx
/// <cts-enable />
import { cell, computed, handler, NAME, recipe, UI } from "commontools";

export default recipe(
  "computed-array-map-test",
  ({ counter }: { counter: number }) => {
    // Computed array - this is the problem
    const items = computed(() => {
      const count = counter;
      return [
        { id: 1, label: `Item A (count: ${count})` },
        { id: 2, label: `Item B (count: ${count})` },
      ];
    });

    const increment = handler((_, { counter }) => {
      counter.set(counter.get() + 1);
    });

    return {
      [NAME]: "Computed Array Map Test",
      [UI]: (
        <div>
          <button onClick={increment({ counter })}>Count: {counter}</button>
          <div>
            {/* This FAILS with "mapWithPattern is not a function" */}
            {items.map((item) => (
              <div key={item.id}>{item.label}</div>
            ))}
          </div>
        </div>
      ),
    };
  }
);
```

**Note:** A simpler minimal repro without explicit `Cell<>` types appeared to work due to auto-unwrapping. The failure only manifests with explicit Cell types or in more complex patterns like `reward-spinner.tsx`.

### Question

**Does this behavior match your expectations?**
- [ ] Yes, this is correct and won't change
- [ ] Yes, but we plan to change it
- [ ] No, this looks like a bug
- [ ] It's more nuanced: _______________

---

## Verification Details

**Verified by:** Claude (superstition-verification workflow)
**Date:** 2025-12-02

### Investigation

- **Official docs:** Checked PATTERNS.md, CELLS_AND_REACTIVITY.md - no explicit mention of this limitation
- **Framework source:** The `.map()` to `.mapWithPattern()` transformation is done by the JSX compiler for reactive arrays
- **Deployed repro:** Initial minimal repro in Space `claude-superstition-1202-1` appeared to work, but used auto-unwrapping input types

### Original Pattern Cleanup

- **Pattern:** `patterns/jkomoros/reward-spinner.tsx`
- **Workaround found:** Pattern computes JSX inside computed rather than mapping computed array:
  ```tsx
  const payoutDisplay = computed(() => {
    const prizes = [...]; // build array
    return prizes.map((prize, i) => (
      <div key={i}>...</div>
    ));
  });
  // In JSX: {payoutDisplay}
  ```
- **Cleanup attempted:** Changed to compute data array and map in JSX:
  ```tsx
  const prizes = computed(() => {
    return [...]; // build array
  });
  // In JSX: {prizes.map((prize, i) => (...))}
  ```
- **Result:** Failed with `prizes.mapWithPattern is not a function`

### Assessment

**CONFIRMED** - The superstition is valid.

You cannot map over a `computed()` or `derive()` array directly in JSX. The framework's JSX transformation expects arrays to have a `.mapWithPattern()` method, which computed/derive values don't have.

### Recommendation

This superstition should be:
1. **Kept as confirmed** folk knowledge
2. Potentially **promoted to folk_wisdom** if framework authors confirm this is intentional
3. If unintentional, **filed as a bug** for framework team to address

---

## Additional Confirmation: store-mapper.tsx (2025-12-16)

**Pattern:** `patterns/jkomoros/store-mapper.tsx`
**Error:** `gaps.mapWithPattern is not a function`

The pattern had two `derive()` results (`detectedGaps` and `llmSuggestions`) that were being mapped in JSX:

```tsx
// FAILS - derive result mapped in JSX
{derive(
  { gaps: detectedGaps, aisles, notInStore },
  ({ gaps }) =>
    gaps.map((gapName, index) => (
      <div>...</div>
    ))
)}
```

**Fix applied:** Pre-compute JSX inside `computed()`:

```tsx
// WORKS - compute JSX inside computed()
const detectedGapsButtons = computed(() => {
  const gaps = detectedGaps as unknown as string[];
  return gaps.map((gapName, index) => (
    <div>...</div>
  ));
});

// In JSX: {detectedGapsButtons}
```

**Key insight:** Inside `computed()`, reactive values are auto-unwrapped, so `detectedGaps` is already a plain array - no `.get()` needed.

This confirms the superstition applies to both `computed()` AND `derive()` results.
