# CPU Loop Charm Poisons the Space

**SUPERSTITION** - Single observation, unverified. Use with skepticism!

## Topic

Debugging infinite loops and high CPU usage in patterns

## Problem

When a charm causes an infinite loop or 100% CPU usage, the entire space becomes unusable. Visiting the space URL will trigger the problematic charm to load, causing the CPU spike again.

## Symptoms

1. Deploy charm to a space (e.g., `jkomoros`)
2. Charm causes infinite loop or 100% CPU
3. Server becomes unresponsive, need to restart
4. After restart, visiting the space (e.g., `http://localhost:5173/jkomoros/`) triggers the same loop again
5. Space is effectively "poisoned" - can't be used until the problematic charm is removed

## Workaround

**Use a new space for testing:**
```bash
# Instead of reusing the same space
--space jkomoros

# Use a fresh space each time you're debugging CPU issues
--space jkomoros-test2
--space jkomoros-debug-3
```

This way, if a charm causes issues, you don't lose access to your main space with other working charms.

## Why This Happens

The space likely tries to load/initialize all charms it contains when visited. If one charm has an infinite loop, it blocks the entire space.

## Prevention

1. Test new patterns in isolated spaces
2. Have a "production" space and "testing" space
3. When debugging CPU issues, use throwaway space names

## Context

- **Pattern:** gmail-search-registry.tsx
- **Issue:** Handler calling caused CPU spike, space couldn't be visited after
- **Discovery:** Testing expand/collapse functionality

## Related

- **Superstition:** `2025-12-04-self-referential-wish-causes-infinite-loop.md` - Another infinite loop cause
- **Superstition:** `2025-12-06-sort-mutates-array-spread-first-in-derive.md` - Mutation in derive causing thrashing

## Metadata

```yaml
topic: debugging, spaces, CPU, infinite-loop, development
discovered: 2025-12-06
confirmed_count: 1
last_confirmed: 2025-12-06
sessions: [gmail-search-registry-expand-collapse]
related_functions: deploy, space
status: superstition
stars: ***
```

## Guestbook

- 2025-12-06 - gmail-search-registry.tsx. After deploying a charm that caused CPU loop, couldn't revisit the jkomoros space without triggering the loop again. Had to use fresh space (jkomoros-test2) for further testing. (gmail-search-registry-expand-collapse)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
