# Issue: CLI Commands Show Null/Empty for Array Item Fields

## Summary

The `ct charm get`, `ct charm inspect`, and other CLI commands display array item fields as `null` or `{}`, even when the actual data is stored correctly and works fine in the UI.

**This is a CLI display/serialization issue, NOT a storage bug.**

## Evidence That Data Is Correct

1. **UI shows correct values**: The Gmail Search Registry UI shows "4 Agent Types, 5 Total Queries" - the correct counts
2. **Computed values work**: The `registries` computed view correctly groups queries by agent type
3. **Handlers work**: `submitQuery` handler successfully adds queries (counts increase)
4. **Runtime data is correct**: `derive()` callbacks receive the actual values

## CLI Output Showing Bug

```bash
# Inspecting the charm
$ deno task ct charm inspect --url "http://localhost:8000/jkomoros/baedreiac34vce2hd3upexd7bjekxztgfynribfqwlr2qfhbzchznttxbdq"

--- Source (Inputs) ---
{
  "queries": [
    null,    # ❌ Should be SharedQuery objects
    null,
    null,
    null,
    null
  ]
}

--- Result ---
{
  "queries": [
    null,    # ❌ Same issue
    null,
    null,
    null,
    null
  ],
  "registries": {
    "https://raw.githubusercontent.com/.../hotel-membership-gmail-agent.tsx": {
      "agentTypeUrl": "...",
      "agentTypeName": "Hotel Membership",
      "queries": [
        {},    # ❌ Should have id, query, upvotes, etc.
        {}
      ]
    },
    "test-agent": {
      "agentTypeUrl": "test-agent",
      "agentTypeName": "test-agent",
      "queries": [
        {}     # ❌ Empty object instead of actual query data
      ]
    }
  }
}
```

## Expected CLI Output

```json
{
  "queries": [
    {
      "id": "query-1733513000000-abc123",
      "agentTypeUrl": "https://raw.githubusercontent.com/.../hotel-membership-gmail-agent.tsx",
      "query": "subject:hilton OR subject:marriott",
      "description": "Searches for hotel membership emails",
      "submittedBy": "",
      "submittedAt": 1733513000000,
      "upvotes": 0,
      "downvotes": 0,
      "lastValidated": 0
    }
  ]
}
```

## Impact

1. **Debugging is difficult**: Can't inspect actual cell values via CLI
2. **Testing handlers is hard**: Can't verify handler changes without using the UI
3. **Automation blocked**: Can't script tests or data inspection
4. **Misleading**: Initially thought this was a storage bug (spent hours debugging)

## Pattern Structure

```typescript
export interface SharedQuery {
  id: string;
  agentTypeUrl: string;
  query: string;
  description: string;
  submittedBy: string;
  submittedAt: number;
  upvotes: number;
  downvotes: number;
  lastValidated: number;
}

export interface GmailSearchRegistryInput {
  queries?: Default<SharedQuery[], []>;  // Flat array
}
```

## Affected Commands

- `ct charm get <path>` - Shows `[null, null, ...]` for arrays
- `ct charm inspect` - Same issue in both Source and Result sections
- `ct charm inspect --json` - Same issue

## Workaround

Test in the actual UI instead of relying on CLI for debugging array contents.

## Related

- **Superstition (UPDATED):** `community-docs/superstitions/2025-12-06-deeply-nested-objects-become-null.md` - Originally thought to be a storage bug, now confirmed as CLI display issue only
- **Issue:** `ISSUE-Deeply-Nested-Objects-Stored-As-Null.md` - Previous issue that may need updating since data IS stored correctly

## Environment

- CommonTools framework (latest from ~/Code/labs)
- Testing with local dev server (localhost:8000)
- Pattern: patterns/jkomoros/gmail-search-registry.tsx

---

**The CLI serialization is losing array item data during display, even though storage and runtime are working correctly.**
