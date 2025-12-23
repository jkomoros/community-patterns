# Nested derive() Inside .map() Breaks Array Reactivity

## TL;DR - The Rule

**Never nest `derive()` calls inside a `.map()` callback.** Use a single flat `derive()` with all reactive values unwrapped together.

```tsx
// ❌ BROKEN - nested derive() calls inside map
classes.map((cls, idx) => {
  return derive({ name: cls.name, location: cls.location }, ({ name, location }) => {
    return (
      <div>
        <span>{name}</span>
        <span>@ {location?.name}</span>

        {/* NESTED derive() - breaks reactivity! */}
        {derive({ pins: cls.pinnedInSets }, ({ pins }) => (
          <button onClick={togglePin({ idx, pins })}>
            {pins ? "⭐" : "☆"}
          </button>
        ))}

        {/* ANOTHER nested derive() - breaks reactivity! */}
        {derive(editingClassIndex, (editIdx) => (
          editIdx === idx ? <input /> : null
        ))}
      </div>
    );
  });
});

// ✅ WORKS - single flat derive() with all values
classes.map((cls, idx) => {
  return derive(
    {
      name: cls.name,
      location: cls.location,
      pins: cls.pinnedInSets,
      editIdx: editingClassIndex
    },
    ({ name, location, pins, editIdx }) => {
      return (
        <div>
          <span>{name}</span>
          <span>@ {location?.name}</span>

          <button onClick={togglePin({ idx, pins })}>
            {pins ? "⭐" : "☆"}
          </button>

          {editIdx === idx ? <input /> : null}
        </div>
      );
    }
  );
});
```

---

## Summary

When using `.map()` on a reactive array, **nesting `derive()` calls inside the map callback breaks array reactivity**. The array data updates correctly (verified via console.log), but the UI does not re-render when items are added with `.push()`.

**Fix:** Use a single flat `derive()` that unwraps ALL reactive values at once, with no nested `derive()` calls inside.

## The Problem

### Symptoms

1. **Array data updates but UI doesn't**: `classes.get()` shows the new item, but the rendered list doesn't update
2. **Other reactivity still works**: `computed(() => classes.get().length)` DOES update
3. **Simple cases work**: `array.map()` with a SINGLE `derive()` (no nesting) works correctly
4. **Complex cases fail**: `array.map()` with NESTED `derive()` calls breaks

### Example That Fails

```tsx
// Classes array with multiple reactive properties per item
const classes = Cell.ofMany<ClassItem>([]);

// ❌ This breaks array reactivity
const classItems = classes.map((cls, idx) => {
  return derive({ name: cls.name, location: cls.location }, ({ name, location }) => {
    return (
      <div>
        <span>{name}</span>
        <span>@ {location?.name}</span>

        {/* Nested derive for pin button - BREAKS REACTIVITY */}
        {derive({ pins: cls.pinnedInSets }, ({ pins }) => (
          <button onClick={togglePin({ idx, pins })}>
            {pins ? "⭐" : "☆"}
          </button>
        ))}

        {/* Nested derive for edit mode - BREAKS REACTIVITY */}
        {derive(editingClassIndex, (editIdx) => (
          editIdx === idx ? <input /> : null
        ))}

        <button onClick={removeClass({ idx })}>Remove</button>
      </div>
    );
  });
});

// When you add a class:
classes.push(newClass);  // Data updates, but UI doesn't re-render!
console.log(classes.get().length);  // Shows correct new length
// But the UI still shows the old list
```

### What Works

```tsx
// ✅ Single flat derive with ALL values unwrapped together
const classItems = classes.map((cls, idx) => {
  return derive(
    {
      name: cls.name,
      location: cls.location,
      pins: cls.pinnedInSets,
      editIdx: editingClassIndex
    },
    ({ name, location, pins, editIdx }) => {
      return (
        <div>
          <span>{name}</span>
          <span>@ {location?.name}</span>

          {/* All conditionals use plain values from derive callback */}
          <button onClick={togglePin({ idx, pins })}>
            {pins ? "⭐" : "☆"}
          </button>

          {editIdx === idx ? <input /> : null}

          <button onClick={removeClass({ idx })}>Remove</button>
        </div>
      );
    }
  );
});

// Now adding a class works correctly:
classes.push(newClass);  // UI re-renders immediately!
```

