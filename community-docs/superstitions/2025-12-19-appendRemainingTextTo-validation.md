# ImportReview appendRemainingTextTo Must Match a fieldMappings Key

**Status:** Folk Wisdom (confirmed through implementation and review)
**Date:** 2025-12-19
**Severity:** High

## The Problem

When using ImportReview with `appendRemainingTextTo`, if you specify a field key that doesn't exist in `fieldMappings`, the remaining text is **silently lost**. No error, no warning (unless you check the console).

This is a common typo/refactoring bug:

```typescript
// ❌ BUG - "notes_field" doesn't match "notes" in fieldMappings
const extraction = ImportReview({
  trigger,
  schema,
  fieldMappings: [
    { key: "displayName", label: "Display Name", currentValue: displayName },
    { key: "email", label: "Email", currentValue: email },
    { key: "notes", label: "Notes", currentValue: notes, appendMode: true },
  ],
  captureRemainingText: true,
  appendRemainingTextTo: "notes_field",  // ← TYPO! Should be "notes"
});
```

**Result:** Any text the LLM couldn't extract into specific fields (remainingText) is **silently discarded** instead of being appended to the notes field.

## The Solution

ImportReview now logs a console warning when this misconfiguration is detected:

```
[ImportReview] appendRemainingTextTo="notes_field" not found in fieldMappings.
Available keys: displayName, email, notes. Remaining text will not be appended to any field.
```

**Best practices:**
1. Always double-check that `appendRemainingTextTo` matches a key in `fieldMappings`
2. Look for this warning in the browser console if remainingText isn't appearing
3. Consider using constants for field keys to avoid typos:

```typescript
// ✅ GOOD - use constants for field keys
const FIELD_KEYS = {
  displayName: "displayName",
  email: "email",
  notes: "notes",
} as const;

const extraction = ImportReview({
  trigger,
  schema,
  fieldMappings: [
    { key: FIELD_KEYS.displayName, label: "Display Name", currentValue: displayName },
    { key: FIELD_KEYS.email, label: "Email", currentValue: email },
    { key: FIELD_KEYS.notes, label: "Notes", currentValue: notes, appendMode: true },
  ],
  captureRemainingText: true,
  appendRemainingTextTo: FIELD_KEYS.notes,  // ← Now type-safe!
});
```

## Related Features

- `captureRemainingText: true` - Enables the `_remainingText` field in the extraction schema
- `appendMode: true` on a fieldMapping - Makes that field append instead of replace
- `appendSeparator: string` - Customizes the separator (default: `"\n\n"`)

## See Also

- `community-docs/folk_wisdom/2025-12-19-required-array-causes-unknown-values.md` - Related schema issue
