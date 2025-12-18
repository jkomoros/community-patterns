# generateObject CPU Spike: JSON String Workaround

## Summary

When `generateObject` returns a complex object with many fields, the UI freezes for 15+ seconds due to per-write overhead in the framework. A workaround exists: return a single JSON-encoded string and parse it client-side.

## Status: folk_wisdom

**Confirmed by:** @jkomoros via extensive profiling (2025-12-17)
**Framework issue:** CT-1123 (proper fix needed)

## The Problem

```typescript
// ❌ SLOW - Each field becomes a separate write (~68ms × N fields)
const { result } = generateObject({
  schema: {
    type: "object",
    properties: {
      displayName: { type: "string" },
      givenName: { type: "string" },
      familyName: { type: "string" },
      // ... 11 more fields
    }
  }
});
// Result: 226 writes × 68ms = 15+ second UI freeze
```

## Root Cause

The framework's `applyChangeSet()` applies each field change individually via `tx.writeValueOrThrow()`. Each write has significant overhead:
- `JSON.parse(JSON.stringify())` deep cloning (~15-20ms)
- O(n) rebase operations that grow with prior write count
- Per-write activity tracking

With 226 writes from a 14-field extraction, this adds up to **15+ seconds of blocking time**.

## The Workaround

```typescript
// ✅ FAST - Single JSON string = 2 writes total
const { result } = generateObject({
  system: `Extract the data and return it as a single JSON string.
    The JSON must be valid and contain these fields:
    displayName, givenName, familyName, nickname, pronouns,
    email, phone, birthday, twitter, linkedin, github, instagram,
    mastodon, remainingNotes`,
  prompt: notes,
  schema: {
    type: "object",
    properties: {
      extracted: { type: "string" }  // Single JSON-encoded string
    }
  }
});

// Parse when accessing
interface PersonData {
  displayName?: string;
  givenName?: string;
  // ... etc
}

const parsed = computed(() => {
  const raw = result.get()?.extracted;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersonData;
  } catch {
    return null;
  }
});

// Use like: parsed.get()?.displayName
```

**Result: 226 writes → 2 writes (~100x improvement)**

## Trade-offs

| Aspect | Structured Schema | JSON String Workaround |
|--------|-------------------|------------------------|
| Write count | ~226 | 2 |
| UI freeze | 15+ seconds | <100ms |
| Streaming preview | ✅ Fields appear as generated | ❌ Nothing until complete |
| Schema validation | ✅ LLM guided by schema | ❌ Manual validation needed |
| Type safety | ✅ Full TypeScript inference | ⚠️ Manual casting required |
| Error handling | ✅ Framework handles | ⚠️ Must catch JSON.parse errors |
| LLM reliability | ✅ High (schema enforced) | ⚠️ May produce invalid JSON |

## When to Use This Workaround

✅ **Use when:**
- The 15+ second freeze is unacceptable
- You don't need streaming preview (all-or-nothing is fine)
- The extraction is for a one-time operation
- You can handle occasional JSON parse failures

❌ **Don't use when:**
- You need to see fields populate incrementally
- Schema validation is critical for reliability
- The pattern is user-facing and must not fail
- You can tolerate the freeze (it's a one-time operation)

## Alternative: Fewer Fields

If you can reduce the number of fields, the freeze scales linearly:

| Fields | Approx Writes | Approx Freeze |
|--------|---------------|---------------|
| 2 | ~10 | <1 second |
| 5 | ~40 | ~3 seconds |
| 10 | ~100 | ~7 seconds |
| 14 | ~226 | ~15 seconds |

## Proper Fix

This workaround is temporary. The proper fix is in the framework:
- **CT-1123**: Batch writes in `applyChangeSet()` to reduce per-write overhead
- Issue file: `patterns/jkomoros/issues/ISSUE-applyChangeSet-slow-writes.md`

## Reference

- Profiling methodology: `community-docs/superstitions/2025-12-17-measuring-performance-correctly.md`
- Full investigation: `patterns/jkomoros/issues/ISSUE-applyChangeSet-slow-writes.md`
- Repro patterns: `patterns/jkomoros/WIP/cpu-spike-investigation/`
