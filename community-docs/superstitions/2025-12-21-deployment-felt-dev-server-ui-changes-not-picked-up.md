---
topic: deployment
discovered: 2025-12-21
sessions: [ct-cell-context-height-fix]
related_labs_docs: ~/Code/labs/docs/common/LOCAL_DEV_SERVERS.md
status: superstition
---

# SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this is verified correct,** upstream it to labs docs and delete this superstition.

---

# Felt Dev Server Does Not Watch @commontools/ui Changes

## Problem

When making changes to UI components in `packages/ui/` (like `ct-cell-context.ts`), the felt dev server (`deno task dev-local` in `packages/shell`) does NOT automatically rebuild.

The server only watches `packages/shell/src/` for changes. Changes to workspace dependencies like `@commontools/ui` are not detected.

This leads to confusing situations where:
- The source file is updated
- The built `dist/scripts/index.js` shows the changes (via `deno task build`)
- But the dev server serves stale code from its in-memory build

**Symptoms:**
- Source file has your changes
- `curl http://localhost:5173/scripts/index.js` shows correct code
- But browser still shows old behavior
- Component definitions (like Lit elements) use old code

## Solution That Seemed To Work

To force the felt dev server to pick up changes in `@commontools/ui`:

1. **Touch a file in `shell/src`** to trigger a rebuild:
   ```bash
   touch packages/shell/src/index.ts
   ```

2. **Optionally clear Deno cache** if still not working:
   ```bash
   deno cache --reload packages/ui/src/v2/components/path/to/component.ts
   ```

3. **Close and reopen browser tabs** - Custom elements (via `customElements.define`) are only defined once per JavaScript context. If the element was defined with old code, a page reload won't fix it - you need a completely fresh browser context.

4. **For Playwright testing**, close the browser page and navigate fresh:
   ```javascript
   await page.close();
   // Open new tab
   await page.goto('http://localhost:5173/...');
   ```

## Example

```bash
# Made changes to packages/ui/src/v2/components/ct-cell-context/ct-cell-context.ts
# Added: height: 100%; to :host styles

# Dev server log shows it's running but doesn't detect the change
# Browser still shows old styles

# Solution:
touch packages/shell/src/index.ts

# Wait for rebuild message in dev server log:
# [33m[39m [2mBuilding[22m [34m/Users/alex/Code/labs/packages/shell/src/index.ts[39m...
#    [2mTotal build time: 847ms[22m

# Then hard refresh browser (or close/reopen tab)
```

## Context

This was discovered while adding `height: 100%` to `ct-cell-context.ts` to fix scroll containment issues in record.tsx.

The debugging process was complicated by:
1. Not knowing felt only watches `shell/src`
2. Browser caching making it seem like the server was serving old code
3. Custom element definitions persisting across page reloads
4. Multiple verification steps needed (curl vs browser fetch vs actual component behavior)

**Key insight**: The server IS serving correct code (verified via curl), but the browser's JavaScript context had already defined the custom element with old code. Even fetching the new JS file doesn't re-run `customElements.define()`.

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/LOCAL_DEV_SERVERS.md`
- **Felt config:** `packages/shell/felt.config.ts` - defines watch paths
- **Build system:** `packages/felt/` - the custom build tool

## Next Steps

- [ ] Verify against official docs
- [ ] Consider adding this to LOCAL_DEV_SERVERS.md
- [ ] Consider adding watch paths for workspace deps to felt
- [ ] Then delete this superstition

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
