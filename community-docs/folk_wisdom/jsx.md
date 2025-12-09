# JSX - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/PATTERNS.md`, `~/Code/labs/docs/common/COMPONENTS.md`

---

## Native `<input>` Two-Way Binding Doesn't Work (Use ct-input)

⭐⭐⭐ (Framework author acknowledged as bug + testing confirmed)

**Source:** Framework author: "that's a bug, and a very strange one."

Native HTML `<input>` elements with `value={cell}` don't update the cell when the user types. The input visually shows typed text, but `cell.get()` returns the original value.

### The Problem

```typescript
// ❌ BROKEN - Native input doesn't update cell
<input type="text" value={titleCell} />

// Later in handler:
const title = titleCell.get();  // Still returns original value, not what user typed!
```

**Verified behavior:**
- User types "Hello" in the input
- Input visually shows "Hello"
- `titleCell.get()` returns "" (or whatever it was before)
- `derive()` on the cell doesn't see updates

### The Solution

Use `<ct-input>` with bidirectional binding:

```typescript
// ✅ WORKS - ct-input with $value binding
<ct-input $value={titleCell} />

// Later in handler:
const title = titleCell.get();  // Returns what user typed!
```

### Scope

This bug affects:
- Native `<input>` elements
- Native `<textarea>` elements
- Both inside and outside `ifElse()` conditionals

This does NOT affect:
- `<ct-input>` with `$value={cell}` - Works correctly
- `<ct-select>` with `$value={cell}` - Works correctly
- Other ct-* components with bidirectional binding

### Workaround for Modals/Conditional Inputs

If you must use native inputs in conditional UI, set meaningful defaults in the handler that opens the modal:

```typescript
const openModal = handler<...>((_, { showModal, inputCell }) => {
  inputCell.set("Default Value");  // Set useful default
  showModal.set(true);
});
```

Or use CSS visibility instead of `ifElse()` to hide/show the input.

**Related:** `~/Code/labs/docs/common/COMPONENTS.md` (ct-input documentation)

**Guestbook:**
- ✅ 2025-11-30 - Discovered in modal input scenario (jkomoros)
- ✅ 2025-12-03 - Framework author confirmed as bug (jkomoros)
- ✅ 2025-12-04 - Verified native input fails even OUTSIDE ifElse; ct-input works (jkomoros)

---
