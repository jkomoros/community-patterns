# ifElse() Breaks Auth Writability - GmailSendClient Incompatibility

> **Superstition Status**: Verified and fixed
> **Discovered**: 2026-01-19
> **Topic**: reactivity, cell-types, auth, API-clients, ifElse
> **Confidence**: High (verified through debugging and working fix)

## The Problem

When using `createGoogleAuth()` and passing the `auth` to `GmailSendClient`, you get:

```
TypeError: this.auth.get is not a function
```

This happens even though TypeScript doesn't complain - the types appear compatible.

## Root Cause

**NOT** that `createGoogleAuth()` returns a `computed()` cell (initial wrong diagnosis).

**ACTUAL CAUSE**: Wrapping auth in `ifElse()` creates a derived value that loses the `.get()` method:

```typescript
// BAD - wrapping in ifElse() breaks writability
const effectiveAuth = ifElse(hasLinkedAuth, linkedAuth, auth);

// GmailSendClient needs .get() which the ifElse result doesn't have
const client = new GmailSendClient(effectiveAuth, { debugMode });  // FAILS!
```

`GmailSendClient` expects a `Writable<Auth>` with a `.get()` method:

```typescript
// gmail-send-client.ts
constructor(auth: Writable<Auth>, ...) {
  this.auth = auth;
}

// Later calls:
const token = this.auth.get()?.token;  // <-- needs .get()
```

## Solution

**Pass auth directly from createGoogleAuth() without wrapping:**

```typescript
// GOOD - pass auth directly, don't wrap in ifElse()
const { auth, fullUI: authUI, isReady } = createGoogleAuth({
  requiredScopes: ["gmail", "gmailModify"] as ScopeKey[],
});

// Works!
const client = new GmailSendClient(auth, { debugMode: DEBUG_NOTES });
```

This is how `gmail-sender.tsx` works - it passes auth directly to handlers without any ifElse() wrapping.

## Why This Is Non-Obvious

1. **Initial wrong diagnosis** - Easy to blame `createGoogleAuth()` returning computed()
2. **TypeScript doesn't catch it** - Type annotations mask the incompatibility
3. **Works at first glance** - The auth cell appears valid, has a token, UI shows "Connected"
4. **Error message is misleading** - "this.auth.get is not a function" doesn't point to ifElse() issue
5. **Seems like good code** - Using ifElse() for conditional auth selection looks reasonable

## Evidence That Direct Auth Works

`gmail-sender.tsx` successfully uses `GmailSendClient` because it passes `auth` directly:

```typescript
// gmail-sender.tsx - WORKS
const { auth, isReady } = createGoogleAuth({ requiredScopes: [...] });

// In handler:
const client = new GmailSendClient(auth, { debugMode });
await client.send(emailData);  // Works!
```

## The Fix Applied

In `email-notes.tsx`, removed the ifElse() auth selection and passed auth directly:

```typescript
// Before (broken):
const effectiveAuth = ifElse(hasLinkedAuth, linkedAuth, auth);
const client = new GmailSendClient(effectiveAuth, ...);

// After (working):
const { auth } = createGoogleAuth({ requiredScopes: [...] });
const client = new GmailSendClient(auth, ...);  // Works!
```

## Related Code References

- `packages/patterns/google/email-notes.tsx` - Pattern that discovered and fixed this
- `packages/patterns/google/gmail-sender.tsx` - Working example passing auth directly
- `packages/patterns/google/util/gmail-send-client.ts` - Client expecting Writable<Auth>

## Verification Status

- [x] Confirmed root cause through debugging
- [x] Verified gmail-sender.tsx works with direct auth
- [x] Fix applied and tested (labels auto-fetch, Done button works)
- [x] Pattern deployed and verified working

## Key Takeaway

**Don't wrap auth cells in ifElse() or other derived operations when passing to GmailSendClient.**

The auth from `createGoogleAuth()` works fine when passed directly - the problem is intermediate transformations that lose the `.get()` method.
