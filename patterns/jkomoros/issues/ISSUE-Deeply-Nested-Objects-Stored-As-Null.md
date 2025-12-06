# Issue: Objects in Deeply Nested Arrays Store as Null

## UPDATE: This is a CLI DISPLAY BUG, not a storage bug!

**2025-12-06:** Further testing revealed that the data IS stored correctly and works in the UI. The `ct charm get` and `ct charm inspect` CLI commands show empty/default values for fields in array items, but the actual runtime data is correct.

See: `ISSUE-CLI-Display-Bug-Array-Items-Show-Null.md` for the updated, accurate issue.

**Evidence:**
- UI shows correct values (e.g., "5 Total Queries" when CLI shows `[null, null, null, null, null]`)
- `derive()` callbacks receive correct values
- Handlers successfully modify data

---

## Original Issue (Partially Incorrect)

~~## Summary~~

~~When storing data in a cell with structure `Record<string, { field: string; nestedArray: Object[] }>`, objects inside the nested array are serialized as `null` instead of their actual values. This happens both when set via handlers AND when set directly via CLI.~~

## Use Case

**Pattern:** gmail-search-registry.tsx

**What you're trying to accomplish:**
- Create a community registry for sharing Gmail search queries
- Store queries organized by agent type in a `Record<string, AgentTypeRegistry>` structure
- Each `AgentTypeRegistry` contains a `queries: SharedQuery[]` array
- Users submit queries, upvote/downvote them via handlers

**Why you need this behavior:**
- Need to organize queries by agent type (the URL of the pattern that uses them)
- Each query has metadata (id, description, upvotes, downvotes, timestamp)
- Natural data model is hierarchical: agent types contain their queries

## Current State (What Works)

### Working: Empty nested arrays

```typescript
// This data structure works when queries is empty
echo '{"test-agent": {"agentTypeUrl": "test-agent", "agentTypeName": "Test", "queries": []}}' | \
  deno task ct charm set ... registries --input

// Result: ✅ Stored correctly
{
  "test-agent": {
    "agentTypeUrl": "test-agent",
    "agentTypeName": "Test",
    "queries": []
  }
}
```

### Working: Flat structures

Simple Record<string, Object> without nested arrays would work.

## What We Tried (Failed Attempts)

### Attempt 1: Handler Setting Nested Array with Objects

```typescript
export interface SharedQuery {
  id: string;
  query: string;
  description?: string;
  submittedAt: number;
  upvotes: number;
  downvotes: number;
}

export interface AgentTypeRegistry {
  agentTypeUrl: string;
  agentTypeName?: string;
  queries: SharedQuery[];
}

export interface GmailSearchRegistryInput {
  registries?: Default<Record<string, AgentTypeRegistry>, {}>;
}

// Handler to submit a query
const submitQuery = handler<
  { agentTypeUrl: string; query: string; },
  { registries: Cell<Record<string, AgentTypeRegistry>> }
>((input, state) => {
  const newQuery: SharedQuery = {
    id: `query-${Date.now()}`,
    query: input.query,
    submittedAt: Date.now(),
    upvotes: 0,
    downvotes: 0,
  };

  const updatedRegistry = {
    ...agentRegistry,
    queries: [...agentRegistry.queries, newQuery],
  };

  state.registries.set({
    ...currentRegistries,
    [input.agentTypeUrl]: updatedRegistry,
  });
});
```

**After calling handler via CLI:**
```bash
deno task ct charm call ... submitQuery '{"agentTypeUrl": "test", "query": "subject:test"}'
```

**Reading back:**
```json
{
  "test": {
    "agentTypeUrl": "test",
    "agentTypeName": "Test",
    "queries": [null]  // ❌ Object became null!
  }
}
```

---

### Attempt 2: Direct CLI Set with JSON Data

Bypassing the handler entirely:

```bash
echo '{"test-agent": {"agentTypeUrl": "test-agent", "agentTypeName": "Test", "queries": [{"id": "q1", "query": "subject:test", "submittedAt": 1733500000000, "upvotes": 0, "downvotes": 0}]}}' | \
  deno task ct charm set ... registries --input
```

**Reading back:**
```json
{
  "test-agent": {
    "agentTypeUrl": "test-agent",
    "agentTypeName": "Test",
    "queries": [null]  // ❌ STILL null even with direct set!
  }
}
```

**This proves the issue is in storage/serialization, not in the handler logic.**

---

### Attempt 3: Minimal Reproduction

Tested with simplest possible nested object:

```bash
# Set minimal data
echo '{"key": {"field": "value", "arr": [{"id": "1"}]}}' | \
  deno task ct charm set ... registries --input

# Result
{
  "key": {
    "field": "value",
    "arr": [null]  // ❌ Even simplest nested object becomes null
  }
}
```

---

## Structure Depth Analysis

| Depth | Structure | Works? |
|-------|-----------|--------|
| 1 | `Record<string, string>` | Yes |
| 2 | `Record<string, { field: string }>` | Yes |
| 2 | `Record<string, { array: string[] }>` | Yes |
| 3 | `Record<string, { array: SimpleObject[] }>` | **NO - objects become null** |

The issue appears to be specifically with objects inside arrays that are inside objects that are inside a Record.

## Questions

1. **Is this a known limitation of cell serialization?** The data is JSON-serializable, so it should survive storage.

2. **Is there something about the type definition that's causing issues?** Perhaps the framework is trying to wrap nested objects in cells and failing?

3. **Is there a workaround using different type annotations?** Perhaps avoiding `Record<string, T>` in favor of a different structure?

4. **Is this related to how Default<> wraps the outer Record?** Would removing the Default wrapper help?

5. **Should we file a Linear ticket for this?** It seems like a framework bug rather than intended behavior.

## Desired Behavior

What we want to happen:

1. Define `Record<string, { array: Object[] }>` structure in pattern input
2. Set values via handler or CLI
3. Objects in nested arrays are stored with their full data
4. Reading back returns the complete object data

## Workaround (Planned)

We'll restructure to use a flat array instead:

```typescript
// Instead of:
Record<string, { agentTypeUrl: string; queries: SharedQuery[] }>

// Use:
Array<SharedQuery & { agentTypeUrl: string }>
```

This loses the nice hierarchical structure but should work around the serialization issue.

## Environment

- CommonTools framework (latest from ~/Code/labs)
- Testing with local dev server (localhost:8000)
- Pattern: patterns/jkomoros/gmail-search-registry.tsx
- Reproduced with both handler set and direct CLI set

## Related Documentation

- **Superstition:** `community-docs/superstitions/2025-12-06-deeply-nested-objects-become-null.md`
- **Related:** `community-docs/superstitions/2025-11-29-cells-must-be-json-serializable.md` (but this data IS serializable)

---

**This appears to be a framework bug in cell serialization for deeply nested structures. Any guidance would be greatly appreciated!**
