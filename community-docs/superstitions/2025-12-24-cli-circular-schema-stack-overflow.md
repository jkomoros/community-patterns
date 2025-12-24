---
topic: deployment
discovered: 2025-12-24
sessions: [claude-code-session]
related_labs_docs: none
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

# CLI Deployment Fails with Circular Schema (Stack Overflow) - Runtime Works Fine

## Problem

When deploying patterns with circular/self-referential schema structures via `ct charm new`, you get a "Maximum call stack size exceeded" error:

**Example error:**
```
RangeError: Maximum call stack size exceeded
    at recursiveStripAsCellAndStreamFromSchema (file:///packages/runner/src/link-utils.ts:426:32)
    at recursiveStripAsCellAndStreamFromSchema (file:///packages/runner/src/link-utils.ts:426:32)
    ... (repeated hundreds of times)
```

This happens with patterns like Record that have circular schema references (e.g., SubCharmEntry contains `schema?: JSONSchema` which can reference back to the parent pattern).

## Solution That Seemed To Work

**This is NOT a runtime issue** - the pattern works correctly at runtime. The error only affects CLI deployment.

The `recursiveStripAsCellAndStreamFromSchema` function in `packages/runner/src/link-utils.ts` lacks cycle detection (unlike other similar functions in the codebase that use `seen: Set<any>`).

**Workarounds:**
1. Deploy via the browser/launcher instead of CLI
2. Use the wish system to instantiate the pattern
3. The pattern will work once deployed by any means

**Why runtime works:** The runtime has proper circular reference handling throughout:
- Link resolution uses cycle detection
- Cell system handles circular references
- Schema queries have cycle-aware convergence

## Example

```bash
# This fails with stack overflow
deno task ct charm new packages/patterns/record.tsx -i claude.key -a http://localhost:8000 -s my-space

# But deploying via browser/launcher works fine
# Navigate to http://localhost:8000/~/launcher and ask "Create a Record charm"
```

## Context

- The Record pattern contains SubCharmEntry which has a `schema?: JSONSchema` field
- When sub-charms are created, their resultSchema is captured
- Notes sub-charms created with `linkPattern: recordPatternJson` create circular schema references
- CLI tries to serialize/sanitize schema before deployment, hitting the infinite recursion
- Runtime doesn't use this serialization path, so patterns work fine once deployed

## Related Documentation

- **Official docs:** none found specifically about this
- **Related code:** `packages/runner/src/link-utils.ts:396-435` (`recursiveStripAsCellAndStreamFromSchema`)
- **Similar functions with cycle detection:** `createDataCellURI` at line 339-370 uses `seen: Set<any>`

## Next Steps

- [ ] Verify against official docs
- [ ] Potential fix: Add `seen: Set<any>` cycle detection to `recursiveStripAsCellAndStreamFromSchema`
- [ ] If correct, upstream to labs docs
- [ ] Then delete this superstition

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
