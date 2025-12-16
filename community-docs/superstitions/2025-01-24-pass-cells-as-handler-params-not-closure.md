# ⚠️ SUPERSTITION: Pass Cells as Handler Parameters, Not Closure Variables in Reactive Contexts

**⚠️ WARNING: This is a SUPERSTITION - unverified folk knowledge from two observations.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

Accessing Cells inside handlers within reactive contexts (`.map()`, `computed()`, etc.)

## Problem

When you capture a Cell from closure inside a reactive context (`.map()`, `computed()`, etc.) and try to use it in a handler, the Cell gets unwrapped to its plain value and loses all Cell methods (`.set()`, `.get()`, `.key()`), causing "is not a function" errors.

**This affects:**
- ✅ onClick handlers inside `.map()` contexts
- ✅ Handlers inside `computed()` blocks
- ✅ Any handler that captures Cells from outer scope in reactive contexts

### What Didn't Work

```typescript
interface SelectionState {
  value: string | null;
}

interface RubricInput {
  selection: Default<SelectionState, { value: null }>;
}

export default pattern<RubricInput, RubricOutput>(
  ({ options, selection }) => {
    // selection is a Cell here

    return {
      [UI]: (
        <div>
          {options.map((option) => (
            <div
              onClick={() => {
                // ❌ selection is unwrapped to plain object here!
                console.log(selection);  // { value: null, Symbol(toCell): ... }
                console.log(typeof selection.set);  // "undefined"

                selection.set({ value: option.name });  // ❌ TypeError: selection.set is not a function
              }}
            >
              {option.name}
            </div>
          ))}
        </div>
      )
    };
  }
);
```

**Symptom:**
```
TypeError: selection.set is not a function
```

**Why:** Inside `.map()` callback contexts, Cells captured from outer closure get unwrapped to their plain values. Even though `selection` is a Cell at the pattern level, when captured by the arrow function inside `.map()`, it becomes a plain object `{value: null}` without Cell methods.

**This affects:**
- `Default<object, default>` wrapped Cells
- `Default<primitive, default>` wrapped Cells (even worse - become null)
- Any Cell captured from outer scope into `.map()` callback

**Even saving a reference doesn't help:**
```typescript
const selectionCell = selection;  // Still gets unwrapped in closure

options.map((option) => (
  <div onClick={() => {
    selectionCell.set(...);  // ❌ Still fails - selectionCell is plain object
  }}>
))
```

## Solution That Seemed to Work

**Pass the Cell as a handler parameter** instead of capturing it from closure:

```typescript
export default pattern<RubricInput, RubricOutput>(
  ({ options, selection }) => {
    // Define handler that takes Cell as parameter
    const selectOption = handler<unknown, { name: string, selectionCell: Cell<SelectionState> }>(
      (_, { name, selectionCell }) => {
        console.log(typeof selectionCell.set);  // "function" ✅
        selectionCell.set({ value: name });  // ✅ Works!
      }
    );

    return {
      [UI]: (
        <div>
          {options.map((option) => (
            <div
              onClick={selectOption({ name: option.name, selectionCell: selection })}
            >
              {option.name}
            </div>
          ))}
        </div>
      )
    };
  }
);
```

**Result:** The Cell retains all its methods when passed as a handler parameter! The handler receives an actual Cell, not a plain unwrapped value.

## Context

- **Pattern:** smart-rubric.tsx (Phase 2 - detail pane selection)
- **Use case:** Clicking on options in a list to update a selection state Cell
- **Framework:** CommonTools with TypeScript
- **Error location:** onClick handlers inside `.map()` that need to modify Cells from outer scope

## Theory / Hypothesis

There's a difference between how Cells are captured in closures vs passed as handler parameters:

1. **Closure capture inside reactive contexts (`.map()`, `computed()`, etc.):**
   - These callbacks create reactive contexts
   - Cells from outer scope get auto-unwrapped for convenience (so you can access properties directly)
   - This unwrapping strips Cell methods
   - Both objects and primitives get unwrapped (primitives may even become null)
   - Applies to ALL reactive contexts, not just `.map()`

2. **Handler parameters:**
   - Handler parameter values are evaluated at handler *invocation* time, not *definition* time
   - The framework passes Cells through to handlers without unwrapping
   - Cell methods remain intact
   - Works consistently across all reactive contexts

**Mental model:**
```
Closure capture in .map()/computed():  Cell → unwrapped value (no methods)
Handler parameter:                      Cell → Cell (methods intact)
```

## Comparison to Other Cells

**Arrays work differently:**
```typescript
options.map((option) => (
  <div onClick={() => {
    options.get();  // ✅ Works! options is still a Cell
  }}>
))
```

**Why:** `options` is the target of `.map()`, so it's treated specially. The `.map()` is called *on* the Cell, not inside a callback that closes over it.

**But this doesn't work:**
```typescript
{options.map((option) => (
  <div onClick={() => {
    selection.get();  // ❌ Fails! selection is unwrapped
    dimensions.get();  // ❌ Fails! dimensions is unwrapped
  }}>
))}
```

Only the Cell that `.map()` is called on maintains its Cell-ness. Other Cells from outer scope get unwrapped.

## Examples

### ❌ Don't capture Cells from closure in .map() onClick

```typescript
{items.map((item) => (
  <button
    onClick={() => {
      selectedItem.set(item.id);  // ❌ selectedItem.set is not a function
      counter.set(counter.get() + 1);  // ❌ counter.get is not a function
    }}
  >
    {item.name}
  </button>
))}
```

### ✅ Do pass Cells as handler parameters

