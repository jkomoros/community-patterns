# Cross-Space wish() Data Access Bug

## Summary

When using `wish("#tag")` to find a favorited charm, the charm is found correctly but its data cannot be accessed when the consuming pattern is in a **different space** than the wished charm.

## Reproduction Steps

1. Deploy `google-auth.tsx` to space "test"
2. Authenticate with Google (charm shows "Status: Authenticated", email, name, etc.)
3. Favorite the charm (click ⭐)
4. Verify favorites shows exactly 1 charm with `#googleAuth` tag
5. Deploy `wish-auth-test.tsx` to the **same** space "test"
   - **Result: ✅ Works** - Shows "Auth Found!", email, name, has token
6. Deploy `wish-auth-test.tsx` to a **different** space "different-space"
   - **Result: ❌ Fails** - Shows "No Auth Found" even though charm was found

## Technical Details

### Same-space behavior (working)

Console logs show:
```
wishResult {error: "No favorite found..."}  // First reactive pass
wishResult {result: {auth: {token: "...", user: {email: "jkomoros@gmail.com", ...}}}}  // Success!
```

Debug JSON shows full data:
```json
{
  "result": {
    "auth": {
      "token": "ya29...",
      "user": { "email": "jkomoros@gmail.com", "name": "Alex Komoroske" }
    }
  },
  "$UI": { "type": "vnode", "name": "ct-cell-link", ... }
}
```

### Cross-space behavior (broken)

Console logs show:
```
wishResult {error: "No favorite found..."}  // First reactive pass
wishResult {error: "No favorite found..."}  // Second pass still error
wishResult {result: ...}                    // Eventually finds something
```

But debug JSON only shows:
```json
{
  "$UI": { "type": "vnode", "name": "ct-cell-link", "props": {}, "children": [] }
}
```

The `result` property exists (console shows it) but:
- It doesn't serialize to JSON (opaque Cell reference?)
- Accessing `result.auth` returns undefined/empty
- The pattern code `derive(wishResult, wr => wr?.result?.auth)` gets nothing

### Pattern code that fails cross-space

```tsx
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });
const auth = derive(wishResult, (wr) => wr?.result?.auth);  // Works same-space, empty cross-space
const userEmail = derive(auth, (a) => a?.user?.email || "");  // Empty cross-space
```

## Environment

- Local dev (localhost:8000)
- Tested: 2025-12-02
- Patterns: `google-auth.tsx`, `WIP/wish-auth-test.tsx`
- Charm IDs:
  - google-auth: `baedreihazgwznynyxsclifr2h3fezrvwpsqipzridmdambxqgszuym3vsq` (space: test)
  - wish-auth-test same-space: `baedreid2qm7w63lrm3az5nfe335vscnck4ioieuv7ptlukmcsjvfc6jvwi` (space: test) - WORKS
  - wish-auth-test cross-space: `baedreif7tjq426nan3cso2xxa4lttfbg7wahagzejglcwtku732lfwhocu` (space: different-space) - FAILS

## Expected Behavior

`wish("#tag")` should return fully accessible charm data regardless of which space the consuming pattern is deployed to. The whole point of favorites + wish is to share charms across spaces.

## Actual Behavior

- Same-space: Data fully accessible ✅
- Cross-space: Charm found but data is opaque/inaccessible ❌

## Impact

This blocks the "favorite once, use everywhere" workflow for auth sharing. Patterns like `gmail-importer`, `substack-summarizer`, `prompt-injection-tracker` cannot use wished auth from a different space.

## Workaround

Deploy all patterns that need shared auth to the same space as the auth charm. Not ideal but functional.

## Relationship to CT-1085

**CT-1085** was "Favorites don't persist across page navigations" - that bug IS FIXED:
- Favorites now persist ✅
- Same-space wish works fully ✅

**This new bug** is different:
- Favorites persist ✅
- Charm is found cross-space ✅
- But `result` data is inaccessible cross-space ❌

The workarounds in `hotel-membership-extractor.tsx`, `prompt-injection-tracker.tsx`, and `gmail-importer.tsx` that reference CT-1085 can be partially removed (same-space now works), but cross-space access still needs this new bug fixed.

## Clean Test Reproduction (2025-12-02)

In response to framework developer feedback that the bug couldn't be reproduced and might be caused by "interfering data in favorites", performed a completely clean test:

1. **Cleared all data**: Deleted all spaces and sqlite database
2. **Fresh deployment**: Deployed google-auth.tsx to fresh space "space-a"
3. **New authentication**: Completed full OAuth flow, authenticated as jkomoros@gmail.com
4. **Favorited**: Single favorite, no other data
5. **Same-space test**: Deployed wish-auth-test.tsx to space-a
   - **Result: ✅ Works** - Full auth data accessible
6. **Cross-space test**: Deployed wish-auth-test.tsx to space-b
   - **Result: ❌ Fails** - Only `$UI` visible, no `result` data

### Clean Test Charm IDs (2025-12-02)

- google-auth (space-a): `baedreiekl6ppdjgmrfxbd3iobbqh6nj2vvznft42vsajbnjcxwzigq7mge`
- wish-auth-test same-space (space-a): `baedreibazwea7dwuvbcdr5r7klqrzgyruuku2xjeqtcksntv7y5frpg6we` - ✅ WORKS
- wish-auth-test cross-space (space-b): `baedreidu4yeck3hplpyqifbcccbezv7fe5ktil2pvwqpmq2esrrudnmjri` - ❌ FAILS

### Clean Test Debug Output Comparison

**Same-space (space-a → space-a):**
```json
{
  "result": {
    "auth": {
      "token": "ya29...",
      "user": { "email": "jkomoros@gmail.com", "name": "Alex Komoroske" }
    }
  },
  "$UI": { "type": "vnode", "name": "ct-cell-link", "props": {...}, "children": [...] }
}
```

**Cross-space (space-a → space-b):**
```json
{
  "$UI": { "type": "vnode", "name": "ct-cell-link", "props": {}, "children": [] }
}
```

**Conclusion**: Bug is NOT caused by interfering data. It's a genuine cross-space data access issue reproducible with a completely clean setup.

## Notes

- The charm IS found cross-space (has `$UI` for linking)
- Only the `result` data is inaccessible cross-space
- This may be by design (spaces are isolated?) or a bug in how Cell references resolve
