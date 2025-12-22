# Local Library Pattern

> **UPDATE (2025-12-22):** This limitation has been fixed! See [CT-1134](https://linear.app/common-tools/issue/CT-1134) and the new `--root` flag below. The workaround documented here is no longer necessary for new patterns.

This directory contains **read-only copies** of reusable patterns from the `labs` repository.

**IMPORTANT**: Files in this directory should NEVER be modified. They are reference files from upstream. For custom utilities, use the `../utils/` directory instead.

## The Modern Approach: `--root` Flag

As of 2025-12-22, the `ct` CLI supports a `--root` flag that allows patterns to import from parent directories:

```bash
# Deploy a pattern that imports from parent directories
./scripts/ct charm new --root ./patterns ./patterns/wip/my-pattern.tsx
```

This sets the filesystem root to `./patterns`, allowing `my-pattern.tsx` to import from `../shared/utils.ts` or any file within the `./patterns` directory.

**Security:** Imports are constrained within the root - they cannot escape to parent directories outside the specified root.

### Migration from lib/ Workaround

If you have existing patterns using local `lib/` copies:

1. Move shared utilities to a common location (e.g., `patterns/shared/`)
2. Update imports to use relative paths (e.g., `../shared/note.tsx`)
3. Deploy with `--root` pointing to the common ancestor directory

---

## Legacy: Why This Directory Exists (Historical Context)

The sections below document the original workaround. You can continue using this pattern if preferred, but the `--root` flag is the recommended approach for new patterns.

### The Original Problem

**TL;DR:** The `ct` tool's module resolver previously couldn't resolve imports that escape the directory containing your main file (e.g., `../../lib/`).

When you run `ct charm new demo-setup.tsx`, the tool sets its "file system root"
(`fsRoot`) to the directory containing `demo-setup.tsx`. It then tries to
resolve all imports relative to this root.

When resolving relative imports like `../../lib/note.tsx`:

1. TypeScript's resolver joins the paths: `dirname("/demo-setup.tsx")` +
   `"../../lib/note.tsx"`
2. This resolves to `/lib/note.tsx` (relative to fsRoot)
3. The tool looks for: `fsRoot + /lib/note.tsx` =
   `/Users/alex/Code/recipes/recipes/alex/WIP/lib/note.tsx` ✅

But if we tried to use a shared `../../recipes/lib/`:

1. The path would resolve to `/recipes/lib/note.tsx`
2. But this escapes the fsRoot boundary
3. The tool can't find it ❌

### The Fix (Now Implemented!)

The fix was implemented in [PR #2330](https://github.com/commontoolsinc/labs/pull/2330) via the `--root` flag:

```bash
ct charm new --root ./patterns ./patterns/wip/main.tsx
```

This sets `fsRoot` to the specified root directory instead of the entry file's directory, allowing imports to parent directories within that root.

### The Legacy Workaround

Before the `--root` flag existed, we used this pattern:

- **Each working directory has its own `lib/`** with copies of labs patterns
- **Imports use `./lib/`** which stays within the fsRoot boundary
- **Direct copies** (not symlinks) because symlinks cause issues with nested
  relative imports

This is not ideal (duplicated files), but it: ✅ Works with current ct tool ✅
Makes dependencies explicit per workspace ✅ Easy to migrate later when ct tool
is fixed

### Why Copies Instead of Symlinks?

We initially tried symlinks, but they don't work because:

- When a symlinked file has its own relative imports (like `charm-creator.tsx`
  importing `./person.tsx`)
- Those imports resolve relative to the original file location in labs, not the
  symlink location
- This causes "file not found" errors

---

## Available Patterns

This directory contains copies of the following labs patterns:

- `backlinks-index.tsx` - Backlink tracking system
- `counter.tsx` - Simple counter pattern
- `counter-handlers.ts` - Counter helper functions
- `note.tsx` - Simple note-taking with markdown

## Custom Utilities

For custom utilities (not from labs), use the `../utils/` directory:

- `../utils/diff-utils.ts` - Word-level diff computation for LLM extraction preview

## Maintenance

To update these patterns, copy from `/Users/alex/Code/labs/packages/patterns/`
as needed.
