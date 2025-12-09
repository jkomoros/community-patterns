# Cross-Charm Communication - Blessed ✓

Framework author approved community knowledge about cross-charm communication in CommonTools.

**Official docs:** `~/Code/labs/docs/common/PATTERNS.md`

---

## ct.render Forces Charm Execution

**Blessed by:** Berni (verbal guidance)
**Date:** 2024-12-09
**Framework version:** Current

---

### The Problem

When you "wish" for another charm (like an auth charm), it doesn't automatically execute:

```typescript
// ❌ PROBLEM: Just wishing for the charm doesn't make it run
const authCharm = wish("google-auth");

// The auth charm's handlers won't respond
// Token refresh won't work
// The charm is "imported" but not "running"
```

### The Solution

**Use `ct.render()` to force the charm to execute**, even if you don't need its UI:

```typescript
// ✅ CORRECT: ct.render forces the charm to execute
const authCharm = wish("google-auth");

return (
  <div>
    {/* Hidden div forces the auth charm to run */}
    <div style={{ display: "none" }}>
      {ct.render(authCharm)}
    </div>

    {/* Your actual UI */}
    <MainContent />
  </div>
);
```

### Why This Works

- `ct.render()` tells the framework "this charm needs to be active"
- The charm's reactive flows start running
- Handlers become responsive
- Token refresh and other background operations work

### Use Case: Cross-Charm Token Refresh

A common pattern is having a main charm that uses an auth charm for token management:

```typescript
const pattern = ({ /* ... */ }) => {
  // Wish for the auth charm
  const googleAuth = wish("google-auth");

  // Get the refresh token stream from the auth charm
  const refreshTokenStream = googleAuth.refreshTokenStream;

  // Your own refresh button that triggers the auth charm's refresh
  const handleRefresh = handler(({ stream }, schema) => {
    stream.send();  // Triggers refresh in the auth charm
  });

  return (
    <div>
      {/* CRITICAL: Render auth charm (even hidden) to make it active */}
      <div style={{ display: "none" }}>
        {ct.render(googleAuth)}
      </div>

      {/* Your UI with a manual refresh option */}
      <button onClick={handleRefresh({ stream: refreshTokenStream })}>
        Refresh Token
      </button>

      {/* Rest of your UI */}
    </div>
  );
};
```

### Just Embedding UI vs ct.render

| Approach | Charm Executes? | Use When |
|----------|-----------------|----------|
| `wish()` alone | ❌ No | Just need to reference charm data |
| Embed charm's UI component | ⚠️ Maybe | Showing the charm's UI |
| `ct.render(charm)` | ✅ Yes | Need charm to be active (handlers, refresh, etc.) |

### Summary

**Rule of thumb:** If you need another charm's handlers to respond (like token refresh), use `ct.render()` to force it to execute - even in a hidden div.
