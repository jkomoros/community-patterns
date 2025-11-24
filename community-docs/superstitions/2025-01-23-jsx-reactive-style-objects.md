# ⚠️ SUPERSTITION: Reactive Style Objects in JSX

**⚠️ WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

Reactive styling in JSX using computed() values

## Problem

When using `computed()` values for individual style properties within a style object literal, the styles may not update reactively when the underlying cell changes.

### What Didn't Work

```typescript
// ❌ Individual computed values within style object - may not be reactive
const bgColor = computed(() => {
  const prefs = preferences.get();
  const pref = prefs.find(p => p.ingredient === ing.normalized);
  return pref ? "#28a745" : "#f0f0f0";
});

const textColor = computed(() => {
  const prefs = preferences.get();
  const pref = prefs.find(p => p.ingredient === ing.normalized);
  return pref ? "#ffffff" : "#000000";
});

<span style={{
  backgroundColor: bgColor,  // May not update reactively
  color: textColor,           // May not update reactively
  padding: "0.25rem 0.5rem"
}}>
```

**Symptom:** Styles remain static even after the underlying Cell changes.

## Solution That Seemed to Work

Use a single `computed()` that returns the entire style object:

```typescript
// ✅ Single computed returning entire style object
const badgeStyle = computed(() => {
  const prefs = preferences.get();
  const pref = prefs.find(p => p.ingredient === ing.normalized);

  return {
    backgroundColor: pref ? "#28a745" : "#f0f0f0",
    color: pref ? "#ffffff" : "#000000",
    padding: "0.25rem 0.5rem",
    borderRadius: "4px"
  };
});

<span style={badgeStyle}>
```

**Result:** Styles update correctly when preferences Cell changes.

## Context

- **Pattern:** cheeseboard-schedule.tsx
- **Use case:** Ingredient badges that change color based on user preferences (liked/disliked)
- **Framework:** CommonTools JSX/reactivity system
- **Verified:** Using Playwright browser testing - colors changed correctly from pastel to bright green/red

## Theory / Hypothesis

It's possible that:
1. JSX style object literals with computed values inside may not track reactivity correctly
2. The framework may need the entire style object to be reactive, not individual properties
3. This could be related to how style objects are diffed/applied in the rendering system

## Related Official Docs

- `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` - Documents computed() usage, mentions using computed values in JSX
- `~/Code/labs/docs/common/PATTERNS.md` - Shows style object examples

The official docs don't specifically address this pattern (individual computed properties within style objects vs entire computed style object).

## Metadata

```yaml
topic: jsx
discovered: 2025-01-23
confirmed_count: 1
last_confirmed: 2025-01-23
sessions: [fixes-chessboard-and-others]
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
status: superstition
stars: ⭐
```

## Guestbook

- ⭐ 2025-01-23 - Fixed ingredient preference styling in cheeseboard pattern - individual computed properties didn't update, single computed style object worked (fixes-chessboard-and-others)

---

**Remember: This is just one observation. Test thoroughly in your own context!**
