# ⚠️ SUPERSTITION: Touch Shell File to Trigger UI Component Rebuild

**⚠️ WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

Triggering rebuilds of `@commontools/ui` components (ct-* components) during local development

## Problem

When modifying UI component files in `packages/ui/src/v2/components/` (like `ct-code-editor.ts`), the changes are NOT automatically picked up by the dev server. Restarting both dev servers (toolshed + shell) doesn't help - the old code continues to run.

**Symptom:**
- You modify a ct-* component in the UI package
- Restart dev servers with `restart-local-dev.sh`
- Changes still don't appear (console.log statements missing, fixes not working, etc.)

**Why this happens:**
- The shell's `felt` dev server only watches `packages/shell/src/` for changes
- Changes to `@commontools/ui` (which is imported as a dependency) are NOT detected
- esbuild bundles the old cached version of the UI dependency

## Solution That Seemed to Work

**After restarting dev servers, touch any file in `packages/shell/src/`:**

```bash
# Restart dev servers first
../labs/scripts/restart-local-dev.sh --force

# Then touch a shell file to trigger rebuild
touch /Users/alex/Code/labs/packages/shell/src/index.ts
```

**Why this works:**
1. Shell imports `@commontools/ui` in `src/index.ts` (line 3)
2. Touching any file in `packages/shell/src/` triggers the `felt` watcher
3. The watcher triggers an esbuild rebuild
4. esbuild re-resolves all dependencies, including the modified UI package
5. The new UI component code is bundled

**Alternative:** Touch any file in shell/src - doesn't have to be index.ts:
```bash
touch /Users/alex/Code/labs/packages/shell/src/globals.ts
```

## Context

- **Discovered while:** Fixing ct-code-editor backlink navigation bug
- **File modified:** `/Users/alex/Code/labs/packages/ui/src/v2/components/ct-code-editor/ct-code-editor.ts`
- **Build system:** `felt` (in `packages/felt`)
- **Watch config:** Default watchDir is `"src"` (relative to package root)

## Technical Details

From `packages/felt/interface.ts`:
```typescript
// The directory from root to watch for changes
// to cause a JS rebuild during `dev`.
// Defaults to "src".
watchDir?: string;
```

From `packages/shell/deno.json`:
```json
{
  "tasks": {
    "dev-local": "API_URL=http://localhost:8000 deno run -A ../felt/cli.ts dev ."
  }
}
```

The shell uses the default `watchDir: "src"` which means only `packages/shell/src/` is watched. The `@commontools/ui` dependency lives in a separate package.

## Related

- `packages/felt/felt.ts` - Dev server with file watching
- `packages/felt/builder.ts` - esbuild builder with watch functionality
- `packages/shell/src/index.ts` - Where @commontools/ui is imported

## Metadata

```yaml
topic: deployment, dev-server, ui-components, rebuild, felt, esbuild, watch
discovered: 2025-12-18
confirmed_count: 1
last_confirmed: 2025-12-18
sessions: [ct-code-editor-backlink-bug-fix]
related_functions: felt, esbuild, watch
related_patterns: local-development, hot-reload
status: superstition
stars: ⭐⭐
```

## Guestbook

- ⭐⭐ 2025-12-18 - Fixed ct-code-editor backlink navigation bug. Made changes to the component, restarted dev servers multiple times, but my console.log debug statements never appeared. User pointed out that UI components need something specific touched to rebuild. Discovered that touching `packages/shell/src/index.ts` triggers the rebuild. The felt dev server only watches shell/src, not the UI package. (ct-code-editor-backlink-bug-fix)

---

**Remember: This is just one observation. Test thoroughly in your own context!**

**TIP:** If your UI component changes aren't being picked up after restarting dev servers, try `touch /path/to/labs/packages/shell/src/index.ts`!
