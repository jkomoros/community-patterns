# ct charm setsrc Often Fails Due to Caching

**Date**: 2025-11-22
**Author**: jkomoros
**Confidence**: Medium
**Tags**: deployment, ct-charm, caching, setsrc

---

## ⚠️ SUPERSTITION WARNING ⚠️

**This is an unverified observation from a single session!**

- ✗ NOT approved by framework authors
- ✗ NOT verified across multiple contexts
- ✗ May be incomplete, wrong, or context-specific
- ⚠️ Treat with extreme skepticism
- ⚠️ Verify against official docs first

**Use at your own risk!**

---

## Metadata

```yaml
topic: deployment
discovered: 2025-11-22
confirmed_count: 1
last_confirmed: 2025-11-22
sessions: [jkomoros-2025-11-22-food-recipe-phase3]
related_labs_docs: none (checked deployment skill)
status: superstition
stars: ⭐
```

---

## Observation

When using `ct charm setsrc` to update an already-deployed pattern, the browser often loads cached compiled pattern code instead of the new code. This manifests as:
- Pattern continues to exhibit old bugs that were fixed in the source code
- Console shows old error messages that should no longer exist
- New code changes don't appear in browser behavior
- Hard refreshes don't help

The issue persists even after:
- Redeploying with `setsrc` multiple times
- Hard refreshing the browser (Cmd+Shift+R / Ctrl+Shift+R)
- Reloading the page with `page.reload({ waitUntil: 'networkidle' })`

## Context

During acceptance testing of the food-recipe pattern Phase 3 features, code changes were deployed using `setsrc`:

```bash
cd ~/Code/labs
deno task ct charm setsrc \
  --api-url http://localhost:8000 \
  --identity ../community-patterns-4/claude.key \
  --space jkomoros \
  --charm baedreihkdiuqy6k453sjseqgmcrz3rbabcunkapwa7ddktm26zlwsvo3ai \
  ../community-patterns-4/patterns/jkomoros/food-recipe.tsx
```

The command completed successfully with transaction warnings (normal), but the browser continued to:
- Show the old `TypeError: Cannot read properties of undefined (reading 'id')` error
- Execute old buggy code even though the source had null safety checks added
- Load what appeared to be stale compiled JavaScript

## What Didn't Work

**Trying to update with setsrc:**
```bash
# Command succeeded but browser loaded old code
deno task ct charm setsrc \
  --api-url http://localhost:8000 \
  --identity ../community-patterns-4/claude.key \
  --space jkomoros \
  --charm CHARM_ID \
  ../community-patterns-4/patterns/jkomoros/food-recipe.tsx
```

**Result:**
- Command completed successfully
- Transaction conflict warnings (normal)
- Browser showed old code behavior
- Console errors showed bugs that were fixed in source
- Hard refresh didn't help
- Multiple setsrc attempts didn't help

## What Worked

**Deploy a fresh charm with `ct charm new`:**
```bash
# Deploy fresh charm instead of updating existing one
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns-4/claude.key \
  --space jkomoros \
  ../community-patterns-4/patterns/jkomoros/food-recipe.tsx
```

**Result:**
- Fresh charm deployed with new ID
- Browser loaded new code correctly
- Bug fixes were active
- No more stale code errors

## Pattern Symptoms

If you're using `setsrc` and experiencing:
- Old bugs persisting after fixes
- Console errors showing code that no longer exists in source
- Pattern behavior not matching recent code changes
- Hard refreshes not helping

**Try:** Deploy a fresh charm with `ct charm new` instead

## Theory

Possible causes:
1. **Browser caching**: Browser may cache compiled pattern JavaScript by charm ID
2. **Server-side compilation cache**: Toolshed may cache compiled patterns and not recompile on setsrc
3. **Transaction conflicts**: The transaction warnings during setsrc may indicate incomplete updates
4. **Service worker caching**: If service workers are involved, they may cache old code

The `setsrc` command may update the pattern source in storage but not trigger recompilation or cache invalidation, causing browsers to continue loading old compiled code.

## Workaround

**Use `ct charm new` instead of `ct charm setsrc` for development iterations:**

```bash
# Instead of updating existing charm
deno task ct charm setsrc --space myspace --charm CHARM_ID pattern.tsx

# Deploy fresh charm each time
deno task ct charm new --space myspace pattern.tsx
```

**Pros:**
- Guaranteed fresh code
- No cache issues
- Fast and reliable

**Cons:**
- New charm ID each time (need to navigate to new URL)
- Pattern state is lost (need to recreate test data)
- More charms accumulate in space

## Environment

- Framework: commontools (as of 2025-11-22)
- Dev servers: Running on localhost:8000 (toolshed) and localhost:5173 (shell)
- Pattern: Complex pattern with multiple derives and LLM features (food-recipe)
- Space: User's personal space (jkomoros)
- Browser: Chrome/Chromium via Playwright

## Alternative Explanations

1. **Proper cache headers not set**: Server may not send proper cache-control headers for recompiled patterns
2. **Browser-specific issue**: May only affect certain browsers
3. **Pattern complexity**: May only affect complex patterns with many derives
4. **Development mode quirk**: May not happen in production deployments
5. **User error**: May have been deploying wrong file or wrong charm ID

## Questions for Framework Authors

- Is `setsrc` expected to trigger recompilation and cache invalidation?
- Are there known caching issues with pattern updates?
- Should developers use `charm new` for iteration or is `setsrc` preferred?
- Is there a way to force cache clearing when using `setsrc`?

## Related Issues

None yet. This may be related to:
- Browser caching strategies
- Compilation pipeline in toolshed
- Pattern loading mechanism in shell

## Framework Version

Observed in commontools framework as of 2025-11-22.

## Notes

- The deployment skill documentation doesn't mention caching issues with `setsrc`
- This is a development workflow issue, not a runtime bug in patterns
- `charm new` is a reliable alternative but has ergonomic downsides
- May want to test if restarting dev servers before `setsrc` helps

---

## Guestbook

If this worked (or didn't work) for you, please add an entry:

- ✅ 2025-11-22 - food-recipe Phase 3 testing: setsrc failed, charm new worked (jkomoros-session)

---

## To Promote This Superstition

If you encounter this and using `charm new` fixes it:

1. Update `confirmed_count: 2` and add your session to `sessions: []`
2. Add details about your specific pattern and environment
3. If confirmed 3+ times, consider promoting to `folk_wisdom/deployment.md` with ⭐⭐
4. If framework authors confirm, update to official docs and mark this for removal
