# Deployment - Folk Wisdom

> **SUPERSEDED (2025-12-11):** The setsrc bug described below was **fixed on Nov 21, 2025** (commit cc0aaa551). The `ct charm setsrc` command now works correctly. Use `setsrc` for updating existing charms—it's faster than creating new ones with `charm new`.
>
> **Current best practices:** See `docs/common/PATTERN_DEV_DEPLOY.md` in labs repo.

---

## Historical Record (Pre-Nov 21, 2025)

*The following describes behavior that existed before the bug fix. Kept for historical reference.*

---

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/` (CT CLI documentation)

---

## ~~Avoid `charm setsrc` - Use `charm new` Instead (Framework Bug)~~ FIXED

⭐⭐⭐ (Verified via testing - confirmed silently fails)

When using `ct charm setsrc` to update an existing charm with new pattern source, the command **silently fails** due to a known framework bug. This makes it appear to succeed while the charm still shows old code.

### Symptoms

- No errors when running `charm setsrc`
- Pattern appears unchanged after setsrc
- New features/fixes don't appear in the UI
- Frustrating "it should work" debugging cycles

### Solution

**Instead of updating with `charm setsrc`, deploy a fresh instance with `charm new`:**

```bash
# ❌ Don't use setsrc (silently fails due to framework bug)
deno task ct charm setsrc \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  --charm CHARM-ID \
  ../community-patterns/patterns/user/pattern.tsx

# ✅ Instead: Deploy a new instance
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  ../community-patterns/patterns/user/pattern.tsx
```

**This gives you a new charm ID.** Navigate to the new charm and test there.

### Trade-offs

**Advantages:**
- Actually works (charm shows new code)
- Clean slate for each deployment
- Can keep old charm for comparison

**Disadvantages:**
- New charm ID each time
- Need to update bookmarks/links
- Multiple charms accumulate

### Verification Test

Tested 2025-12-02 with minimal repro:
1. Deployed v1 pattern with `charm new` -> shows "v1" ✓
2. Modified pattern to v2, ran `charm setsrc` -> NO ERRORS but still shows "v1" ✗
3. Deployed v2 with `charm new` -> shows "v2" ✓

**Conclusion:** `charm setsrc` silently fails. Always use `charm new`.

**Related:** Check framework changelog for setsrc bug fix status

**Guestbook:**
- ✅ 2025-11-22 - Multiple sessions hit setsrc failures (jkomoros)
- ✅ 2025-12-02 - Verified via minimal repro - setsrc silently fails (jkomoros)

---
