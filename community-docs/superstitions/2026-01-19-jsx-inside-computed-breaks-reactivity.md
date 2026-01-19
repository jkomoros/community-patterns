# JSX Inside computed() Breaks Reactive Updates

**Date:** 2026-01-19
**Status:** confirmed
**Confidence:** high
**Stars:** 4

## TL;DR - The Rule

**Never wrap JSX in `computed()`.** The JSX transformer explicitly skips reactive wrapping when inside a `computed()` context, which breaks VNode reconciliation and prevents DOM updates when dependencies change.

```tsx
// BROKEN - JSX wrapped in computed()
{computed(() => {
  const selected = selectedIds.get();
  return items.map((item) => (
    <div style={{ opacity: selected.includes(item.id) ? 1 : 0.4 }}>
      {selected.includes(item.id) ? <span>checkmark</span> : <span />}
    </div>
  ));
})}

// CORRECT - computed() inside .map() for per-item reactive state
{items.map((item) => {
  const isSelected = computed(() => selectedIds.get().includes(item.id));
  return (
    <div style={{ opacity: ifElse(isSelected, 1, 0.4) }}>
      {ifElse(isSelected, <span>checkmark</span>, <span />)}
    </div>
  );
})}
```

---

## Summary

When you wrap JSX in `computed()`, the framework's JSX transformer (`opaque-ref-jsx.ts`) detects it's inside a computed context and explicitly skips reactive wrapping. This is intentional - the transformer assumes the `computed()` context handles reactivity. However, this means the JSX VNodes created inside don't get proper reactive treatment, and DOM updates fail when dependencies change.

The symptom is subtle: the code runs without errors, but UI elements don't update when reactive state changes.

## Why This Happens

The JSX transformer in `opaque-ref-jsx.ts` has logic to detect when it's transforming JSX inside a `computed()` call. When detected, it skips the normal reactive wrapping for VNode children and attributes.

The assumption is:
1. `computed()` will handle dependency tracking
2. When dependencies change, `computed()` will re-run
3. Fresh VNodes will be created

The reality:
1. `computed()` does re-run
2. New VNodes are created
3. But VNode reconciliation doesn't properly diff/update the DOM
4. The old DOM stays in place

This creates a situation where the reactive graph works correctly, but the UI doesn't reflect state changes.

## Symptoms

- **UI doesn't update** when reactive state changes
- **No errors** in console - code appears to work
- **State is correct** if you inspect it - only UI is stale
- **Works on initial render** - only subsequent updates fail
- Particularly affects **style changes**, **conditional rendering**, and **text content**

## The Problematic Pattern

This pattern appears when you want to optimize a list render or group related reactive logic:

```tsx
// BROKEN: JSX wrapped in computed()
{computed(() => {
  const selectedCalendarIds = selectedCalendarIds.get();
  return calendars.map((cal) => {
    const isSelected = selectedCalendarIds.includes(cal.id);
    return (
      <div
        style={{
          opacity: isSelected ? 1 : 0.4,
          textDecoration: isSelected ? "none" : "line-through",
        }}
      >
        {isSelected ? <span>checkmark</span> : <span />}
        <span style={{ backgroundColor: cal.color }}>{cal.name}</span>
      </div>
    );
  });
})}
```

This seems logical - wrap the whole thing in `computed()` to batch updates. But it breaks reactivity.

## Correct Pattern

Use `computed()` inside `.map()` for per-item reactive state instead:

```tsx
// CORRECT: computed() inside .map() for per-item state
{calendars.map((cal) => {
  const isSelected = computed(() =>
    selectedCalendarIds.get().includes(cal.id)
  );
  return (
    <div
      style={{
        opacity: ifElse(isSelected, 1, 0.4),
        textDecoration: ifElse(isSelected, "none", "line-through"),
      }}
    >
      {ifElse(isSelected, <span>checkmark</span>, <span />)}
      <span style={{ backgroundColor: cal.color }}>{cal.name}</span>
    </div>
  );
})}
```

