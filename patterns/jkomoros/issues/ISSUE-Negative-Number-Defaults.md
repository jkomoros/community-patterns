# ISSUE: Negative Number Defaults Cause Schema Generation Error

**Status:** Open
**Severity:** Medium (workaround available)
**Discovered:** 2024-12-09
**Pattern:** story-weaver.tsx

---

## Summary

Using negative numbers as default values in `Default<number, N>` type definitions causes a TypeScript schema generation error during pattern deployment.

---

## Error Message

```
Error: Debug Failure. False expression: Negative numbers should be created in combination with createPrefixUnaryExpression
```

---

## Reproduction

### Minimal Example

```typescript
interface PatternState {
  selectedIndex?: Default<number, -1>;  // ❌ FAILS
}
```

When deploying a pattern with this interface, the framework's schema generation (which converts TypeScript types to Zod schemas) fails with the error above.

### Actual Code That Failed

```typescript
// In story-weaver.tsx
interface PatternInput {
  // ... other fields
  viewPromptSpindleIndex?: Default<number, -1>;
  editingSpindlePromptIndex?: Default<number, -1>;
  pickerSpindleIndex?: Default<number, -1>;
}
```

---

## Root Cause

The framework's TypeScript-to-schema conversion doesn't properly handle negative number literals. In the TypeScript AST, negative numbers are represented as a `PrefixUnaryExpression` (the `-` operator) applied to a positive number, not as a single negative number literal.

The schema generator appears to expect positive numbers only and fails when it encounters a negative value.

---

## Workaround

Use a large positive sentinel value instead of -1:

```typescript
// Define sentinel constant
const NO_SPINDLE_SELECTED = 999999;

interface PatternState {
  selectedIndex?: Default<number, 999999>;  // ✅ WORKS
}

// Check for "no selection" using the constant
if (selectedIndex.get() >= NO_SPINDLE_SELECTED) {
  // No spindle selected
}
```

### Important: Use `>=` in bounds checks

Since the sentinel value is large but finite, use `>=` comparison to handle any edge cases:

```typescript
// ❌ Fragile
if (idx === NO_SPINDLE_SELECTED) { ... }

// ✅ Robust
if (idx >= NO_SPINDLE_SELECTED) { ... }
```

---

## Expected Behavior

The framework should handle negative default values correctly:

```typescript
interface PatternState {
  selectedIndex?: Default<number, -1>;  // Should work
}
```

Common use cases for negative defaults:
- `-1` for "no selection" in index-based state
- `-1` for "not found" return values
- Negative values for countdown timers or offsets

---

## Impact

- Patterns cannot use negative defaults directly
- Requires workaround with sentinel values
- Extra cognitive overhead (remembering to use large sentinel instead of idiomatic -1)
- Potential bugs if developer forgets and uses -1

---

## Files Affected

- `patterns/jkomoros/story-weaver.tsx` - Applied workaround

---

## Related

- This was discovered during the story-weaver ID→Index refactor
- The refactor needed "no selection" state for modal indices
- See `design/todo/berni-session-12-9.md` for refactor context
