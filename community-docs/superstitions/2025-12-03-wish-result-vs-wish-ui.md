---
topic: wish, reactivity, UI-embedding
discovered: 2025-12-03
confirmed_count: 1
last_confirmed: 2025-12-03
sessions: [hotel-membership-auth-ux-single-link-fix]
related_labs_docs: docs/common/FAVORITES.md
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

# Rendering Wished Charm UI: {wishResult.result} vs {wishResult}

## Problem

After framework PR #2169, using `{wishResult}` or `{wishResult.$UI}` in JSX no longer renders the target charm's UI. Instead, it renders the **wish.tsx picker pattern** which shows ct-cell-links to all matching candidates.

```tsx
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });

// BEFORE PR #2169: Rendered the Google Auth charm's full UI
// AFTER PR #2169: Renders wish.tsx picker with links to ALL matches
{wishResult}
```

## Solution

Use `{wishResult.result}` to render the first matched charm's actual UI:

```tsx
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });

// Renders the actual Google Auth charm UI (OAuth buttons, user info, etc.)
{wishResult.result}
```

## Why This Works

Looking at wish.tsx:
```tsx
return {
  result: computed(() => candidates.length > 0 ? candidates[0] : undefined),
  [UI]: (
    <div>
      {candidates.map((candidate) => (
        <ct-cell-link $cell={candidate} />
      ))}
    </div>
  ),
};
```

- `wishResult` renders the wish pattern's `[UI]` → all candidate links
- `wishResult.result` IS the first candidate charm cell → renders that charm's UI

## The Three Options

| Syntax | What It Renders |
|--------|-----------------|
| `{wishResult}` | wish.tsx picker UI (links to ALL matching favorites) |
| `{wishResult.$UI}` | Same as above - the picker UI |
| `{wishResult.result}` | The first matched charm's actual UI |

## When to Use Each

**Use `{wishResult.result}` when:**
- You want to embed the wished charm's UI directly (e.g., OAuth login form)
- You only care about the first/best match
- You want the user to interact with the charm inline

**Use `{wishResult}` when:**
- You want users to see all matching options
- You're building a picker/selector UI
- The wish.tsx picker behavior is desired

## Example: Embedding Google Auth

```tsx
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });

return {
  [UI]: (
    <div>
      {/* Hidden: triggers cross-space charm startup (CT-1090 workaround) */}
      <div style={{ display: "none" }}>{wishResult}</div>

      {/* Visible: shows the actual Google Auth UI for re-authentication */}
      <div style="padding: 12px; background: white; borderRadius: 6px;">
        {wishResult.result}
      </div>
    </div>
  ),
};
```

## Context

Discovered while fixing hotel-membership-extractor auth UX. Framework PR #2169 (Nov 30, 2025) changed wish() to launch wish.tsx for multi-match queries, which broke the previous behavior of embedding the target charm's UI directly.

The fix: use `{wishResult.result}` instead of `{wishResult}` to render the first matched charm's actual UI.

## Related

- **PR #2169:** feat(runner): launch wish.tsx when passing a generic query to wish
- **Superstition: Cross-Space wish() Requires JSX Embedding** - CT-1090 workaround
- **FAVORITES.md:** Future Plans mention "result picker UI"

---

**Remember:** This is a SUPERSTITION. Verify before relying on it.