## Why This Happens

**Hypothesis:** Nested `derive()` calls inside a `.map()` callback appear to interfere with the framework's array reactivity tracking. The framework may:

1. Track the outer `.map()` subscription
2. But nested `derive()` calls create additional reactive boundaries
3. These nested subscriptions may prevent proper change detection on array mutations
4. Result: array changes (like `.push()`) don't trigger UI updates

**Key insight:** The nesting level matters. A single `derive()` per map item works fine. Nesting `derive()` calls inside that first `derive()` breaks reactivity.

## Verification

This was verified in a fitness class tracker pattern:

1. **Initial state:** List of locations worked (single `derive()` per item)
2. **Added classes array:** Initially used nested `derive()` calls for buttons
3. **Bug appeared:**
   - `console.log(classes.get())` showed new items after `.push()`
   - `computed(() => classes.get().length)` updated correctly
   - But UI still showed old list
4. **Fix applied:** Flattened to single `derive()` with all values
5. **Result:** UI immediately started updating on `.push()`

## Related Patterns

### Different from "derive-inside-map-causes-thrashing"

The `2025-11-29-derive-inside-map-causes-thrashing.md` superstition is about creating NEW cell references on each reactive pass, causing constant re-evaluation.

**This issue is different:**
- Not about thrashing (no infinite loops)
- Not about new cell references
- About NESTING `derive()` calls breaking array change detection
- Symptom is NO re-render, not TOO MANY re-renders

### Different from "no-computed-inside-map"

The `2025-11-29-no-computed-inside-map.md` superstition is about using `.get()` on inline `computed()` in map callbacks.

**This issue is different:**
- Not about using `.get()`
- Not about inline `computed()`
- About NESTING `derive()` calls specifically
- Affects array mutations (push), not just rendering

### Different from "nested-computed-in-ifelse-causes-thrashing"

The `2025-12-17-nested-computed-in-ifelse-causes-thrashing.md` superstition is about multiple `computed()` conditions creating cascading subscriptions.

**This issue is different:**
- Not about `ifElse` conditionals
- Not about multiple subscriptions thrashing
- About `derive()` nesting breaking array change detection
- Symptom is MISSING updates, not cascading updates

## General Rule

**Inside `.map()` callbacks, use ONE flat `derive()` with ALL reactive values unwrapped.** Never nest `derive()` calls inside another `derive()`.

```tsx
// Pattern:
array.map((item) => {
  // Collect ALL reactive values you need
  return derive(
    {
      val1: item.prop1,
      val2: item.prop2,
      val3: someOtherCell,
      val4: someComputed
    },
    ({ val1, val2, val3, val4 }) => {
      // Use plain values for ALL rendering logic
      return <div>...</div>;
    }
  );
});
```

## Metadata

```yaml
topic: derive, map, array-reactivity, nested-derive, cell-array
discovered: 2025-12-23
confirmed_count: 1
last_confirmed: 2025-12-23
confidence: high
sessions: [fitness-class-tracker]
related_functions: derive, map, push, Cell.ofMany
related_superstitions:
  - 2025-11-29-derive-inside-map-causes-thrashing.md
  - 2025-11-29-no-computed-inside-map.md
  - 2025-12-17-nested-computed-in-ifelse-causes-thrashing.md
stars: 5
status: confirmed
```

## Guestbook

- 2025-12-23 - Discovered in fitness class tracker. Classes array with nested `derive()` calls (for pin button and edit mode) inside the main map `derive()`. Array data updated correctly on `.push()` (verified via console.log), and `computed(() => classes.get().length)` updated reactively, but UI didn't re-render. Flattened to single `derive()` with all values unwrapped together - UI immediately started updating on `.push()`. Root cause: nesting `derive()` calls inside map breaks array change detection.
