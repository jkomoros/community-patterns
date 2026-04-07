# ct-google-oauth Component Displays OAuth Tokens in HTML

**Related to**: QA-BUGS-google-auth-1219.md (Bug #2)
**Severity**: High (Security Concern)
**Component**: `ct-google-oauth` web component (framework)
**Location**: `packages/ui/src/v2/components/ct-google-oauth/ct-google-oauth.ts`

---

## Summary

After completing OAuth flow, the `ct-google-oauth` component renders a debug block that displays the complete `authResult` object as JSON, including:
- OAuth access token (in plain text)
- OAuth refresh token
- Token expiry
- Full user info

This is a **security concern** as tokens are exposed in rendered HTML where they could be:
- Visible to anyone viewing the screen
- Captured by browser extensions
- Logged by debugging tools
- Exposed in screenshots

---

## Reproduction Steps

1. Open a pattern using `<ct-google-oauth>` (e.g., google-auth.tsx)
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Observe the "Authentication Result" section showing raw JSON

---

## Expected Behavior

No debug output visible to users. Auth tokens should never be rendered in the DOM.

---

## Actual Behavior

Large JSON blob displayed including:
```json
{
  "token": "ya29.a0ARW5m...",
  "refreshToken": "1//0gfQ...",
  "expiresAt": 1734567890,
  "user": { "email": "user@example.com", ... }
}
```

---

## Workaround (Pattern-Level)

Navigate away and back - the debug output disappears on second render.

No permanent pattern-level fix exists since the debug block is in the framework component.

---

## Root Cause

In `ct-google-oauth.ts` (approximately lines 189-196):

```typescript
${this.authResult
  ? html`
    <div class="auth-result">
      <h3>Authentication Result</h3>
      <pre>${JSON.stringify(this.authResult, null, 2)}</pre>
    </div>
  `
  : ""}
```

The component renders `authResult` for debugging purposes but this block should either:
1. Be removed entirely
2. Be gated behind a `debug` attribute
3. Redact sensitive fields (tokens)

---

## Recommended Fix

Delete the debug display block or make it conditional:

```typescript
// Option 1: Remove entirely
// Just delete lines 189-196

// Option 2: Gate behind debug attribute
${this.debug && this.authResult
  ? html`<div class="auth-result">...</div>`
  : ""}
```

---

## Impact

- **Users affected**: Any user completing OAuth in patterns using ct-google-oauth
- **Data exposed**: Access tokens, refresh tokens, user email/name
- **Transient**: Only visible immediately after OAuth, disappears on navigation

---

## Notes

Discovered during QA testing 2025-12-19. Filed as local issue per user preference.
