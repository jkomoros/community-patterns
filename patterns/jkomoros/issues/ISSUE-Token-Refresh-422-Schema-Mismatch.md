# Token Refresh 422 Schema Mismatch Bug

## Status: RESOLVED

**Resolution Date:** December 2024
**Linear Issue:** CT-1112
**Labs PR:** #2252
**Fix:** Change route schema from `authCellId` to `refreshToken`

---

## Executive Summary

The `/api/integrations/google-oauth/refresh` endpoint returned **HTTP 422 Unprocessable Entity** because of a **schema/handler mismatch** introduced in PR #677 (March 2025). The OpenAPI route schema expected `{ authCellId }` but the handler read `{ refreshToken }`.

---

## Root Cause

### The Mismatch

| Component | Expected Field | Actual Field |
|-----------|---------------|--------------|
| Route Schema | `authCellId` | - |
| Handler | - | `refreshToken` |
| All Callers | - | `refreshToken` |

### Why 422?

Hono's OpenAPI middleware (`@hono/zod-openapi` with `stoker/openapi` defaultHook) validates requests against the Zod schema **before** the handler runs. When callers sent `{ refreshToken }`, the schema expected `{ authCellId }`, so validation failed.

---

## History

| Date | Commit | Schema | Handler |
|------|--------|--------|---------|
| Feb 2025 | `207159e04` | `authCellId` | `authCellId` (server-side cell write) |
| Mar 2025 | `6c5ecaf47` (PR #677) | `authCellId` (NOT UPDATED) | `refreshToken` (client-side write) |
| Dec 2024 | PR #2252 | `refreshToken` (FIXED) | `refreshToken` |

**The bug:** PR #677 changed the handler to use `refreshToken` but forgot to update the schema.

---

## Addressing the "Server-Side Write" Concern

The PR #677 author asked:
> "does it work? the API must have the auth cell id, otherwise the toolshed doesn't have a way to write the value back to a specific address"

### Answer: The Fix IS Correct

**The refresh endpoint was NEVER designed for server-side cell writes:**

| Endpoint | Purpose | Who Writes to Cell |
|----------|---------|-------------------|
| `/callback` | OAuth code exchange | **Server** via `persistTokens(authCellId)` |
| `/refresh` | Token refresh | **Client** via `auth.update()` |

### Evidence: All 9 Callers

| Caller | Sends | Writes Back |
|--------|-------|-------------|
| google-auth.tsx | `{ refreshToken }` | `auth.update(json.tokenInfo)` |
| gmail-importer.tsx | `{ refreshToken }` | `this.auth.update(authData)` |
| gcal.tsx | `{ refreshToken }` | `auth.update(refreshed)` |
| _gpeople.tsx | `{ refreshToken }` | `this.auth.update(authData)` |
| GmailClient | `{ refreshToken }` | `this.auth.update(authData)` |
| GmailSendClient | `{ refreshToken }` | `this.auth.update(...)` |
| CalendarWriteClient | `{ refreshToken }` | `this.auth.update(...)` |

**ALL callers send `refreshToken`. NONE send `authCellId`. ALL write back to cells themselves.**

### Background Charm Support

Background charms work fine with client-side writes:

1. **Direct refresh**: Pattern calls endpoint → gets tokens → `auth.update()`
2. **Cross-charm refresh**: Consumer calls `refreshStream.send({})` → auth charm's handler writes to its own cell
3. **Fire-and-forget**: Consumer triggers refresh, uses reactive gating to retry

The background charm service executes pattern handlers via `bgUpdater.send({})`. Patterns handle their own auth refresh logic internally.

---

## The Fix

**File:** `packages/toolshed/routes/integrations/google-oauth/google-oauth.routes.ts`

```diff
 schema: z
   .object({
-    authCellId: z
+    refreshToken: z
       .string()
       .describe(
-        "The authentication cell ID containing the refresh token",
+        "The refresh token to use for obtaining new access tokens",
       ),
   })
   .openapi({
     example: {
-      authCellId: '{"/" : {"link-v0.1" : {...}}}',
+      refreshToken: "1//0abc123...",
     },
   }),
```

---

## Verification

```bash
# Before fix: 422 validation error
curl -X POST http://localhost:8000/api/integrations/google-oauth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "1//0abc..."}'
# {"success":false,"error":{"issues":[{"code":"unrecognized_keys"...}]}}

# After fix: Success
curl -X POST http://localhost:8000/api/integrations/google-oauth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "1//0abc..."}'
# {"success":true,"message":"success","tokenInfo":{...}}
```

End-to-end tested with google-auth pattern and hotel-membership-gmail-agent.

---

## Key Files

- **Route Schema:** `labs/packages/toolshed/routes/integrations/google-oauth/google-oauth.routes.ts`
- **Handler:** `labs/packages/toolshed/routes/integrations/google-oauth/google-oauth.handlers.ts`
- **Validation Hook:** `labs/packages/toolshed/lib/create-app.ts` (uses `stoker/openapi` defaultHook)

---

## Lessons Learned

1. **Schema and handler must match** - OpenAPI validation happens before handler runs
2. **No tests caught this** - The refresh endpoint had zero test coverage
3. **All callers adapted** - When PR #677 changed the API, callers were updated but schema wasn't
4. **Separation of concerns** - `/callback` writes to cells, `/refresh` just exchanges tokens
