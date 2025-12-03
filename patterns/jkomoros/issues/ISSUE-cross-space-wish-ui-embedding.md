# Bug: ct-cell-link Navigates to Wrong Space for Cross-Space Charms

## Problem

When using `wish()` to find a charm in another space, clicking the rendered `ct-cell-link` navigates to the **current space** with the charm ID, instead of the **source space** where the charm actually exists. This results in a blank page.

## Confirmed Reproduction (2025-12-03)

**Setup:**
1. Deploy `google-auth.tsx` to space `jkomoros`, favorite it
2. Deploy `wish-auth-test.tsx` to space `different-space`
3. The wish correctly finds the Google Auth charm cross-space
4. Click the "Google Auth #sfcpfm" link

**Actual Result:**
- Navigates to: `http://localhost:8000/different-space/baedreibukx2stqm3abpjl2jlqpecvmod3pwcasivx5xmrr5sfushsfcpfm`
- Page shows blank (charm doesn't exist in `different-space`)

**Expected Result:**
- Should navigate to: `http://localhost:8000/jkomoros/baedreibukx2stqm3abpjl2jlqpecvmod3pwcasivx5xmrr5sfushsfcpfm`
- Page should show the Google Auth charm UI

## Root Cause

The `ct-cell-link` component doesn't include the source space in its navigation. It assumes the charm is in the current space.

## Code Pattern

```tsx
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });

// Renders ct-cell-link like "Google Auth #sfcpfm"
// Link href is just the charm ID, missing the source space
{wishResult.result}
```

## Impact

- Users cannot navigate to cross-space charms via ct-cell-link
- The "favorite once, use everywhere" pattern breaks for UI navigation
- Workaround: manually construct URLs with correct space name

## Suggested Fix

The `ct-cell-link` component should include the source space in its `href` or navigation logic when rendering a cross-space charm reference.

## Test Charm IDs (2025-12-03)

- Google Auth (jkomoros): `baedreibukx2stqm3abpjl2jlqpecvmod3pwcasivx5xmrr5sfushsfcpfm`
- Wish Auth Test (different-space): `baedreiezrauecddrndwx6nucdyqesltmf4hbhhcjdwj5uacw32anf7bra4`
