# Background Execution & OAuth Integration - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/packages/background-charm-service/README.md`

**Reference implementations:**
- `patterns/jkomoros/gmail-auth.tsx` - OAuth wrapper pattern
- `patterns/jkomoros/gmail-importer.tsx` - Full syncing pattern with bgUpdater

---

## Server-Side OAuth Token Management

⭐⭐ (2 confirmations)

**OAuth tokens must flow through the server, never fully exposed to browser JavaScript.**

The Common Tools framework uses a hybrid client-server architecture for OAuth where:
1. Browser initiates OAuth flow via `<ct-google-oauth>` component
2. Server generates OAuth URL with PKCE
3. User authenticates on provider's domain (e.g., Google)
4. Provider redirects to **server** callback endpoint
5. Server exchanges auth code for tokens **server-to-server**
6. Server stores tokens in charm cells (encrypted at rest)
7. Browser receives sanitized auth object (never raw tokens)

**Why server-side:**
- XSS vulnerabilities would expose tokens if stored in browser
- Browser extensions could steal tokens from local storage
- OAuth token exchange requires server-to-server communication
- Refresh tokens are especially sensitive (long-lived access)

**Token refresh flow:**

```typescript
// In your pattern's client class
private async refreshAuth() {
  const res = await fetch(
    new URL("/api/integrations/google-oauth/refresh", env.apiUrl),
    {
      method: "POST",
      body: JSON.stringify({ refreshToken: this.auth.get().refreshToken }),
    },
  );
  const json = await res.json();
  this.auth.update(json.tokenInfo);
}
```

The pattern sends the refresh token TO the server, which communicates with Google's OAuth servers. The browser never directly talks to OAuth endpoints.

**Related:** `~/Code/labs/packages/toolshed/routes/integrations/google-oauth/`

**Guestbook:**
- ✅ 2025-01-20 - gmail-auth and gmail-importer patterns (jkomoros)
- ✅ 2025-11-30 - Architecture research session (alex)

---

## Background Updater Pattern (bgUpdater)

⭐⭐ (2 confirmations)

**Export a `bgUpdater` handler to enable automatic background syncing when browser is closed.**

The same handler code runs in both contexts:
- **Browser:** When user clicks a button (on-demand)
- **Server:** When Background Charm Service schedules execution (~60s intervals)

**Pattern structure:**

```typescript
export default pattern<Input, Output>(
  ({ settings }) => {
    const data = cell<DataType[]>([]);
    const auth = wish<AuthCharm>("#myServiceAuth");

    // This handler runs in BOTH browser and background worker
    const syncData = handler<unknown, State>(
      async (_event, state) => {
        if (!state.auth.get().token) return;

        // Refresh token if expired (server API call)
        if (isExpired(state.auth.get())) {
          await refreshAuth(state.auth);
        }

        // Fetch from external API
        const newData = await fetchFromService(state.auth.get().token);

        // Update cells
        state.data.push(...newData);
      }
    );

    return {
      [UI]: <div>...</div>,
      data,
      // Enable background execution by exporting as bgUpdater
      bgUpdater: syncData({ data, auth, settings }),
      // Also allow manual trigger
      onClick: syncData({ data, auth, settings }),
    };
  }
);
```

**Registration happens automatically** when OAuth completes:

```typescript
// In server OAuth callback handler
await setBGCharm({
  space,
  charmId: integrationCharmId,
  integration: "google",
  runtime,
});
```

**Related:** `~/Code/labs/packages/background-charm-service/`

**Guestbook:**
- ✅ 2025-01-20 - gmail-importer pattern (jkomoros)
- ✅ 2025-11-30 - Architecture research session (alex)

---

## Background Charm Service Architecture

⭐⭐ (2 confirmations)

**The Background Charm Service provides per-space isolation for background execution.**

Architecture overview:
```
BackgroundCharmService
  └── SpaceManager (one per user space)
        └── WorkerController
              └── Deno Web Worker (isolated thread)
```

**Isolation model:**
- **Space isolation:** Each user space gets its own SpaceManager and Worker
- **Worker isolation:** Web Workers provide thread-level isolation
- **Session isolation:** Each worker has its own session with proper permissions
- **Error isolation:** Errors in one charm don't affect others

