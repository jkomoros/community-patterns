# Manual Charm Linking

When `wish()` isn't working (e.g., favorites disabled), you can manually link charms via CLI.

## Use Case

The gmail-importer pattern needs auth from google-auth pattern. Normally this happens via `wish()`, but when that's unavailable, use manual linking.

## Steps

### 1. Deploy both charms

```bash
# Deploy google-auth (if not already deployed)
deno task ct charm new --identity ../labs/claude.key --api-url http://localhost:8000 --space YOUR-SPACE patterns/jkomoros/google-auth.tsx

# Deploy gmail-importer
deno task ct charm new --identity ../labs/claude.key --api-url http://localhost:8000 --space YOUR-SPACE patterns/jkomoros/gmail-importer.tsx
```

### 2. Authenticate with Google Auth charm

Navigate to the google-auth charm in browser and complete OAuth flow.

### 3. Link the charms

```bash
# Format: source/path target/path
deno task ct charm link \
  --identity ../labs/claude.key \
  --api-url http://localhost:8000 \
  --space YOUR-SPACE \
  GOOGLE_AUTH_CHARM_ID/auth \
  GMAIL_IMPORTER_CHARM_ID/linkedAuth
```

**Critical paths:**
- Source: `GOOGLE_AUTH_CHARM_ID/auth` - the auth result from google-auth
- Target: `GMAIL_IMPORTER_CHARM_ID/linkedAuth` - the linkedAuth input of gmail-importer

### 4. Verify the link

```bash
# Check that linkedAuth is populated
deno task ct charm inspect \
  --identity ../labs/claude.key \
  --api-url http://localhost:8000 \
  --space YOUR-SPACE \
  --charm GMAIL_IMPORTER_CHARM_ID
```

You should see `linkedAuth` in the Source (Inputs) with token, user info, etc.

### 5. Visualize connections

```bash
deno task ct charm map \
  --identity ../labs/claude.key \
  --api-url http://localhost:8000 \
  --space YOUR-SPACE
```

## Important Notes

1. **Path format**: Use forward slashes, e.g., `charmId/auth` not `charmId.auth`

2. **Link direction**: Source -> Target. The target charm "reads from" the source.

3. **The pattern must support linkedAuth**: The gmail-importer has:
   ```typescript
   linkedAuth?: Auth;
   ```
   This optional input is what receives the linked auth data.

4. **Check "Reading From" in inspect**: After linking, `ct charm inspect` shows:
   ```
   --- Reading From ---
     - sourceCharmId (Google Auth (email@example.com))
   ```

5. **NEVER use `charm setsrc`**: It doesn't work reliably. Always deploy fresh with `charm new`.

## Troubleshooting

### Link exists but auth not working in UI

- The pattern might be showing both the "Connect Google Account" UI AND using linkedAuth
- Check that the pattern's logic correctly uses linkedAuth when available
- The charm name should show the email if linkedAuth is working (e.g., "GMail Importer email@example.com")

### Settings not being read in handler

If pattern defaults aren't reaching the handler, ensure the handler's type definition includes all fields:

```typescript
const myHandler = handler<unknown, {
  settings: Writable<{
    // All fields must be listed here!
    field1: string;
    field2: boolean;
    newField: boolean;  // <-- Don't forget new fields!
  }>;
}>(...);
```

Missing fields in the handler's type definition can cause them to be unavailable when calling `.get()`.
