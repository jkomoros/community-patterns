# Use derive() for Custom Element Attributes Inside .map()

**Date:** 2026-01-19
**Status:** confirmed
**Confidence:** high
**Stars:** 3

## TL;DR - The Rule

**When passing cell property values to custom element attributes inside `.map()`, use `derive()` to extract the value.** Direct property access results in `null`/`undefined` being passed to the attribute.

```tsx
// BROKEN - Direct property access passes undefined to attribute
{notes.map((note) => (
  <ct-copy-button text={note.content} />  // text is undefined!
))}

// CORRECT - derive() extracts the actual string value
{notes.map((note) => (
  <ct-copy-button text={derive(note, (n) => n.content)} />  // text is correct!
))}
```

---

## Summary

Inside a `.map()` callback over a reactive array, each item (e.g., `note`) is wrapped in a cell reference. When you access a property like `note.content`, you're getting another reactive reference, not the raw value.

**For JSX text interpolation, this works fine** - the framework auto-unwraps reactive values in text contexts:

```tsx
<span>{note.content}</span>  // Works! Framework auto-unwraps
```

**For custom element attributes, this DOES NOT work** - custom elements (web components) expect actual values, not reactive references:

```tsx
<ct-copy-button text={note.content} />  // Broken! Passes undefined
```

The `derive()` function properly resolves the reactive reference and passes the actual string value to the attribute.

## Why This Happens

1. **Items in `.map()` are reactive cells** - The framework wraps each item to enable fine-grained reactivity
2. **Property access returns reactive references** - `note.content` is itself a cell reference, not a string
3. **Custom elements expect plain values** - Web components like `ct-copy-button` receive attributes as-is without reactive unwrapping
4. **No error is thrown** - The attribute is simply `undefined` or `null`, making debugging difficult

This contrasts with the JSX transformer's behavior for text content and style properties, where reactive values are automatically unwrapped.

## Symptoms

- **Custom element attributes are undefined/null** when they should have values
- **No runtime errors** - fails silently
- **Same code works for text interpolation** - `<span>{note.content}</span>` displays correctly
- **Affects only custom elements** - native HTML attributes may behave differently

## The Problematic Pattern

This pattern appears when rendering a list with custom UI components:

```tsx
// BROKEN: Direct property access to custom element attribute
{items.map((item) => (
  <ct-card>
    <ct-copy-button text={item.text} />  {/* text is undefined */}
    <my-custom-element data={item.data} /> {/* data is undefined */}
  </ct-card>
))}
```

## Correct Pattern

Use `derive()` to extract values for custom element attributes:

```tsx
// CORRECT: derive() extracts the actual value
{items.map((item) => (
  <ct-card>
    <ct-copy-button text={derive(item, (i) => i.text)} />
    <my-custom-element data={derive(item, (i) => i.data)} />
  </ct-card>
))}
```

You can also use `derive()` for formatting or transformations:

```tsx
{notes.map((note) => (
  <>
    <span>{derive(note, (n) => formatDate(n.date))}</span>
    <ct-copy-button text={derive(note, (n) => n.content)} />
  </>
))}
```

## Real-World Example

**Pattern:** Email Notes
**Bug:** `ct-copy-button` wasn't receiving the note content, so clicking "Copy" copied nothing

### Before (Broken)

```tsx
{notes.map((note) => (
  <ct-copy-button
    text={note.content}  // undefined!
    variant="outline"
    size="sm"
  />
))}
```

**Result:** Clicking "Copy" silently failed because `text` was undefined.

### After (Fixed)

```tsx
{notes.map((note) => (
  <ct-copy-button
    text={derive(note, (n) => n.content)}  // correctly passes string
    variant="outline"
    size="sm"
  />
))}
```

**Result:** Clicking "Copy" correctly copies the note content to clipboard.

## Differentiating from Related Issues

| Issue | Symptom | Root Cause |
|-------|---------|------------|
| **This issue** | Custom element attribute is undefined | Reactive ref not unwrapped for web component attributes |
| Reactive refs to handlers | Error: "reactive reference outside context" | Reactive ref passed to handler callback |
| Using .get() on inline computed | Various issues | Breaks auto-unwrapping |
| JSX inside computed() | UI doesn't update | Transformer skips reactive wrapping |

## Key Rules

1. **Use `derive()` for custom element attributes** inside `.map()` callbacks
2. **Text interpolation works without derive()** - `<span>{item.value}</span>` is fine
3. **Native HTML attributes may work** - but custom elements (ct-*, my-*) need derive()
4. **Check attribute values in DevTools** - if you see `null` or `undefined`, you likely need derive()

## Related Superstitions

- `2026-01-15-reactive-refs-from-map-to-handlers.md` - Similar issue with handlers (pass index, not item)
- `2025-12-14-inline-computed-in-map-is-fine.md` - Computed inside map is OK
- `2026-01-19-jsx-inside-computed-breaks-reactivity.md` - Different issue (JSX in computed)

## Metadata

```yaml
topic: reactivity, derive, map, custom-elements, web-components, attributes
discovered: 2026-01-19
confirmed_count: 1
last_confirmed: 2026-01-19
sessions: [email-notes-copy-button-fix]
related_functions: derive, map
pattern: packages/patterns/google/email-notes.tsx
status: confirmed
confidence: high
stars: 3
applies_to: [CommonTools]
```

## Guestbook

- 2026-01-19 - Email Notes pattern `ct-copy-button` fix. The copy button's `text` attribute was receiving `undefined` when using `text={note.content}` inside `.map()`. Fixed by using `text={derive(note, (n) => n.content)}`. The issue is that custom elements (web components) don't automatically unwrap reactive references like JSX text interpolation does. (email-notes-copy-button-fix)

---

**Remember:** Custom elements are web components that receive attributes as-is. Use `derive()` to extract actual values from reactive cell references inside `.map()` callbacks.
