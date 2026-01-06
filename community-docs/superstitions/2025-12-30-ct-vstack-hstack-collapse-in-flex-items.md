# SUPERSTITION: ct-vstack/ct-hstack Collapse to 0px Width in Flex Items

**WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

ct-vstack and ct-hstack collapse to 0px width when used as flex items inside another flex container

## Problem

When using `ct-vstack` or `ct-hstack` as a flex item inside another flex container (e.g., `<span style="display: inline-flex">`), the component collapses to 0px width, making its contents invisible.

### What Doesn't Work

```tsx
<span style="display: inline-flex; align-items: center; gap: 6px;">
  <button>icon</button>
  <ct-vstack gap="0">  {/* THIS COLLAPSES TO 0px WIDTH */}
    <span>Some text</span>
    <span>More text</span>
  </ct-vstack>
  <button>x</button>
</span>
```

**Symptom:** The ct-vstack and its children render in the DOM but are invisible because the element has 0px width. The buttons on either side appear adjacent with no content between them.

## Root Cause

Both `ct-vstack` and `ct-hstack` have `:host { display: block; }` in their Shadow DOM CSS.

When a `display: block` element is a flex item, it doesn't contribute its intrinsic content width to the parent flex container's sizing algorithm. The flex container sees it as having no minimum content width, so it collapses to 0px.

This is standard CSS behavior - block elements inside flex containers need explicit sizing or flex properties to maintain their dimensions.

## Solution That Works

Use a plain `<span>` with inline flex styles instead of `ct-vstack` when inside a flex item:

```tsx
<span style="display: inline-flex; align-items: center; gap: 6px;">
  <button>icon</button>
  <span style="display: flex; flex-direction: column;">  {/* WORKS CORRECTLY */}
    <span>Some text</span>
    <span>More text</span>
  </span>
  <button>x</button>
</span>
```

**Result:** The span with `display: flex` properly contributes its intrinsic content width to the parent flex container.

## Alternative Workarounds

If you must use ct-vstack/ct-hstack inside a flex container:

1. **Add explicit min-width:**
   ```tsx
   <ct-vstack gap="0" style="min-width: max-content;">
     <span>Some text</span>
     <span>More text</span>
   </ct-vstack>
   ```

2. **Add flex: 1 to take available space:**
   ```tsx
   <ct-vstack gap="0" style="flex: 1;">
     <span>Some text</span>
     <span>More text</span>
   </ct-vstack>
   ```

3. **Add explicit width:**
   ```tsx
   <ct-vstack gap="0" style="width: 100px;">
     <span>Some text</span>
     <span>More text</span>
   </ct-vstack>
   ```

## Context

- **Components affected:** ct-vstack, ct-hstack (any component with `:host { display: block }`)
- **Use case:** Nested flex layouts, inline flex containers with stacked content
- **Detection:** Content exists in DOM but element has 0px width in DevTools

## Related Official Docs

- `packages/ui/src/v2/components/ct-vstack/ct-vstack.ts` - vstack component
- `packages/ui/src/v2/components/ct-hstack/ct-hstack.ts` - hstack component

## Metadata

```yaml
topic: ct-vstack, ct-hstack, flex, layout, css, collapse, width
discovered: 2025-12-30
confirmed_count: 1
last_confirmed: 2025-12-30
sessions: []
related_labs_docs: packages/ui/src/v2/components/ct-vstack/, packages/ui/src/v2/components/ct-hstack/
status: superstition
stars:
```

## Guestbook

- 2025-12-30 - ct-vstack collapsed to 0px width when used inside inline-flex container, fixed by using plain span with flex styles instead

---

**Remember: This is just one observation. Test thoroughly in your own context!**
