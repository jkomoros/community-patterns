# OAuth Error "Unexpected token '<'" Means Wrong Port

**Date:** 2025-12-08
**Status:** Superstition (single observation, needs verification)
**Symptom:** `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON` when authenticating

## The Problem

When clicking "Authenticate with Google" or any OAuth button, you see:

```
OAuth error: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

## Root Cause

**You're viewing the pattern on localhost:5173 instead of localhost:8000.**

When testing patterns with Playwright or in the browser, ALWAYS use localhost:8000. The frontend dev server (5173) doesn't have the API endpoints.

## WARNING: Port Numbers Matter!

| Port | Server | Purpose |
|------|--------|---------|
| **5173** | Frontend (Vite) | Serves the UI - returns HTML |
| **8000** | API (Toolshed) | Handles OAuth, API calls - returns JSON |

## Common Mistakes

```typescript
// ❌ WRONG - Frontend port, returns HTML
fetch("http://localhost:5173/api/integrations/google-oauth/start", ...)

// ✅ CORRECT - API port, returns JSON
fetch("http://localhost:8000/api/integrations/google-oauth/start", ...)
```

## How This Happens

1. **In patterns**: Using hardcoded wrong port
2. **In deployment**: Using `--api-url http://localhost:5173` instead of `--api-url http://localhost:8000`
3. **Environment misconfiguration**: `API_URL` env var pointing to wrong port

## Quick Fix

Check your API URL configuration:
- `env.apiUrl` should be `http://localhost:8000` (or production API URL)
- Deployment commands should use `--api-url http://localhost:8000`

## Debugging

If you see HTML in an API response, check:
1. What URL is being fetched (look in Network tab)
2. Is it hitting port 5173 or 8000?
3. Is `getRecipeEnvironment().apiUrl` correct?

## Related

- Deployment skill: Always use `--api-url http://localhost:8000`
- Testing skill: Navigate to `http://localhost:5173` for UI, but API calls go to 8000
