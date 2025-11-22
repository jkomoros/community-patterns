# ct charm new Requires --api-url and --identity Flags

**Date**: 2025-11-22
**Author**: Claude (session with jkomoros)
**Confidence**: Medium
**Tags**: deployment, ct-charm, cli-flags

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
sessions: [jkomoros-2025-11-22-food-recipe]
related_labs_docs: none (checked deployment skill)
status: superstition
stars: ⭐
```

---

## Observation

When deploying a pattern with `ct charm new`, if you omit the `--api-url` and `--identity` flags, the charm deploys successfully and returns a charm ID, but when you navigate to it in the browser, it shows a template chooser (Chat List, Chatbot, Chatbot Outliner, Note) instead of loading the actual pattern.

## Context

Deploying the food-recipe pattern to the jkomoros space. The pattern compiles correctly with `ct dev --no-run` and has no syntax errors. Development servers (toolshed on :8000 and shell on :5173) were running.

## What Didn't Work

```bash
# Missing flags - pattern deployed but showed template chooser
cd ~/Code/labs
deno task ct charm new \
  --space jkomoros \
  ../community-patterns-4/patterns/jkomoros/food-recipe.tsx
```

**Result:**
- Command succeeded and returned a charm ID
- No error messages during deployment
- Browser URL loaded: `http://localhost:8000/jkomoros/CHARM-ID`
- Pattern showed template chooser UI instead of food-recipe UI
- Console showed transaction conflict warnings

## What Seemed to Work

```bash
# With explicit --api-url and --identity flags
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns-4/claude.key \
  --space jkomoros \
  ../community-patterns-4/patterns/jkomoros/food-recipe.tsx
```

**Result:**
- Command succeeded with same transaction warnings
- Pattern loaded correctly in browser
- All UI elements rendered properly
- Pattern functionality worked as expected

## Pattern Symptoms

If your deployed pattern shows:
- Template chooser buttons (📂 Chat List, 💬 Chatbot, etc.)
- "DefaultCharmList (1)" in the Pages section
- Generic chatbot UI instead of your pattern

**Check:** Did you include `--api-url` and `--identity` in your deployment command?

## Theory

The `--api-url` and `--identity` flags may be required to properly initialize the pattern runtime, even though the deployment itself succeeds without them. Without these flags, the system may fall back to a default template-based initialization.

**However:** The deployment skill documentation shows these flags as optional (with environment variables as alternatives). It's unclear why omitting them would cause this specific failure mode.

## Environment

- Framework: commontools (as of 2025-11-22)
- Dev servers: Running on localhost:8000 (toolshed) and localhost:5173 (shell)
- Pattern: Complex pattern with multiple UI sections (food-recipe)
- Space: User's personal space (jkomoros)

## Alternative Explanations

1. **Environment variables not set**: The flags may be "optional" only if `CT_API_URL` and `CT_IDENTITY` env vars are set
2. **Caching issue**: Previous failed deployments may have polluted the cache
3. **Transaction conflicts**: The warning messages about transaction conflicts may indicate a deeper issue
4. **Race condition**: Pattern initialization may have timing issues without explicit configuration

## Questions for Framework Authors

- Are `--api-url` and `--identity` actually required despite being marked optional?
- What is the expected behavior when these flags are omitted?
- Do environment variables need to be set for the "optional" flags to work?
- Why does deployment succeed but pattern initialization fail silently?

## Related Issues

None yet. This may be related to transaction conflict errors seen in console:
```
[ERROR] tx-commit-error Error committing transaction
ConflictError: The application/json of ... already exists
```

## Framework Version

Observed in commontools framework as of 2025-11-22.

## Notes

- The deployment skill documentation recommends using these flags but doesn't mark them as strictly required
- Environment variables (`CT_API_URL`, `CT_IDENTITY`) are mentioned as alternatives but weren't tested in this case
- The `--start` flag was tried but didn't resolve the issue
- This is a silent failure mode - the deployment appears successful but the pattern doesn't work

---

## Guestbook

If this worked (or didn't work) for you, please add an entry:

- ✅ 2025-11-22 - food-recipe deployment to jkomoros space (jkomoros-session)

---

## To Promote This Superstition

If you encounter this and adding the flags fixes it:

1. Update `confirmed_count: 2` and add your session to `sessions: []`
2. Promote to `folk_wisdom/deployment.md` with ⭐⭐
3. Consider filing issue about unclear flag requirements
4. Mark this file for removal
