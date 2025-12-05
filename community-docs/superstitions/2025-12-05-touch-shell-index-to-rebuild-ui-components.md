# ⚠️ SUPERSTITION: Touch shell/src/index.ts to Rebuild UI Components

**⚠️ WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

Rebuilding the shell bundle when modifying UI components in labs

## Problem

When modifying UI components in `packages/ui/src/v2/components/` (like ct-autocomplete, ct-select, etc.), the shell dev server (`deno task dev-local` in packages/shell) does NOT automatically rebuild.

The shell dev server only watches `packages/shell/src/`, not `packages/ui/src/`.

### Symptom

You make changes to a UI component, deploy a new charm, but your changes don't appear - the old component behavior persists.

### What Didn't Work

```bash
# ❌ Just saving the UI component file
# The shell doesn't watch packages/ui/

# ❌ Running restart-local-dev.sh without changes
# May use cached bundle
```

### What Worked

```bash
# ✅ Touch a file in shell/src to trigger rebuild
touch /Users/alex/Code/labs/packages/shell/src/index.ts

# Wait for rebuild (watch the log)
tail -f /Users/alex/Code/labs/packages/shell/local-dev-shell.log

# Should see:
# 🔨 Building /Users/alex/Code/labs/packages/shell/src/index.ts...
# ✓ Built /Users/alex/Code/labs/packages/shell/dist/scripts/index.js
```

## Why This Might Work

The shell's esbuild config bundles all dependencies including packages/ui. When a watched file (shell/src/*) changes, esbuild rebuilds the entire bundle, pulling in the latest UI component changes.

## When to Use

- After modifying any file in `packages/ui/src/v2/components/`
- After modifying `packages/html/src/jsx.d.ts`
- When component changes aren't appearing despite redeploying charms

## Verification

Check that your changes are in the bundle:

```bash
# Look for a unique string from your changes
grep "your-unique-string" /Users/alex/Code/labs/packages/shell/dist/scripts/index.js
```

---

*Observed: 2025-12-05 while developing ct-autocomplete $value binding*
*Observer: Claude + jkomoros*
