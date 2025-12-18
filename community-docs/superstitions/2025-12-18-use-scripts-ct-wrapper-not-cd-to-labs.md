# ⚠️ SUPERSTITION: Use `./scripts/ct` Wrapper, Not `cd ~/Code/labs && deno task ct`

**⚠️ WARNING: This is a SUPERSTITION - folk knowledge from one documented incident.**

## Topic

Running ct CLI commands from community-patterns

## Problem

When deploying or testing patterns, agents sometimes use the "cd to labs" approach:

```bash
# ❌ WRONG - Causes permission prompts and path confusion
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space test-space \
  ../community-patterns/patterns/user/pattern.tsx
```

This causes:
1. **Permission prompts** - The command doesn't match `Bash(./scripts/ct:*)` rule
2. **Path confusion** - Agents must use `../community-patterns/` paths everywhere
3. **Inconsistency** - Different docs taught different approaches

## Solution That Works

**Always use `./scripts/ct` wrapper from community-patterns:**

```bash
# ✅ CORRECT - Uses wrapper, no permission prompts
./scripts/ct charm new \
  --api-url http://localhost:8000 \
  --identity ./claude.key \
  --space test-space \
  patterns/user/pattern.tsx
```

## Why the Wrapper Works

The wrapper script (`scripts/ct`) uses a clever mechanism:

1. Script CDs to labs internally: `cd "$LABS_DIR"`
2. Runs `deno task ct` from labs
3. BUT deno task uses `$INIT_CWD` to restore original working directory
4. Pattern paths resolve relative to community-patterns (where you called from)

```bash
# From labs/deno.json:
"ct": "ROOT=$(pwd) && cd $INIT_CWD && deno run ... \"$ROOT/packages/cli/mod.ts\""
#                      ^^^^^^^^^^^
#                      This restores original CWD for path resolution!
```

## Key Benefits

| Aspect | `./scripts/ct` | `cd ~/Code/labs && deno task ct` |
|--------|----------------|----------------------------------|
| Permission prompts | None | Always prompts |
| Pattern paths | `patterns/user/foo.tsx` | `../community-patterns/patterns/user/foo.tsx` |
| Identity path | `./claude.key` | `../community-patterns/claude.key` |
| Working directory | Stays in community-patterns | Must track two directories |

## Context

- **Discovered:** 2025-12-18
- **Root cause:** Conflicting documentation - pattern-dev skill said "cd to labs", deployment skill said "use ./scripts/ct"
- **Fix:** Updated pattern-dev skill and DEVELOPMENT.md to consistently use `./scripts/ct`

## Related

- `scripts/ct` - The wrapper script that handles directory changes
- `deployment` skill - Uses correct `./scripts/ct` approach
- `pattern-dev` skill - Now updated to use `./scripts/ct`
- Commit b44bb70 - Added the wrapper script originally

## Metadata

```yaml
topic: deployment, ct, permissions, tooling
discovered: 2025-12-18
confirmed_count: 1
last_confirmed: 2025-12-18
sessions: [fix-ct-script-docs-consistency]
related_functions: scripts/ct, deno task ct
status: superstition
stars: ⭐⭐
```

## Guestbook

- ⭐⭐ 2025-12-18 - Investigated why agents kept getting permission prompts when deploying patterns. Found conflicting documentation: pattern-dev skill taught "cd to labs" approach while deployment skill taught "./scripts/ct". The wrapper script uses deno's `$INIT_CWD` mechanism to preserve path resolution. Updated all docs to consistently use `./scripts/ct`. (fix-ct-script-docs-consistency)

---

**Remember: This is just one observation. Test thoroughly in your own context!**

**TIP:** If you see permission prompts when running ct commands, make sure you're using `./scripts/ct` not `cd ~/Code/labs && deno task ct`!
