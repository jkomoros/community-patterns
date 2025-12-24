---
topic: deployment
discovered: 2025-12-24
sessions: [claude-code-session]
related_labs_docs: none
status: verified-in-progress
linear_issue: CT-1141
---

# CLI Deployment Fails with Large Patterns (OOM) - Runtime Works Fine

## Problem

When deploying patterns with large UI (like Record) via `ct charm new`, deployment fails with OOM:

**Example error:**
```
Fatal JavaScript out of memory: Reached heap limit
```

Previously manifested as stack overflow before cycle detection was added:
```
RangeError: Maximum call stack size exceeded
    at recursiveStripAsCellAndStreamFromSchema (...)
```

## Root Cause Analysis (Verified)

**Two separate issues identified:**

### Issue 1: SubCharmEntry.schema Explosion (FIXED in labs-4)
- `getResultSchema(charm)` was capturing full result schemas at SubCharmEntry creation
- These schemas include nested charm references, creating massive duplication
- **Fix applied:** Removed all `getResultSchema` calls from `record.tsx`, using registry fallback instead

### Issue 2: vdomSchema $ref Self-Reference (NOT FIXED - CT-1141)
- `packages/runner/src/schemas.ts` defines `vdomSchema` with `$ref: "#"` (self-reference)
- This is valid JSON Schema but causes issues in `recursiveStripAsCellAndStreamFromSchema`
- The function has object-identity cycle detection (`seen: Map`) but:
  - Each schema property traversal creates new objects
  - `$ref: "#"` is just a string, not resolved
  - Large patterns with lots of UI generate massive schema trees
- **This is the core CT-1141 bug that needs to land**

## Current Status

1. ✅ Removed `recordPatternJson` / `linkPattern` dead code (was never used by Note)
2. ✅ Removed `getResultSchema` calls to prevent schema duplication
3. ❌ CLI still OOMs on Record due to vdomSchema $ref issue
4. ✅ Simple patterns (email.tsx) deploy fine via CLI
5. ✅ Record works at runtime - only CLI deployment affected

## Workarounds

1. **Deploy via browser/launcher** instead of CLI
2. **Use wish system** to instantiate patterns
3. **Pattern works once deployed** by any means

## Files Modified (in labs-4)

- `packages/patterns/record.tsx`:
  - Removed `JSON.stringify(Record)` computed
  - Removed `recordPatternJson` parameter threading
  - Removed `linkPattern` prop (was dead code - Note never used it)
  - Removed all `getResultSchema` calls
  - Added comments about registry fallback for schema discovery

## Technical Details

### The vdomSchema Problem

```typescript
// packages/runner/src/schemas.ts
export const vdomSchema: JSONSchema = {
  properties: {
    children: {
      items: {
        anyOf: [
          { $ref: "#", asCell: true },  // Self-reference
          // ...
        ],
      },
    },
    [UI]: { $ref: "#" },  // Another self-reference
  },
}
```

### Why Object-Identity Cycle Detection Isn't Enough

```typescript
// packages/runner/src/link-utils.ts
function recursiveStripAsCellAndStreamFromSchema(schema, options, seen, depth) {
  if (seen.has(schema)) return seen.get(schema);  // Object identity check
  const result = { ...schema };  // Creates NEW object
  seen.set(schema, result);
  // ... recursively processes properties
  // Problem: $ref is a string, not an object reference
  // Each traversal creates new objects that aren't in 'seen'
}
```

### The Fix Needed (CT-1141)

`recursiveStripAsCellAndStreamFromSchema` needs to either:
1. Resolve `$ref` references before processing, OR
2. Track `$ref` targets specially, OR
3. Implement a depth/complexity limit for schema expansion

## Linear Issue

CT-1141 tracks the core `$ref` handling issue in `recursiveStripAsCellAndStreamFromSchema`.

## Next Steps

- [x] Remove SubCharmEntry.schema explosion (getResultSchema removal)
- [x] Remove dead linkPattern code
- [ ] CT-1141: Fix $ref handling in recursiveStripAsCellAndStreamFromSchema
- [ ] Land labs runner fix
- [ ] Verify Record deploys via CLI
- [ ] Delete this superstition

---

**Status:** Partially verified. Root cause identified with two issues. One fixed (schema storage), one pending (CT-1141).
