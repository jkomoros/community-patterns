# Local Library Pattern

This directory contains copies of reusable patterns from the `labs` repository.

## Why This Weird Pattern?

**TL;DR:** The `ct` tool's module resolver has a limitation - it can't resolve
imports that escape the directory containing your main file (e.g.,
`../../lib/`).

### The Problem

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

### The Fix (When Available)

The proper fix would be in
`/Users/alex/Code/labs/packages/js-runtime/program.ts`:

```typescript
constructor(mainPath: string) {
  // Instead of this:
  this.fsRoot = dirname(mainPath);

  // Should be something like:
  this.fsRoot = findRepoRoot(mainPath) || findCommonAncestor(allImports);
}
```

This would allow imports to traverse up to the repository root or a sensible
common ancestor.

### The Workaround

Until the ct tool is fixed, we use this pattern:

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

## Available Patterns

This directory contains copies of the following labs patterns:

- `note.tsx` - Simple note-taking with markdown
- `charm-creator.tsx` - Pattern launcher
- `backlinks-index.tsx` - Backlink tracking system
- `counter.tsx` - Simple counter example
- `counter-handlers.ts` - Counter helper functions
- `person.tsx` - Person contact information

## Maintenance

To update these patterns, copy from `/Users/alex/Code/labs/packages/patterns/`
as needed.
