---
topic: architecture
discovered: 2025-12-05
confirmed_count: 1
last_confirmed: 2025-12-05
sessions: [gmail-auth-401-investigation]
related_labs_docs: ~/Code/labs/docs/common/RUNTIME.md
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on investigation, not direct confirmation. Verify with labs team.

---

# bgUpdater: Background Processing Pattern for Sync Charms

## What is bgUpdater?

Patterns that need to run background sync operations (like fetching emails, calendar events, etc.) can export a `bgUpdater` handler. This handler gets picked up by the **Background Charm Service** and executed periodically on the server.

## How It Works

1. **Pattern exports bgUpdater:**
   ```typescript
   export default pattern<Input, Output>(({ auth, emails, settings }) => {
     // ... pattern logic ...

     return {
       [NAME]: "Gmail Importer",
       [UI]: /* ... */,
       emails,
       // This handler will be invoked periodically by the server
       bgUpdater: syncHandler({ emails, auth, settings }),
     };
   });
   ```

2. **Background Charm Service** (in `labs/packages/background-charm-service/`):
   - Runs as a separate Deno service
   - Monitors charms that expose `bgUpdater`
   - Periodically calls `updater.send({})` to trigger the handler
   - Runs in Deno workers on the server

3. **Server-side execution:**
   - The handler runs on the server, not in the browser
   - Has access to network APIs (fetch, etc.)
   - Can refresh OAuth tokens and persist them back to the cell

## Why This Matters for Auth

Token refresh must work even when the user isn't actively using the app. With bgUpdater:

1. Background service calls the sync handler
2. Handler uses `GmailClient` (or similar) to fetch data
3. If token is expired (401), `GmailClient.refreshAuth()` gets a new token
4. New token is written back to the auth cell: `this.auth.update(newToken)`
5. Next sync uses the fresh token

**CRITICAL:** For this to work, the auth cell MUST be writable. If you derived the auth cell, the `update()` call silently fails and token refresh is broken.

## Code Location

- **Background Charm Service:** `labs/packages/background-charm-service/`
- **Worker that invokes bgUpdater:** `labs/packages/background-charm-service/src/worker.ts` (lines 174-196)
- **Example pattern:** `patterns/jkomoros/gmail-importer.tsx` (line ~1409)

## Starting the Background Service Locally

```bash
cd ~/Code/labs/packages/background-charm-service
OPERATOR_PASS="implicit trust" API_URL="http://localhost:8000" deno task start
```

Note: This is only needed if you're:
- Working on the background charm service itself
- Testing background sync locally
- Default assumption: not needed for most development

## Related Patterns

- `gmail-importer.tsx` - Uses bgUpdater for periodic email sync
- `google-calendar-importer.tsx` - Similar pattern for calendar events

## When to Use bgUpdater

Use bgUpdater when your pattern needs:
- Periodic background sync (fetch new data without user interaction)
- Long-running operations that shouldn't block the UI
- Server-side execution for API calls

**Don't use for:**
- User-triggered actions (use handlers instead)
- Real-time updates (consider websockets/polling in UI)
- One-time operations

---

**Remember:** This is based on code investigation. Verify with the labs team for authoritative guidance.
