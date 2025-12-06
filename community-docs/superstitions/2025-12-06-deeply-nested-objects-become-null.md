# ~~Deeply Nested Objects in Record<string, T> Become Null~~ CLI Display Issue Only

**SUPERSTITION - PARTIALLY DISPROVEN**

## UPDATE: This is a CLI display issue, NOT a storage issue!

Further testing revealed that the data IS stored correctly and works in the UI. The `ct charm get` CLI command shows empty/default values for fields in array items, but the actual runtime data is correct.

**Evidence:**
- UI shows correct values (e.g., "https://test-agent" in registry)
- `derive()` callbacks receive correct values
- Only CLI `charm get` shows empty/null values

**Recommendation:** Don't rely on `ct charm get` for debugging array item fields. Test in the actual UI instead.

---

## Original (Partially Wrong) Observation

### Topic

Storing deeply nested objects in cell inputs with `Record<string, ComplexType>` structure

### Original Problem Description

When you have a pattern input with structure like:
```typescript
Record<string, { field: string; nestedArray: NestedObject[] }>
```

Objects inside the nested array APPEAR to become `null` when read via CLI, but this is a display issue.

### What Didn't Work

```typescript
// Pattern input type
export interface MyInput {
  registries?: Default<Record<string, AgentTypeRegistry>, {}>;
}

interface AgentTypeRegistry {
  agentTypeUrl: string;
  queries: SharedQuery[];  // Objects in this array become null!
}

interface SharedQuery {
  id: string;
  query: string;
  upvotes: number;
  // ...
}
```

**Setting via CLI:**
```bash
echo '{"key": {"agentTypeUrl": "key", "queries": [{"id": "q1", "query": "test", "upvotes": 0}]}}' | \
  deno task ct charm set ... registries --input
```

**Reading back:**
```json
{
  "key": {
    "agentTypeUrl": "key",
    "queries": [null]  // The SharedQuery object became null!
  }
}
```

### Structure Depth Analysis

| Depth | Structure | Works? |
|-------|-----------|--------|
| 1 | `Record<string, string>` | Yes |
| 2 | `Record<string, { field: string }>` | Yes |
| 2 | `Record<string, { array: string[] }>` | Yes |
| 3 | `Record<string, { array: SimpleObject[] }>` | **NO - objects become null** |

## Workarounds (Untested)

1. **Flatten the structure** - Store queries at top level with agent URL as prefix:
   ```typescript
   interface FlatInput {
     queries?: Default<Array<{ agentUrl: string; query: SharedQuery }>, []>;
   }
   ```

2. **Use JSON string for deep objects** - Serialize nested objects as JSON strings:
   ```typescript
   interface Registry {
     agentTypeUrl: string;
     queriesJson: string;  // JSON.stringify(queries)
   }
   ```

3. **Separate cells** - Store queries in separate top-level cell keyed by agent URL

## Detection

If you see array items become `null` when stored:
1. Check your data structure depth
2. If you have `Record<string, { array: Object[] }>`, this bug may apply
3. Try setting data directly via CLI to rule out handler issues

## Context

- **Pattern:** gmail-search-registry.tsx
- **Use case:** Community query registry with queries nested in per-agent-type records
- **Observed:** Both handler-set and CLI-set data resulted in null array items

## Related

- **Superstition: cells-must-be-json-serializable.md** - Related serialization issues
- **Superstition: default-only-at-array-level-not-nested.md** - Nested Default issues

## Metadata

```yaml
topic: cells, serialization, nested-objects, Record, arrays, null
discovered: 2025-12-06
confirmed_count: 1
last_confirmed: 2025-12-06
sessions: [community-query-sharing]
related_functions: cell, Default, Record
status: superstition
stars: ⭐⭐⭐
```

## Guestbook

- 2025-12-06 - gmail-search-registry.tsx. Had `Record<string, AgentTypeRegistry>` where `AgentTypeRegistry.queries: SharedQuery[]`. When setting data via CLI or handler, the SharedQuery objects in the queries array became `null`. Empty arrays work fine. Confirmed by setting data directly via `ct charm set`. (community-query-sharing)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
