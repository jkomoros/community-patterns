# Input Two-Way Binding May Not Work Inside ifElse Conditionals

## Framework Author Response (seefeldb, 2025-12-03)

> "that's a bug, and a very strange one."

## NARROWING TEST RESULTS (2025-12-03)

**The bug is specific to native `<input>` elements, NOT `<ct-input>`!**

| Input Type | In ifElse | Result |
|------------|-----------|--------|
| `<input value={cell}>` | Yes | ❌ Cell stays empty |
| `<ct-input $value={cell}>` | Yes | ✅ Cell updates correctly |

**Repro:** `repros/2025-12-03-ifelse-binding-native-input-test.tsx`

### Workaround

Use `<ct-input $value={cell}>` instead of native `<input value={cell}>` inside ifElse branches.

**Status:** CONFIRMED BUG - specific to native HTML inputs in ifElse

---

## Observation

When using `<input>` or `<textarea>` elements with `value={cell}` inside the conditional branch of an `ifElse()`, the two-way binding appears not to work. The user can type in the input (visually), but the cell value doesn't update.

## Example - What Doesn't Work

```typescript
// Modal visibility controlled by ifElse
{ifElse(
  showModal,
  <div className="modal">
    <input
      type="text"
      value={inputCell}  // Two-way binding doesn't update the cell
      placeholder="Enter value..."
    />
    <button onClick={submitHandler({ inputCell })}>
      Submit
    </button>
  </div>,
  null
)}
```

When the user types in the input, `inputCell.get()` in the handler still returns the original value (empty string or whatever it was set to before showing the modal).

## Observed Behavior

1. User opens modal (sets `showModal` to true)
2. Handler resets `inputCell.set("")`
3. Modal renders with empty input
4. User types "Hello" in the input field
5. User clicks Submit
6. Handler calls `inputCell.get()` - returns `""` instead of `"Hello"`

## Workaround

Set meaningful default values in the handler that opens the modal, so even if the user doesn't (can't) modify them, the values are useful:

```typescript
const openModal = handler<...>((_, { showModal, inputCell }) => {
  inputCell.set("Default Value");  // Set a useful default
  showModal.set(true);
});
```

Or avoid conditionally rendered inputs entirely by using CSS visibility instead of `ifElse`.

## Why This Might Happen

The reactive system may not properly track input changes for elements that are conditionally rendered. When the element is inside the "true" branch of ifElse:
- The element may be re-created each render
- Event listeners may not be properly attached
- The binding infrastructure may not connect correctly

## Tags

- reactivity
- ifElse
- input
- two-way-binding
- forms
- modal

## Confirmation Status

- **First observed**: 2025-11-30
- **Confirmed by**: Not yet confirmed by others
- **Needs**: Framework author confirmation on whether this is expected behavior
