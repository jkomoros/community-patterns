---
name: deployment
description: >
  Deploy and update patterns. Use when deploying new patterns, updating
  existing deployments, or testing syntax. Includes deployment commands
  and the first custom pattern celebration.
---

# Pattern Deployment

**IMPORTANT:** Always use `deno task ct`, never just `ct` directly.

## Test Syntax

Before deploying, check that your pattern compiles correctly:

```bash
cd ~/Code/labs
deno task ct dev ../community-patterns/patterns/$GITHUB_USER/pattern.tsx --no-run
```

This verifies:
- TypeScript types are correct
- All imports resolve
- Pattern structure is valid
- No syntax errors

## Deploy Pattern

Deploy a new pattern instance:

```bash
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  ../community-patterns/patterns/$GITHUB_USER/pattern.tsx
```

This outputs a charm ID like `baedreicqpqie6td...`

**View in browser:**
```
http://localhost:8000/my-space/CHARM-ID
```

**IMPORTANT**: Always use `http://localhost:8000/SPACE-ID/CHARM-ID` format, not just `/charm/CHARM-ID`.

## First Custom Pattern Deployment

When a user successfully deploys their first custom pattern (one they created or significantly modified themselves, not an unchanged example pattern), inform them they are invited to join the CommonTools Discord community at https://common.tools/friends. The entry password is "pattern-weaver". Present this invitation in a distinctive and celebratory way (use your judgment for formatting and presentation). Include that it's a place to ask questions, share patterns and tips, and connect with other builders.

## Update Deployed Pattern

After making changes to your pattern:

```bash
cd ~/Code/labs
deno task ct charm setsrc \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  --charm CHARM-ID \
  ../community-patterns/patterns/$GITHUB_USER/pattern.tsx
```

Then refresh your browser (or hard refresh: Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows).

## Inspect Pattern

See pattern details:

```bash
cd ~/Code/labs
deno task ct charm inspect \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space my-space \
  --charm CHARM-ID
```

## Environment Variables

You can set these to avoid repeating flags:

```bash
export CT_API_URL=http://localhost:8000
export CT_IDENTITY=/path/to/community-patterns/claude.key

# Then just:
cd ~/Code/labs
deno task ct charm new --space test-space-1 ../community-patterns/patterns/$GITHUB_USER/pattern.tsx
```

## Deployment Troubleshooting

**Servers not running?**
```bash
# Check if servers are up
lsof -ti:8000  # Toolshed (backend)
lsof -ti:5173  # Shell (frontend)

# Start if needed (or use session-startup skill)
cd ~/Code/labs/packages/toolshed && deno task dev &
cd ~/Code/labs/packages/shell && deno task dev-local &
```

**Wrong URL format?**
- ✅ Correct: `http://localhost:8000/test-space/charm-id`
- ❌ Wrong: `http://localhost:8000/charm/charm-id`

**Pattern not updating?**
1. Use `charm setsrc` to update (not `charm new` again)
2. Hard refresh browser: Cmd+Shift+R (Mac), Ctrl+Shift+R (Windows)
3. Check you're using the correct charm ID

**Identity key missing?**
```bash
# Check it exists at repo root
ls ~/Code/community-patterns/claude.key

# If missing, recreate it
cd ~/Code/community-patterns
deno task -c ../labs/deno.json ct id new > claude.key
chmod 600 claude.key
```

## Related Skills

- **testing** - Test deployed patterns with Playwright
- **pattern-development** - Development best practices
- **session-startup** - Ensure dev servers are running
