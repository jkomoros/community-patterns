# Feature Request: ct-cell-link Should Handle Cross-Space Navigation

## Problem

When using `wish()` to find a charm in another space, the `$UI` property renders as a `ct-cell-link` (or similar component). Clicking these links fails because they attempt to navigate within the current space rather than to the charm's actual space.

## Reproduction

```tsx
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });
const wishedAuthUI = derive(wishResult, (wr) => wr?.$UI);

// Renders links like "Google Auth #gq7mge"
// Clicking navigates to current-space/baedrei...gq7mge (fails)
// Should navigate to original-space/baedrei...gq7mge
{wishedAuthUI}
```

## Expected Behavior

The rendered link component should include the source space and navigate correctly cross-space.

## Use Case

Pattern uses `wish({ query: "#googleAuth" })` to find a shared auth charm. When the OAuth token expires, we show the `$UI` so users can navigate to re-authenticate. Currently the links don't work cross-space.
