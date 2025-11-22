---
topic: reactivity
discovered: 2025-01-21
confirmed_count: 1
last_confirmed: 2025-01-21
sessions: [reward-spinner-regression-fix]
related_labs_docs: none
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

# Recipe → Pattern Migration: JSX Reactivity Changes

## Problem

After migrating a pattern from `recipe` to `pattern` API, two reactivity issues appeared:

**Issue 1: Direct `.get()` in JSX conditionals stopped reacting**

Previously working code that toggled between JSX variants using a Cell value stopped updating:

```typescript
// This worked in recipe, but evaluates once in pattern
{payoutAnimationCount.get() % 2 === 0 ? (
  <AnimationVariant0 />
) : (
  <AnimationVariant1 />
)}
```

Button clicks that incremented `payoutAnimationCount` no longer triggered re-rendering of the conditional.

**Issue 2: Cannot map over computed arrays in JSX**

Attempting to use `.map()` on a computed Cell array in JSX failed:

```typescript
const payoutDots = computed(() => [...items...]);

// Runtime error: payoutDots.map is not a function
{payoutDots.map(item => <div>{item}</div>)}
```

## Solution That Seemed To Work

**For Issue 1: Wrap conditional expressions in computed()**

Instead of calling `.get()` directly in JSX conditionals, wrap the entire conditional logic in a `computed()` value:

```typescript
// Before (didn't work in pattern)
{payoutAnimationCount.get() % 2 === 0 ? <Variant0 /> : <Variant1 />}

// After (works)
const showVariant0 = computed(() => payoutAnimationCount.get() % 2 === 0);
{showVariant0 ? <Variant0 /> : <Variant1 />}
```

**For Issue 2: Compute the entire JSX output, don't map in JSX**

Instead of trying to map over a computed array in JSX, compute the entire JSX output inside the `computed()`:

```typescript
// Before (didn't work)
const items = computed(() => [...]);
{items.map(item => <div>{item}</div>)}

// After (works)
const itemsDisplay = computed(() => {
  const items = [...];
  return items.map(item => <div>{item}</div>);
});
{itemsDisplay}
```

## Example

**Complete before/after from reward-spinner pattern:**

```typescript
// ❌ BEFORE (worked in recipe, broke in pattern)
export default pattern(({ payoutAnimationCount }) => {
  const payoutDots = computed(() => {
    // ... compute array of items ...
    return [
      { emoji: "🍬🍬🍬", dots: "🟢", percent: 14 },
      { emoji: "🍬", dots: "🟢🟢🟢🟢🟢🟢🟢🟢", percent: 81 },
      { emoji: "🤗", dots: "🔴", percent: 5 },
    ];
  });

  return {
    [UI]: (
      <div>
        {/* This conditional didn't react to changes */}
        {payoutAnimationCount.get() % 2 === 0 ? (
          <div>
            {/* Runtime error: payoutDots.map is not a function */}
            {payoutDots.map((item, i) => (
              <div key={i}>{item.emoji} {item.percent}%</div>
            ))}
          </div>
        ) : (
          <div>
            {payoutDots.map((item, i) => (
              <div key={i}>{item.emoji} {item.percent}%</div>
            ))}
          </div>
        )}
      </div>
    ),
  };
});

// ✅ AFTER (works in pattern)
export default pattern(({ payoutAnimationCount }) => {
  // Wrap the conditional in computed()
  const showVariant0 = computed(() => payoutAnimationCount.get() % 2 === 0);

  // Compute the entire JSX output inside computed()
  const payoutDisplay = computed(() => {
    const items = [
      { emoji: "🍬🍬🍬", dots: "🟢", percent: 14 },
      { emoji: "🍬", dots: "🟢🟢🟢🟢🟢🟢🟢🟢", percent: 81 },
      { emoji: "🤗", dots: "🔴", percent: 5 },
    ];

    // Map happens inside computed(), returns JSX array
    return items.map((item, i) => (
      <div key={i}>{item.emoji} {item.percent}%</div>
    ));
  });

  return {
    [UI]: (
      <div>
        {/* Conditional now reacts properly */}
        {showVariant0 ? (
          <div>{payoutDisplay}</div>
        ) : (
          <div>{payoutDisplay}</div>
        )}
      </div>
    ),
  };
});
```

## Context

This pattern emerged while fixing regressions in `patterns/jkomoros/reward-spinner.tsx` after the codebase migrated from `recipe` to `pattern` API.

**What was observed:**
- The pattern compiled without TypeScript errors
- Runtime behavior silently failed - UI didn't update reactively
- No error messages in console for the conditional issue
- Runtime error `payoutDots.map is not a function` for the array mapping issue

**Pattern previously worked perfectly with `recipe` API**, suggesting this is a behavioral difference between the two APIs, not a bug in the original pattern.

**Additional observation:** To alternate between animations (forcing restart), both the computed toggle AND different animation names were required:

```typescript
// Both conditions needed:
{showVariant0 ? (
  <div style={{ animation: "fade0 3s" }}>...</div>
) : (
  <div style={{ animation: "fade1 3s" }}>...</div>
)}
```

Using the same animation name in both branches didn't restart the animation even when the conditional toggled.

## Related Documentation

- **Official docs:** None found specifically documenting recipe→pattern reactivity differences
- **Related patterns:** Check other migrated patterns in `patterns/jkomoros/` for similar issues
- **Framework version:** Labs framework as of 2025-01-21

## Hypothesized Explanation

**Speculation (unverified):**

In the `recipe` API, JSX expressions may have been re-evaluated more frequently, causing `.get()` calls within JSX to trigger reactivity.

In the `pattern` API, JSX expressions might be evaluated once during initial render, and only values explicitly wrapped in `computed()` trigger re-renders when their dependencies change.

This would explain why:
- Direct `.get()` in JSX conditionals "freeze" at their initial value
- Wrapping in `computed()` makes the conditional reactive
- Computed arrays can't be mapped in JSX (they're opaque until computed)
- Computing JSX inside `computed()` works (JSX is the computed output)

**This is pure speculation** and should be verified by checking framework internals or asking the framework author.

## Next Steps

- [ ] Confirm this pattern works in other migrated patterns
- [ ] Check if framework author can explain the actual difference
- [ ] Document whether this is intentional behavior or a migration issue
- [ ] Determine if there's a better pattern for this use case
- [ ] Check if official migration guide should document this

## Notes

**Other attempts that didn't work:**
- Tried calling `.get()` on the computed array before mapping - still failed
- Tried using `derive()` instead of `computed()` - same behavior

**What does work:**
- Computing primitives/booleans and using them in JSX: ✅
- Computing JSX elements directly: ✅
- Mapping over non-computed arrays in JSX: ✅ (normal arrays work fine)

**Edge case:** If you need to alternate animations by toggling a Cell, you need BOTH:
1. A computed toggle value
2. Different animation names in each branch

Using the same animation name won't restart the animation even if the DOM node is recreated.

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
