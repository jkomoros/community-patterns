# ifElse() with null False Branch Silently Crashes Rendering

**Date:** 2026-01-28 **Status:** confirmed regression (VDOM reconciler #2686 / #2698)
**Confidence:** high **Stars:** 4

## TL;DR - The Rule

**Passing `null` as the false branch of `ifElse()` silently crashes the entire
pattern's content rendering.** The charm header and NAME still display, but the
content area is completely blank. No console errors are logged.

```tsx
// BROKEN - null as false branch causes silent rendering failure
{
  ifElse(condition, <div>Content when true</div>, null);
}
// Result: Entire pattern content area is blank. No errors.

// CORRECT - Use empty <div /> instead of null
{
  ifElse(condition, <div>Content when true</div>, <div />);
}
// Result: Renders correctly.
```

---

## Summary

When `ifElse()` receives `null` as its third argument (the false/else branch),
the entire pattern's UI content silently fails to render. The charm still loads
— the header bar and `$NAME` are visible — but the content area is completely
empty. No errors appear in the console, making this extremely difficult to
diagnose.

This is distinct from other silent rendering failures (computed siblings, nested
computed in map) because the root cause is specifically the `null` value passed
to `ifElse()`, not a structural issue with reactive children.

## Symptoms

- **Pattern content area is completely blank** — header/NAME still shows, but no
  UI content renders
- **No console errors** — nothing in the browser console indicates a problem
- **ct check passes** — no build-time errors
- **charm inspect shows correct data** — server-side state looks fine
- **Extremely hard to diagnose** — requires binary-search debugging to isolate

## Why This Happens

**This is a regression introduced on 2026-01-28** by two commits on `main`:

- **`f1a9f459e`** — worker-side VDOM rendering (#2686): replaced the entire
  rendering pipeline with a new worker-side reconciler.
- **`49dbf864e`** — reactive array children + null schema (#2698): added
  `{ type: "null" }` to the VDOM children schema and restructured `asCell`
  placement.

The bug is in the new reconciler at
`packages/html/src/worker/reconciler.ts` (`updateChildren`, ~line 835-851).
When a Cell child resolves to `null`, `renderCellChild` leaves
`childState.nodeId` at `-1` (sentinel for "no DOM node"). The ordering loop
then unconditionally uses this value as `nextNodeId`, corrupting the insertion
reference for all preceding siblings. The applicator
(`packages/html/src/main/applicator.ts`, line 340-343) silently ignores
`insert-child` ops with unknown node IDs, so siblings fail to be inserted
with zero errors.

The **legacy renderer** (`packages/html/src/render.ts`, line 400-432)
handled null children by converting them to empty text nodes via
`stringifyText`, always producing a valid DOM node. The new worker
reconciler's sentinel-based approach was not adapted for this case.

The `ifElse` runtime and builder handle `null` fine at the cell/link level —
the issue is purely in the new rendering pipeline.

## Correct Patterns

### Pattern 1: Use empty div for false branch

```tsx
// Instead of null, use an empty element
{
  ifElse(
    hasResults,
    <div>{results.map((r) => <div>{r.title}</div>)}</div>,
    <div />,
  );
}
```

### Pattern 2: Use meaningful fallback content

```tsx
// Even better — show a helpful empty state
{
  ifElse(
    hasResults,
    <div>{results.map((r) => <div>{r.title}</div>)}</div>,
    <div style="color: gray;">No results yet.</div>,
  );
}
```

## Real-World Example

**Pattern:** email-style-extractor.tsx **Bug:** Entire pattern content rendered
blank despite the charm loading successfully with correct server-side data.

### Before (Blank Content)

```tsx
{
  ifElse(
    computed(() => extractedStyles.get().length > 0),
    <ct-vstack>
      {extractedStyles.map((style) => <div>{style.name}: {style.value}</div>)}
    </ct-vstack>,
    null,
  );
}
```

**Result:** Charm loads, header and NAME display, but the entire content area is
blank. Zero console errors.

### After (Works)

```tsx
{
  ifElse(
    computed(() => extractedStyles.get().length > 0),
    <ct-vstack>
      {extractedStyles.map((style) => <div>{style.name}: {style.value}</div>)}
    </ct-vstack>,
    <div />,
  );
}
```

**Result:** Pattern renders correctly. When there are no styles, an empty div is
rendered (invisible). When styles exist, the list appears.

## Debugging Story

This bug was discovered through extensive binary-search debugging of
`email-style-extractor.tsx`. The pattern loaded with a visible header but
completely blank content. Because there were no console errors and `ct check`
passed, the cause was not obvious. Systematic bisection — removing sections of
the pattern one at a time — eventually isolated the issue to an `ifElse()` call
that used `null` as the false branch.

The silent nature of this failure makes it particularly dangerous: there is no
signal pointing you toward the problem. If you encounter a blank-content pattern
with no errors, check all `ifElse()` calls for `null` branches.

## Related Superstitions

- `2026-01-28-multiple-computed-siblings-blank-render.md` — Different cause
  (sibling computed), similar symptom (blank rendering)
- `2026-01-19-nested-computed-in-map-silent-render-failure.md` — Different cause
  (nested computed in map), similar symptom (silent render failure)

## Quick Diagnostic

If your pattern shows a header but blank content with no errors:

1. Search your code for `ifElse(` calls
2. Check if any use `null` as the second or third argument
3. Replace `null` with `<div />`
4. Redeploy and test

## Metadata

```yaml
topic: jsx, ifElse, rendering, silent-failure
discovered: 2026-01-28
confirmed_count: 1
last_confirmed: 2026-01-28
sessions: [email-style-extractor-debug]
related_functions: ifElse, computed
pattern: packages/patterns/google/extractors/email-style-extractor.tsx
status: confirmed-regression
confidence: high
regression_commits: [f1a9f459e, 49dbf864e]
regression_prs: ["#2686", "#2698"]
stars: 4
applies_to: [CommonTools]
```

## Guestbook

- 2026-01-28 - email-style-extractor.tsx pattern. Content area rendered
  completely blank while header/NAME still displayed. No console errors.
  Discovered through binary-search debugging — systematically removing sections
  until isolating the cause to `ifElse(condition, <div>...</div>, null)`.
  Replacing `null` with `<div />` immediately fixed the rendering. The silent
  failure with zero error signals makes this particularly hard to diagnose.
  (email-style-extractor-debug)

---

**Confirmed regression.** Root cause traced to the new worker-side VDOM
reconciler (`f1a9f459e`, `49dbf864e`). The legacy renderer handled null children
fine. The workaround (`<div />` instead of `null`) remains necessary until the
reconciler is patched.
