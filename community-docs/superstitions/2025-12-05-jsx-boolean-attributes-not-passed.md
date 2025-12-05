---
topic: jsx
discovered: 2025-12-05
confirmed_count: 1
last_confirmed: 2025-12-05
sessions: [ct-autocomplete-implementation]
related_labs_docs: ~/Code/labs/docs/common/PATTERNS.md
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

---

# Kebab-Case JSX Attributes Don't Map to CamelCase Lit Properties

## Problem

When using kebab-case attribute names in JSX (e.g., `allow-custom`), CommonTools
sets a **property** named `allow-custom` on the DOM element, but Lit components
define properties with camelCase names (e.g., `allowCustom`). The property
name mismatch causes the value to be lost.

**Root Cause (from render.ts line 532-533):**
```typescript
// CommonTools sets properties directly using the JSX attribute name:
target[key as keyof T] = value;  // key = "allow-custom"
// But Lit property is named "allowCustom" - they don't match!
```

**Example of the issue:**

```typescript
// In pattern JSX:
<ct-autocomplete
  items={items}
  allow-custom={true}  // JSX uses kebab-case
/>

// What happens:
// CommonTools: element["allow-custom"] = true
// But Lit property: element.allowCustom (never set!)
```

## Why Some Boolean Attributes Work

Components like `ct-file-input` use camelCase in both JSX types AND property names:

```typescript
// JSX types use camelCase:
interface CTFileInputAttributes {
  "showPreview"?: boolean;  // camelCase
}

// Lit property uses camelCase:
@property({ type: Boolean })
showPreview = true;  // camelCase

// Pattern uses camelCase:
<ct-file-input showPreview={false} />  // Works! Names match
```

## Solution: Use CamelCase for Both JSX Types and Lit Properties

**For component authors:** Use camelCase property names that match JSX attribute names.

```typescript
// BAD - mismatched names:
// JSX: "allow-custom"
// Lit: allowCustom

// GOOD - matching names:
// JSX: "allowCustom"
// Lit: allowCustom
```

**For pattern authors:** Check if the component uses kebab-case in JSX types.
If so, that attribute may not work correctly with static boolean values.

## Workarounds

1. **Set property via ref/evaluate** (testing only):
```typescript
element.allowCustom = true;  // Works but not practical in patterns
```

2. **Change component to use camelCase JSX types** (requires component update)

## Context

Discovered while implementing ct-autocomplete. The component defines:

```typescript
static override properties = {
  allowCustom: { type: Boolean, attribute: "allow-custom" },
};
```

JSX types define:
```typescript
interface CTAutocompleteAttributes {
  "allow-custom"?: boolean;  // Kebab-case
}
```

Pattern uses:
```tsx
<ct-autocomplete allow-custom={true} />
```

CommonTools sets `element["allow-custom"] = true` but the Lit property is
`element.allowCustom` - they never connect!

## Evidence

**Working example (camelCase):**
- `<ct-file-input showPreview={false}>` - Works because `showPreview` matches Lit property

**Non-working example (kebab-case):**
- `<ct-autocomplete allow-custom={true}>` - Fails because `allow-custom` != `allowCustom`

## Related Documentation

- **CommonTools render.ts:** `packages/html/src/render.ts` lines 532-533
- **Lit property docs:** https://lit.dev/docs/components/properties/
- **Official docs:** ~/Code/labs/docs/common/PATTERNS.md

## Next Steps

- [ ] Fix ct-autocomplete to use camelCase JSX type (`allowCustom`)
- [ ] Audit other components for kebab-case JSX attributes
- [ ] Consider framework fix to handle kebab→camelCase conversion
- [ ] Document this in component authoring guidelines

## Notes

- This is NOT a boolean-specific issue - it affects ANY kebab-case JSX attribute
- Reactive values (Cells) likely have the same issue if using kebab-case
- The `attribute: "allow-custom"` in Lit maps the HTML attribute, not JSX props
- CommonTools sets **properties**, not **attributes**, so Lit's attribute mapping is bypassed

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
