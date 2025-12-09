---
topic: deployment
discovered: 2025-11-22
confirmed_count: 2
last_confirmed: 2025-12-02
sessions: [food-recipe-improvements, multiple-deployment-sessions, verification-testing]
related_labs_docs: ~/Code/labs/docs/common/ (CT CLI docs)
status: promoted
stars: ⭐⭐⭐
framework_issue: known framework bug with setsrc causing conflicts
promoted_to: folk_wisdom/deployment.md
---

# PROMOTED TO FOLK WISDOM

**This superstition has been promoted to folk wisdom.**

See: `community-docs/folk_wisdom/deployment.md`

---

**Original superstition content preserved below for reference.**

---

**This was a SUPERSTITION** - based on a single observation. It may be:
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

# Avoid `charm setsrc` - Use `charm new` Instead (Framework Bug)

## Problem

When using `ct charm setsrc` to update an existing charm with new pattern source, conflicts frequently occur due to a known framework bug. This makes updating patterns difficult and error-prone.

**Symptoms:**
- Conflict errors when running `charm setsrc`
- Error messages about version mismatches
- Updates failing to apply
- Pattern not reflecting changes after setsrc
- Cryptic error messages about state conflicts

**Error example:**
```
ConflictError: The application/json of of:baedrei... was expected to be ba4jca..., but now it is ba4jcan...
```

## Solution That Seemed To Work

**Instead of updating with `charm setsrc`, deploy a fresh instance with `charm new`:**

```bash
# ❌ Don't use setsrc (has conflicts due to framework bug)
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

**Advantages:**
- No conflicts
- Clean slate for each deployment
- Easier to compare old vs new versions
- Can keep old charm for reference

**Disadvantages:**
- New charm ID each time
- Need to update bookmarks/links
- Multiple charms accumulate (can delete old ones)

## Context

Encountered repeatedly during pattern development sessions. The framework has a known bug with `charm setsrc` that causes conflicts when updating charm source code.

**Framework status:** Bug acknowledged, needs to be fixed. Until then, `charm new` is the reliable workaround.

**When setsrc might still be okay:**
- Very simple patterns with no state
- If you're willing to debug conflicts
- If the framework bug has been fixed (check changelog)

**For now, the safe approach is to always use `charm new`.**

## Example Workflow

```bash
# 1. Make changes to pattern
vim patterns/user/my-pattern.tsx

# 2. Deploy new instance (don't update old one)
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space test-space \
  ../community-patterns/patterns/user/my-pattern.tsx

# Output: baedreiabc123...

# 3. Test new deployment
# Navigate to: http://localhost:8000/test-space/baedreiabc123...

# 4. If it works, use the new charm ID going forward
# 5. Old charm can be deleted or kept for comparison
```

## Related Documentation

- **Official docs:** ~/Code/labs/docs/common/ - CT CLI documentation (if it exists)
- **Deployment skill:** .claude/skills/deployment/SKILL.md
- **Related patterns:** All patterns experiencing setsrc conflicts

## Next Steps

- [ ] File/track framework issue for setsrc conflicts
- [ ] Ask framework authors for ETA on fix
- [ ] Update deployment skill to warn about setsrc
- [ ] Confirm `charm new` is intended workaround
- [ ] Document when/if setsrc becomes safe to use again

## Notes

**Common pattern observed:**
1. Developer makes changes to pattern
2. Runs `charm setsrc` to update
3. Gets conflict error
4. Tries again, still conflicts
5. Eventually gives up and uses `charm new`
6. `charm new` works immediately

**This happens repeatedly enough that `charm new` appears to be the reliable approach.**

**Best Practice Until Bug Fixed:**
- Always use `charm new` for deploying pattern changes
- Keep old charm IDs for comparison if needed
- Delete old charms periodically to avoid clutter
- Check framework changelog for setsrc bug fix before using setsrc again

**Questions for framework authors:**
- Is setsrc expected to work reliably?
- Is `charm new` the intended workaround?
- What causes the conflict errors?
- Is there a timeline for fixing this?

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
