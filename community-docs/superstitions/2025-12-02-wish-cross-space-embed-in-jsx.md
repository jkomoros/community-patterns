---
topic: reactivity
discovered: 2025-12-02
confirmed_count: 1
last_confirmed: 2025-12-02
sessions: [investigate-favorites-bug-ct-1090]
related_labs_docs: none
status: superstition
stars: ⭐
temporary: true
linear_issue: CT-1090
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

# ⏰ TEMPORARY WORKAROUND - Cross-Space wish() Requires JSX Embedding

**This is a TEMPORARY workaround for [CT-1090](https://linear.app/common-tools/issue/CT-1090).**

Framework team is aware of the issue. This workaround should become unnecessary once the underlying charm lifecycle issue is fixed.

## Problem

When using `wish()` to access a favorited charm from a **different space**, the charm is found but its data is inaccessible:

```tsx
const wishResult = wish<GoogleAuthCharm>({ query: "#googleAuth" });

// This returns undefined cross-space, works same-space
const auth = derive(wishResult, (wr) => wr?.result?.auth);
```

**Debug output cross-space shows only `$UI`, no `result`:**
```json
{ "$UI": { "type": "vnode", "name": "ct-cell-link", "props": {}, "children": [] } }
```

**Same-space shows full data:**
```json
{ "result": { "auth": { "token": "...", "user": {...} } }, "$UI": {...} }
```

## Root Cause (from Ben)

The issue is about **charm lifecycle**, not favorites or cross-space linking:

- When two charms are in the **same space**, both are already running
- When you **wish cross-space**, the target charm isn't running
- Unless you trigger it to start, you only get a UI snapshot—no live data

## Solution That Seemed To Work

Embed the wishResult in the JSX tree to trigger the cross-space charm to start:

```tsx
// Before (doesn't work cross-space)
return {
  [UI]: (
    <div>
      {derive(wishResult, (wr) => wr?.result?.auth?.user?.email)}  // Empty!
    </div>
  ),
};

// After (works cross-space)
return {
  [UI]: (
    <div>
      {wishResult}  {/* <-- This triggers charm startup */}
      {derive(wishResult, (wr) => wr?.result?.auth?.user?.email)}  // Now works!
    </div>
  ),
};
```

The `{wishResult}` renders as a link to the charm (e.g., "Google Auth #gq7mge").

## Why This Feels Wrong

- You shouldn't need UI markup just to access data
- `derive`/`computed` accessing wishResult doesn't trigger startup—only JSX inclusion works
- Behavior difference between same-space and cross-space is non-obvious
- This is a footgun for pattern developers

## Context

- Tested with google-auth.tsx (space-a) and wish-auth-test.tsx (space-b)
- Clean test with fresh sqlite and spaces confirmed this is not "interfering data"
- Framework developer Ben confirmed root cause and provided workaround

## Related Documentation

- **Official docs:** None found for cross-space wish behavior
- **Linear issue:** [CT-1090](https://linear.app/common-tools/issue/CT-1090)
- **Issue file:** `patterns/jkomoros/issues/ISSUE-cross-space-wish-data-access.md`

## Next Steps

- [x] Framework team notified (CT-1090)
- [ ] Awaiting framework fix for automatic cross-space charm startup
- [ ] Remove this workaround once CT-1090 is resolved

## Notes

- Same-space wish works without this workaround
- The embedded `{wishResult}` is visible in UI as a charm link
- If you don't want visible UI, you may need to hide it with CSS (untested)

---

**Remember:** This is a TEMPORARY workaround. Check CT-1090 status before applying.
