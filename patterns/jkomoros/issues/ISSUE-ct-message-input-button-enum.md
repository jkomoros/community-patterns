# Feature Request: ct-message-input buttonText Enum Support

**Date:** 2025-12-15
**Component:** ct-message-input
**Type:** Feature Request
**Priority:** Low (UX polish)

## Summary

The `ct-message-input` component intentionally restricts `buttonText` customization for security/UX reasons (preventing misleading labels). However, the restriction is too broad - a pre-enumerated set of safe values should be supported.

## Current Behavior

The button always displays "Send" regardless of context:

```typescript
// This doesn't work - buttonText not in JSX types
<ct-message-input
  placeholder="Location name..."
  buttonText="Add"  // Ignored
/>
```

**Result:** Button shows "Send" even when adding items to a list.

## Requested Behavior

Support a limited enum of safe button text values:

```typescript
type MessageInputButtonText = "Send" | "Add" | "icon-only";

interface CTMessageInputAttributes<T> extends CTHTMLAttributes<T> {
  // ...existing props...
  "buttonText"?: MessageInputButtonText;
}
```

### Proposed Values

| Value | Use Case | Visual |
|-------|----------|--------|
| `"Send"` (default) | Chat/messaging interfaces | "Send" |
| `"Add"` | Adding items to lists | "Add" |
| `"icon-only"` | Compact UIs | Send arrow icon only |

## Security Rationale (Why Not Arbitrary Text)

The current restriction is correct in principle - arbitrary text could enable misleading UIs:

- "Delete All" - user thinks they're sending a message
- "Transfer Funds" - misleading about the action
- "Confirm Purchase" - inappropriate for a message input

The enum approach maintains security while allowing legitimate customization.

## Use Case

**Pattern:** `extracurricular-v2.tsx`
**Scenario:** Adding locations to a list

```typescript
// Current: Shows "Send" which is confusing
<ct-message-input
  placeholder="Location name (e.g., TBS, BAM)"
  onct-send={(e) => {
    locations.push({ name: e.detail.message, ... });
  }}
/>

// Desired: Shows "Add" which matches the action
<ct-message-input
  placeholder="Location name (e.g., TBS, BAM)"
  buttonText="Add"
  onct-send={(e) => {
    locations.push({ name: e.detail.message, ... });
  }}
/>
```

## Implementation Suggestion

1. Add enum type to component:
   ```typescript
   type ButtonTextOption = "Send" | "Add" | "icon-only";
   ```

2. Validate in setter:
   ```typescript
   set buttonText(val: string) {
     const allowed = ["Send", "Add", "icon-only"];
     this._buttonText = allowed.includes(val) ? val : "Send";
   }
   ```

3. Add to JSX types with enum constraint:
   ```typescript
   interface CTMessageInputAttributes<T> extends CTHTMLAttributes<T> {
     "buttonText"?: "Send" | "Add" | "icon-only";
   }
   ```

## Files to Modify

| File | Change |
|------|--------|
| `packages/ui/src/v2/components/ct-message-input/ct-message-input.ts` | Add enum validation |
| `packages/html/src/jsx.d.ts` | Add `buttonText` with enum type to CTMessageInputAttributes |

## Comparison with Similar Components

| Component | buttonText | Reasoning |
|-----------|-----------|-----------|
| ct-file-input | Unrestricted | "Upload" context is unambiguous |
| ct-image-input | Unrestricted | "Upload" context is unambiguous |
| ct-message-input | **Enum (proposed)** | Message context needs safe labels |

## Workaround Until Fixed

Use separate `ct-input` + `ct-button` components:

```typescript
<div style={{ display: "flex", gap: "0.5rem" }}>
  <ct-input
    placeholder="Location name..."
    $value={inputValue}
    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
  />
  <ct-button onClick={handleAdd}>Add</ct-button>
</div>
```

This loses the nice integrated styling but allows custom button text.

---

## Related

- Superstition: `community-docs/superstitions/2025-12-15-ct-message-input-buttontext-restricted.md`
- Component source: `packages/ui/src/v2/components/ct-message-input/ct-message-input.ts`
- JSX types: `packages/html/src/jsx.d.ts` (CTMessageInputAttributes ~line 3122)
