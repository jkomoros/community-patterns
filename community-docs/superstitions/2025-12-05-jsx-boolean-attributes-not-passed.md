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

# Boolean JSX Attributes May Not Be Passed to Web Components

## Problem

When passing boolean attributes to web components in CommonTools JSX,
the attribute value may not be passed correctly to the web component.
The JSX type definitions accept the boolean attribute, but the component
doesn't receive the value.

**Example of the issue:**

```typescript
// In pattern JSX:
<ct-autocomplete
  items={items}
  allow-custom={true}  // This is typed correctly and compiles
/>

// But when inspecting the rendered component:
// - element.allowCustom is false
// - element.hasAttribute('allow-custom') is false
// - The attribute was never set
```

## Solution That Seemed To Work

Manually set the property via JavaScript after component renders:

```typescript
// Using Playwright evaluate (during testing)
const el = findInShadow(document, 'ct-autocomplete');
el.allowCustom = true;  // Now the feature works
```

This confirms the component implementation is correct - the issue is
in how CommonTools JSX passes boolean attributes to web components.

## Context

Discovered while implementing the ct-autocomplete component in labs/.
The component has:

```typescript
static override properties = {
  allowCustom: { type: Boolean, attribute: "allow-custom" },
};
```

The JSX types correctly define:

```typescript
interface CTAutocompleteAttributes {
  "allow-custom"?: boolean;
}
```

The pattern correctly uses:

```tsx
<ct-autocomplete allow-custom={true} />
```

But the attribute is never set on the rendered component. When manually
setting `element.allowCustom = true` via JavaScript, the feature works
perfectly.

## What We Tried

1. `allow-custom={true}` - Compiles but doesn't work
2. `allowCustom={true}` - Type error (JSX expects kebab-case)
3. Manual property assignment - Works

## Related Documentation

- **Official docs:** ~/Code/labs/docs/common/PATTERNS.md (general patterns)
- **Related components:** ct-button, ct-switch likely use boolean attrs
- **Lit docs:** https://lit.dev/docs/components/properties/

## Next Steps

- [ ] Confirm with other boolean attributes (disabled, etc.)
- [ ] Check how built-in components handle booleans
- [ ] File framework issue if confirmed
- [ ] Find workaround for patterns (maybe derive + ref?)

## Notes

- The component implementation is correct (Lit boolean properties work fine)
- The JSX types are correct (accepts boolean value)
- The issue appears to be in CommonTools HTML->WebComponent bridging
- May be related to how JSX props are spread to DOM elements
- Other non-boolean attributes (items, placeholder) work correctly

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
