# Use ct-screen for Full-Width Pattern Layouts

**SUPERSTITION**

## Topic

Pattern UI layouts using `height: 100%` or flex layouts that need to fill the available space

## Problem Description

When using a root `<div>` with `height: "100%"` or flex layouts, the pattern content may exist in the DOM (visible in Playwright accessibility snapshots) but appear blank/invisible in the actual rendered view.

## What Doesn't Work

```tsx
[UI]: (
  <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
    {/* Content renders in DOM but appears blank */}
  </div>
)
```

The issue is that the parent container doesn't have an explicit height, so `height: 100%` computes to 0.

## What Works

Use the `<ct-screen>` custom element instead:

```tsx
[UI]: (
  <ct-screen style={{ display: "flex", flexDirection: "column" }}>
    {/* Content renders properly with full width/height */}
  </ct-screen>
)
```

The `ct-screen` element is a framework-provided custom element that:
- Takes up the full available width and height
- Provides proper containment for scrollable content
- Works with flex layouts

## Detection

If your pattern:
1. Shows content in Playwright `browser_snapshot` accessibility tree
2. But appears blank in screenshots
3. And uses `height: "100%"` on the root element

You likely need to switch to `ct-screen`.

## Context

- **Patterns affected:** imessage-viewer.tsx, calendar-viewer.tsx
- **Use case:** Full-screen app-like layouts with headers and scrollable content areas
- **Observed:** Content existed in DOM but was invisible until switching to ct-screen

## Related

- Many existing patterns use ct-screen: gmail-importer.tsx, star-chart.tsx, person.tsx, etc.

## Metadata

```yaml
topic: UI, layout, ct-screen, height, flex, rendering
discovered: 2025-12-07
confirmed_count: 1
last_confirmed: 2025-12-07
sessions: [apple-sync-calendar]
related_functions: UI, ct-screen
status: superstition
stars: ⭐⭐⭐
```

## Guestbook

- 2025-12-07 - calendar-viewer.tsx and imessage-viewer.tsx. Both patterns had content in DOM (visible in Playwright snapshots showing events/messages) but rendered completely blank. Switching from `<div style={{ height: "100%" }}>` to `<ct-screen>` fixed the issue immediately. (apple-sync-calendar)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
