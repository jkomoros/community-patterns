# Handlers Should Skip Redundant State Updates to Prevent Reactive Loops

**Date:** 2026-01-19
**Status:** confirmed
**Confidence:** high
**Stars:** 5

## TL;DR - The Rule

**In handlers that fetch data and call `.set()`, always check if the data actually changed before setting.** Otherwise, you may trigger unnecessary reactive updates that cause infinite loops or 100% CPU usage.

```typescript
// BROKEN - Always sets, triggers UI re-render every time
const calendars = await client.getCalendarList();
state.calendars.set(calendars);  // Always triggers subscribers!

// CORRECT - Only sets if data actually changed
const existingCalendars = state.calendars.get();
const calendarsChanged =
  existingCalendars.length !== calendars.length ||
  calendars.some(
    (cal, i) =>
      existingCalendars[i]?.id !== cal.id ||
      existingCalendars[i]?.summary !== cal.summary,
  );
if (calendarsChanged) {
  state.calendars.set(calendars);  // Only triggers when needed
}
```

**Symptom:** 100% CPU usage, frozen UI, or infinite loops when clicking UI elements that trigger handlers.

---

## Summary

When a handler:
1. Fetches or computes data
2. Calls `.set()` to update state
3. That state is used in a `computed()` block that renders UI elements
4. Those UI elements have click handlers that call the same (or related) handler

...you can create a reactive loop where:
- Handler runs → `.set()` fires → `computed()` re-runs → UI re-renders → new handler instances created

Even if the data hasn't changed, calling `.set()` with a new array/object reference triggers all subscribers. This can cause:
- Excessive re-renders
- Memory buildup from recreated handler instances
- CPU spikes from repeated computations
- In severe cases, infinite loops

## The Pattern

```typescript
async function fetchData(state: FetchState): Promise<void> {
  const newData = await fetchFromAPI();

  // Check if data actually changed before setting
  const existingData = state.data.get();
  const dataChanged = !isEqual(existingData, newData);

  if (dataChanged) {
    state.data.set(newData);
  }
}
```

### Comparison Strategies

**For arrays of objects with IDs:**
```typescript
const changed =
  existing.length !== newItems.length ||
  newItems.some(
    (item, i) =>
      existing[i]?.id !== item.id ||
      existing[i]?.name !== item.name,
  );
```

**For simple arrays:**
```typescript
const changed = JSON.stringify(existing) !== JSON.stringify(newData);
```

**For single values:**
```typescript
const changed = existing !== newValue;
```

## What Doesn't Work

### Always calling .set() with fetched data

```typescript
const fetchCalendarEvents = async (state: FetchState) => {
  const calendars = await client.getCalendarList();
  state.calendars.set(calendars);  // PROBLEM: Triggers even if unchanged!

  // ... rest of fetch logic
};
```

This causes issues when:
- The handler is bound to UI elements inside a `computed()` block
- Those elements re-render when `calendars` changes
- Each render creates new handler instances
- Clicking triggers the handler again, which sets again...

## Why This Happens

The Common Tools reactivity system tracks Cell subscriptions. When you call `.set()`:

1. All subscribers are notified
2. Any `computed()` or `derive()` that reads that Cell re-runs
3. UI that depends on those computations re-renders
4. New handler bindings may be created in that UI

Even if the value is logically the same, a new array/object reference is different from the old one, triggering the update cascade.

## Reference Implementation

See `packages/patterns/google/google-calendar-importer.tsx` in labs-4:

Lines 362-374:
```typescript
// Only update calendars if the list actually changed (prevents reactive loop)
const existingCalendars = state.calendars.get();
const calendarsChanged =
  existingCalendars.length !== calendars.length ||
  calendars.some(
    (cal, i) =>
      existingCalendars[i]?.id !== cal.id ||
      existingCalendars[i]?.summary !== cal.summary,
  );
if (calendarsChanged) {
  debugLog(debugMode, "Calendar list changed, updating...");
  state.calendars.set(calendars);
}
```

## When This Matters Most

This pattern is critical when:

1. **Handlers can be triggered repeatedly** (button clicks, toggle actions)
2. **The handler fetches data that rarely changes** (user profiles, config, calendar lists)
3. **UI elements with handlers are rendered inside `computed()`**
4. **The same data source is both read and written** in related handlers

## Debugging Tips

If you see:
- 100% CPU usage when clicking UI elements
- UI freezing or becoming unresponsive
- Console spam showing the same fetch/operation running repeatedly

Check:
1. Is a handler calling `.set()` unconditionally?
2. Is that state used in a `computed()` that renders clickable elements?
3. Add logging before `.set()` calls: `console.log("Setting calendars, changed:", calendarsChanged)`

## Key Takeaway

**Always guard `.set()` calls with a change check when the handler may run multiple times.** This is especially important for handlers that fetch external data and are bound to UI elements rendered in reactive contexts.

---

## Related

- [2026-01-08: computed() inside .map() infinite loops](./2026-01-08-computed-inside-map-callback-infinite-loop.md)
- [2026-01-15: reactive refs from .map() to handlers](./2026-01-15-reactive-refs-from-map-to-handlers.md)
