# Superstition: ct-message-input buttonText is Intentionally Restricted

> **WARNING: SUPERSTITION**
>
> This documents intentional framework behavior, not a bug.
> The restriction is a security/UX design decision.

---

**Date:** 2025-12-15
**Status:** superstition (documenting intentional behavior)
**Stars:** N/A (not a workaround - documenting design)

## Symptom

When using `ct-message-input`, attempting to change the button text from "Send" to something else (like "Add") doesn't work:

```typescript
// None of these work:
<ct-message-input button-text="Add" />
<ct-message-input buttonText="Add" />
```

The button always displays "Send".

## This is Intentional (Not a Bug)

The `buttonText` property is **intentionally omitted** from the JSX type definitions as a **security/UX feature**.

### Security Rationale

The "Send" label on `ct-message-input` is **load-bearing** - users rely on it to understand what the button does. Allowing arbitrary text could enable confusing or misleading UIs:

- "Delete All" - user thinks they're sending a message, actually triggering deletion
- "Transfer Funds" - misleading about the action
- "Confirm Purchase" - inappropriate for a message input

### Comparison with Other Components

| Component | buttonText in JSX? | Why |
|-----------|-------------------|-----|
| ct-file-input | Yes | "Upload" context is unambiguous |
| ct-image-input | Yes | "Upload" context is unambiguous |
| ct-message-input | **No** | Message/chat context needs consistent "Send" label |

## Current State

The component source code (`ct-message-input.ts`) DOES define the property:

```typescript
static override properties = {
  buttonText: { type: String, attribute: "button-text" },
  // ...
};
```

But the JSX type definitions (`jsx.d.ts`) intentionally OMIT it:

```typescript
interface CTMessageInputAttributes<T> extends CTHTMLAttributes<T> {
  "name"?: string;
  "placeholder"?: string;
  "appearance"?: "rounded";
  // Note: buttonText intentionally missing
}
```

## Feature Request: Add Enum of Safe Values

The restriction is too broad. Safe, pre-enumerated values should be allowed:

- `"Send"` (default) - for messages/chat
- `"Add"` - for adding items to lists
- `"[Send Icon]"` - icon-only variant

**See issue file:** `patterns/jkomoros/issues/ISSUE-ct-message-input-button-enum.md`

## Workaround

**None currently.** You must either:
1. Accept "Send" as the button label
2. Use a different component (ct-input + ct-button separately)

## Related

- `2025-12-05-jsx-boolean-attributes-not-passed.md` - General JSX attribute mapping issues
- `~/Code/labs/packages/ui/src/v2/components/ct-message-input/ct-message-input.ts` - Component source
- `~/Code/labs/packages/html/src/jsx.d.ts` - JSX type definitions (line ~3122)

---

## Metadata

```yaml
topic: components, jsx, security, UX
discovered: 2025-12-15
confirmed_count: 1
sessions: [extracurricular-selector-acceptance-testing]
related_labs_docs: none
status: documenting-intentional-behavior
```

## Guestbook

- 2025-12-15 - extracurricular-v2.tsx pattern. Tried to change "Add Location" button from "Send" to "Add". Neither `button-text="Add"` nor `buttonText="Add"` worked. Discovered this is intentional security/UX design, not a bug. (extracurricular-selector-acceptance-testing)