**Execution flow:**
1. Service discovers charms with `bgUpdater` from central registry
2. Creates SpaceManager for each unique space
3. SpaceManager schedules charm execution (~60s default)
4. Worker loads charm code and executes `bgUpdater` handler
5. Handler updates cells, which sync back to storage
6. SpaceManager reschedules for next execution

**Environment variables for running the service:**
```bash
API_URL=http://localhost:8000
OPERATOR_PASS=your-passphrase
POLLING_INTERVAL_MS=100  # Optional
```

**Related:** `~/Code/labs/packages/background-charm-service/README.md`

**Guestbook:**
- ✅ 2025-01-20 - gmail-importer development (jkomoros)
- ✅ 2025-11-30 - Architecture research session (alex)

---

## Auth Sharing via wish() System

⭐⭐ (2 confirmations)

**Use `wish()` to share a single auth pattern across multiple consuming patterns.**

Create an auth pattern with a JSDoc tag:
```typescript
/** Google OAuth authentication. #googleAuth */
interface Output {
  auth: Auth;
}

export default pattern<Input, Output>(
  ({ auth }) => ({
    [NAME]: "Gmail Auth",
    [UI]: <ct-google-oauth $auth={auth} scopes={[...]} />,
    auth,
  })
);
```

Consuming patterns discover it via `wish()`:
```typescript
// In gmail-importer or any pattern needing Google auth
const wishedAuth = wish<GoogleAuthCharm>("#googleAuth");

const auth = derive(wishedAuth, (charm) =>
  charm?.auth || { token: "", /* defaults */ }
);
```

**User workflow:**
1. Create and authenticate with the auth pattern once
2. Click the star to favorite it
3. All patterns using `wish("#googleAuth")` automatically find it

**For multiple accounts:** Create separate auth patterns with different tags:
- `#googleAuth-personal`
- `#googleAuth-work`

**Related:** `~/Code/labs/packages/runner/src/builtins/wish.ts`

**Guestbook:**
- ✅ 2025-01-20 - gmail-auth-wish-refactor (jkomoros)
- ✅ 2025-11-30 - Architecture research session (alex)

---

## Known Limitations

### CRITICAL: Async Handler Completion Bug

**The Background Charm Service has a fundamental limitation with async handlers.**

From the README:
> FIXME(ja): all of this is built on a lie: If update method is async (uses fetch - like gmail) the handler will "finish" while work is still happening! Because many updaters are async we don't receive exceptions (mark them as failing) or know when to properly reschedule them.

**What this means:**
- When `bgUpdater` does `await fetch(...)`, the handler returns a Promise
- Background service marks task as "complete" immediately
- Actual fetch operations are still pending
- If errors occur, the service doesn't see them
- Error tracking and retry scheduling don't work for async handlers

**Impact:** Background sync may fail silently without retry or failure tracking.

**Workaround:** None currently. This is a framework-level issue.

### No Real-Time Push Updates

Background service polls at intervals (~60 seconds). There's no webhook/push notification integration. New data won't appear instantly.

### OAuth Scopes Fixed at Login

Scopes are set when the user authenticates. To request additional scopes (e.g., gmail.readonly → gmail.modify), the user must re-authenticate.

### Single Account Per Tag

The `wish()` system returns only the first matching favorite. Use different tags for multiple accounts of the same service.

---

## Building Your Own Syncing Pattern

**Checklist:**

1. **Create auth pattern** (optional but recommended)
   - Wrap `<ct-google-oauth>` or similar component
   - Add JSDoc tag for `wish()` discovery
   - Output the auth cell

2. **Create data pattern with bgUpdater**
   - Discover auth via `wish("#yourTag")`
   - Create handler that fetches from external API
   - Export handler as both `bgUpdater` and `onClick`

3. **Create server OAuth endpoints** (if new service)
   - `/login` - Generate OAuth URL
   - `/callback` - Exchange code for tokens
   - `/refresh` - Refresh expired tokens
   - Register charm for background execution in callback

4. **Handle token refresh in pattern**
   - Check if token is expired before API calls
   - Call server `/refresh` endpoint
   - Update auth cell with new token

**Key files to study:**
| File | Purpose |
|------|---------|
| `patterns/jkomoros/gmail-auth.tsx` | OAuth wrapper pattern |
| `patterns/jkomoros/gmail-importer.tsx` | Full syncing pattern |
| `labs/packages/toolshed/routes/integrations/google-oauth/` | Server OAuth |
| `labs/packages/background-charm-service/` | Background execution |