Key changes:
1. **Remove outer computed()** - let JSX be directly in the render
2. **Move computed() inside .map()** - create per-item reactive computations
3. **Use ifElse() for conditionals** - instead of ternary operators on reactive values
4. **Don't call .get()** - let the framework auto-unwrap computed values

This pattern is explicitly blessed by framework authors as "actually the better style" (see `2025-12-14-inline-computed-in-map-is-fine.md`).

## Real-World Example

**Pattern:** Google Calendar Importer
**Bug:** Checkmarks on calendar selection chips weren't updating when toggled

### Before (Broken)

```tsx
{computed(() => {
  const selected = selectedCalendarIds.get();
  return calendars.map((cal) => {
    const isSelected = selected.includes(cal.id);
    return (
      <div
        onClick={toggleCalendar({ calendarId: cal.id })}
        style={{
          opacity: isSelected ? 1 : 0.4,
          cursor: "pointer",
        }}
      >
        {isSelected ? <span>checkmark</span> : <span />}
        <span style={{ backgroundColor: cal.color }}>{cal.name}</span>
      </div>
    );
  });
})}
```

**Result:** Clicking chips toggled state (console confirmed), but checkmarks never appeared/disappeared.

### After (Fixed)

```tsx
{calendars.map((cal) => {
  const isSelected = computed(() =>
    selectedCalendarIds.get().includes(cal.id)
  );
  return (
    <div
      onClick={toggleCalendar({ calendarId: cal.id })}
      style={{
        opacity: ifElse(isSelected, 1, 0.4),
        textDecoration: ifElse(isSelected, "none", "line-through"),
        cursor: "pointer",
      }}
    >
      {ifElse(isSelected, <span>checkmark</span>, <span />)}
      <span style={{ backgroundColor: cal.color }}>{cal.name}</span>
    </div>
  );
})}
```

**Result:** Checkmarks correctly appear/disappear when chips are clicked.

## Differentiating from Related Issues

| Issue | Symptom | Root Cause |
|-------|---------|------------|
| **This issue** | UI doesn't update, no errors | JSX transformer skips reactive wrapping in computed context |
| computed() inside map + async | Infinite loop, CPU spike | Feedback loop with volatile identity |
| Mapping computed array in JSX | `mapWithPattern is not a function` | computed doesn't have mapWithPattern method |
| Using .get() on inline computed | Various issues | Breaks auto-unwrapping |

## Key Rules

1. **Never wrap JSX in `computed()`** - it breaks reactive updates
2. **Use `computed()` inside `.map()`** for per-item reactive state
3. **Use `ifElse()` for conditionals** on reactive values in JSX
4. **Don't call `.get()`** on computed values in JSX - let auto-unwrapping work
5. **If you need to compute data**, do it separately and pass plain values to JSX

## Related Superstitions

- `2025-12-14-inline-computed-in-map-is-fine.md` - Blesses the correct pattern
- `2026-01-08-computed-inside-map-callback-infinite-loop.md` - Different issue with computed in map (async feedback loops)
- `verifications/2025-11-21-cannot-map-computed-arrays-in-jsx.md` - Related but different issue (mapping computed arrays)

## Metadata

```yaml
topic: reactivity, computed, jsx, vdom, rendering
discovered: 2026-01-19
confirmed_count: 1
last_confirmed: 2026-01-19
sessions: [google-calendar-importer-checkbox-fix]
related_functions: computed, ifElse, map
pattern: packages/patterns/google/google-calendar-importer.tsx
status: confirmed
confidence: high
stars: 4
applies_to: [CommonTools]
```

## Guestbook

- 2026-01-19 - Google Calendar Importer calendar selection chips. Wrapped JSX in `computed()` to batch rendering of calendar selection chips with checkmarks. Checkmarks never updated when selection state changed - no errors, state was correct, just UI was stale. Root cause: `opaque-ref-jsx.ts` transformer skips reactive wrapping inside computed context, breaking VNode reconciliation. Fixed by moving `computed()` inside `.map()` for per-item reactive state and using `ifElse()` for conditionals. (google-calendar-importer-checkbox-fix)

---

**Remember:** JSX belongs in render context, not inside `computed()`. Use computed for data, not for UI structure.
