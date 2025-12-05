# ct-autocomplete Session Notes - Value Binding Exploration

## Current State

ct-autocomplete is implemented and working with:
- Search filtering (label, value, group, searchAliases)
- Keyboard navigation with scroll-into-view
- Fixed positioning dropdown (escapes overflow:hidden)
- `allowCustom` for free-form values
- Event-only API: `onct-select`, `onct-open`, `onct-close`

## The Question

Should ct-autocomplete have `$value` binding like ct-select, making it hold state internally rather than just firing events?

## ct-select Analysis

Looking at ct-select for reference:

```typescript
// ct-select properties
static override properties = {
  disabled: { type: Boolean, reflect: true },
  multiple: { type: Boolean, reflect: true },  // <-- supports multiple!
  items: { attribute: false },
  value: { attribute: false },  // <-- holds the selected value(s)
};

// Uses CellController for bidirectional binding
private _cellController = createCellController<unknown | unknown[]>(this, {
  timing: { strategy: "immediate" },
  onChange: (newValue, oldValue) => {
    this.applyValueToDom();
    this.emit("ct-change", { value: newValue, oldValue, items: this.items });
  },
});
```

ct-select with `multiple={true}`:
- `value` is an array of selected items
- User can select/deselect from dropdown
- `$value` binds bidirectionally to a Cell

## Proposed Design: Make ct-autocomplete Mirror ct-select

### New Properties

```typescript
static override properties = {
  items: { attribute: false },           // Available options
  value: { attribute: false },           // Selected value(s) - Cell or plain
  placeholder: { type: String },
  maxVisible: { type: Number },
  allowCustom: { type: Boolean },
  multiple: { type: Boolean },           // NEW: single vs multi-select
  disabled: { type: Boolean },
};
```

### Behavior Matrix

| `multiple` | `value` type | Behavior |
|------------|--------------|----------|
| false | `T \| undefined` | Single select - selecting replaces value |
| true | `T[]` | Multi select - selecting adds to array |

### Single Select Mode (`multiple={false}`, default)

```tsx
const selected = cell<string | undefined>(undefined);

<ct-autocomplete
  items={relationshipTypes}
  $value={selected}
  placeholder="Search..."
/>

// selected.get() => "colleague" (or undefined)
```

- Selecting an item sets `value` to that item's value
- Input shows the selected item's label (not cleared!)
- Can clear by selecting again or backspace
- Fires `ct-change` with `{ value, oldValue }`

### Multi Select Mode (`multiple={true}`)

```tsx
const selected = cell<string[]>([]);

<ct-autocomplete
  items={relationshipTypes}
  $value={selected}
  multiple={true}
  placeholder="Search to add..."
/>

// selected.get() => ["colleague", "friend", "custom-value"]
```

- Selecting an item adds to array (if not present)
- Input clears after selection (search for next)
- Selected items filtered from dropdown
- Fires `ct-change` with `{ value, oldValue }`
- **No built-in tag display** - userland handles that (like tag-selector-demo)

### Visual Difference

**Single select:** Input shows selected label, dropdown shows all items
**Multi select:** Input always empty/search, dropdown filters out selected

### Implementation Changes Needed

1. **Add CellController** for `$value` binding
   ```typescript
   private _cellController = createCellController<T | T[]>(this, {
     timing: { strategy: "immediate" },
     onChange: (newValue, oldValue) => {
       this.requestUpdate();
       this.emit("ct-change", { value: newValue, oldValue });
     },
   });
   ```

2. **Add `multiple` property** (default: false)

3. **Update `_selectItem` to use CellController**
   ```typescript
   private _selectItem(item: AutocompleteItem) {
     if (this.multiple) {
       // Add to array
       const current = this._cellController.getValue() as unknown[] || [];
       if (!current.includes(item.value)) {
         this._cellController.setValue([...current, item.value]);
       }
     } else {
       // Replace single value
       this._cellController.setValue(item.value);
     }

     // Clear query for multi, show label for single
     this._query = this.multiple ? "" : (item.label || item.value);
     this._close();
   }
   ```

4. **Update `_filteredItems` for multi-select**
   ```typescript
   private get _filteredItems() {
     let items = this.items;

     // Filter out already-selected items in multi mode
     if (this.multiple) {
       const selected = this._cellController.getValue() as unknown[] || [];
       items = items.filter(item => !selected.includes(item.value));
     }

     // Then apply search filter...
   }
   ```

5. **Update input display for single-select**
   - In single mode, show selected label in input
   - On focus, select all text for easy replacement

### API Comparison

**Before (event-only):**
```tsx
const tags = cell<{value: string}[]>([]);

<ct-autocomplete
  items={items}
  onct-select={(e) => {
    const current = tags.get();
    if (!current.some(t => t.value === e.detail.value)) {
      tags.push({ value: e.detail.value });
    }
  }}
/>
```

**After (with $value):**
```tsx
const selected = cell<string[]>([]);

<ct-autocomplete
  items={items}
  $value={selected}
  multiple={true}
/>
```

Much cleaner! The tag-selector-demo would become simpler.

### Events (Still Supported)

- `ct-change` - `{ value, oldValue }` - fired on any value change
- `ct-select` - `{ value, label, group?, isCustom }` - fired on each selection (useful for side effects)
- `ct-open` / `ct-close` - dropdown state

### Questions to Resolve

1. **Should selected items be removed from dropdown in multi mode?**
   - Yes, this is standard UX (like tag-selector-demo does now)

2. **What about custom values in the value array?**
   - Just strings, same as selected item values
   - `allowCustom` works the same way

3. **Should there be a way to remove items?**
   - No - that's userland UI (tag × buttons)
   - Component just manages the value array
   - Userland can `selected.set(selected.get().filter(...))`

4. **Input behavior in single mode?**
   - Shows selected label
   - On focus: select all text
   - Typing replaces/filters
   - Escape: revert to selected value

5. **Keyboard in multi mode?**
   - Backspace when empty: remove last item? Or no?
   - Probably no - keep it simple, use × buttons

## Next Steps

1. Add CellController integration
2. Add `multiple` property
3. Update selection logic for single/multi
4. Update filtering for multi mode
5. Update input display for single mode
6. Update tag-selector-demo to use `$value`
7. Test both modes
8. Update JSX types

## Files to Modify

- `packages/ui/src/v2/components/ct-autocomplete/ct-autocomplete.ts`
- `packages/html/src/jsx.d.ts` (add $value, multiple)
- `patterns/jkomoros/WIP/tag-selector-demo.tsx` (simplify with $value)