```typescript
const selectItem = handler<unknown, { id: string, selectedCell: Cell<string | null> }>(
  (_, { id, selectedCell }) => {
    selectedCell.set(id);  // ✅ Works!
  }
);

const incrementCounter = handler<unknown, { counterCell: Cell<number> }>(
  (_, { counterCell }) => {
    counterCell.set(counterCell.get() + 1);  // ✅ Works!
  }
);

{items.map((item) => (
  <button
    onClick={selectItem({ id: item.id, selectedCell: selectedItem })}
  >
    {item.name}
  </button>
))}
```

### ✅ Alternative: Use handler for simple inline logic

If you need the Cell but the logic is simple, extract it to a handler:

```typescript
const toggleItem = handler<unknown, { id: string, listCell: Cell<string[]> }>(
  (_, { id, listCell }) => {
    const current = listCell.get();
    if (current.includes(id)) {
      listCell.set(current.filter(x => x !== id));
    } else {
      listCell.set([...current, id]);
    }
  }
);

{items.map((item) => (
  <button onClick={toggleItem({ id: item.id, listCell: selectedItems })}>
    {item.name}
  </button>
))}
```

### ✅ Works in computed() blocks too

The same pattern applies to handlers inside `computed()` blocks:

```typescript
export default pattern<Input, Output>(({ options, selection }) => {
  // Save Cell reference BEFORE computed block
  const optionsCell = options;

  const updateValue = handler<unknown, { optionName: string, value: number, optionsCell: Cell<Option[]> }>(
    (_, { optionName, value, optionsCell }) => {
      const opts = optionsCell.get();
      const newOpts = opts.map(opt =>
        opt.name === optionName ? { ...opt, value } : opt
      );
      optionsCell.set(newOpts);  // ✅ Works!
    }
  );

  return {
    [UI]: (
      {computed(() => {
        const selected = selection;
        const opts = options;
        const selectedOpt = opts.find(o => o.name === selected);

        return (
          <div>
            <button onClick={updateValue({
              optionName: selected,
              value: 10,
              optionsCell  // ✅ Pass Cell as parameter
            })}>
              Update Value
            </button>
          </div>
        );
      })}
    )
  };
});
```

## Key Pattern Summary

```typescript
// Pattern structure:
export default pattern<Input, Output>(({ cell1, cell2, array }) => {

  // Define handlers that take Cells as parameters
  const myHandler = handler<unknown, { cellParam: Cell<T>, value: string }>(
    (_, { cellParam, value }) => {
      cellParam.set(value);  // ✅ Cell methods work
    }
  );

  return {
    [UI]: (
      <div>
        {array.map((item) => (
          <button
            onClick={myHandler({
              cellParam: cell1,  // ✅ Pass Cell as parameter
              value: item.value
            })}
          >
            {item.name}
          </button>
        ))}
      </div>
    )
  };
});
```

## Related Patterns

- **Superstition: Default Only at Array Level** - Related issue with Default<> wrapping
- **Superstition: onClick Handlers Inside Conditional Rendering** - Similar closure/handler issues
- **Cell Arrays and Reactivity** - Understanding Cell behavior in different contexts

## Workarounds if Handler Approach Doesn't Work

If for some reason you can't use the handler parameter approach:

**Option 1: Save reference OUTSIDE .map() (unlikely to work based on testing)**
```typescript
// Probably won't work, but worth trying:
const cellRef = cell;
{array.map(...)}
```

**Option 2: Use inputs object reference**
```typescript
export default pattern<Input, Output>((inputs) => {
  // Don't destructure

  return {
    [UI]: (
      {inputs.array.map((item) => (
        <button onClick={() => {
          inputs.selection.set(item.id);  // May work?
        }}>
      ))}
    )
  };
});
```

**Note:** These workarounds are unverified. The handler parameter approach is the confirmed working solution.

## Metadata

```yaml
topic: cells, handlers, .map(), computed(), closure, reactivity, parameters, reactive-contexts
discovered: 2025-01-24
confirmed_count: 2
last_confirmed: 2025-11-24
sessions: [smart-rubric-phase-2-onclick-debugging, smart-rubric-phase-3-dimension-editing]
related_functions: handler, Cell, .map(), computed(), onClick
related_patterns: reactive-lists, dynamic-ui, reactive-contexts
status: superstition
stars: ⭐⭐⭐
```

## Guestbook

- ⭐⭐⭐ 2025-01-24 - Spent HOURS debugging "Cannot create cell link" and ".set is not a function" errors in smart-rubric pattern. Tried wrapping primitive in object (fixed null issue but Cell methods still missing). Tried saving reference before .map() (still unwrapped). Finally discovered: pass Cell as handler parameter! Works perfectly. Selection state now updates correctly when clicking options. This is a CRITICAL pattern for dynamic UI with Cells. (smart-rubric-phase-2-onclick-debugging)

- ⭐⭐⭐ 2025-11-24 - **CONFIRMED in computed() blocks!** Building dimension editing UI in smart-rubric detail pane. Handlers inside `computed()` block had same "Cannot create cell link" error when trying to access `options` Cell from closure. Applied same handler parameter pattern - saved `const optionsCell = options` before computed block, passed as parameter to handlers. Works perfectly! Numeric +/- buttons and categorical selection buttons all work. Scores update reactively. This pattern applies to **ALL reactive contexts** (map, computed, etc.), not just .map()! (smart-rubric-phase-3-dimension-editing)

---

**Remember: This is just one observation. Test thoroughly in your own context!**

**TIP:** If you see "X.set is not a function" or "X.get is not a function" errors inside `.map()` onClick handlers, DON'T try to capture the Cell from closure. Instead, pass it as a handler parameter!
