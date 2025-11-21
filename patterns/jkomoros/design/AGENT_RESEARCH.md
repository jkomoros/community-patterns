# Agent Tool Calling Research - How It Works

## Key Findings from labs/

### 1. generateObject with Tools

**Basic Structure:**
```typescript
const { result, pending } = generateObject({
  system: "System prompt",
  prompt: "User prompt",
  schema: resultSchema,  // Final result structure
  tools: {
    toolName: patternTool(PatternFunction, { staticInputs }),
    // OR
    toolName: {
      description: "Tool description",
      handler: handlerFunction({ state }),
    },
  },
  model: "anthropic:claude-sonnet-4-5",
});
```

### 2. How patternTool() Works

**Signature:** `patternTool(patternFunction, staticInputs)`

**What it does:**
- Takes a pattern function and static inputs
- LLM provides dynamic inputs at tool call time
- Framework merges static + dynamic inputs before calling pattern

**Example from chatbot.tsx:**
```typescript
const assistantTools = {
  listMentionable: patternTool(listMentionable, { mentionable }),
  listRecent: patternTool(listRecent, { recentCharms }),
};
```

Here:
- `mentionable` and `recentCharms` are STATIC (from pattern state)
- LLM calls the tool with no additional inputs (patterns have no dynamic inputs)

**Example from tests:**
```typescript
tools: {
  listItems: patternTool(listItems, { items: itemsData }),
  countItems: patternTool(countItems, { items: itemsData }),
}
```

Here:
- `items` is STATIC (array of data)
- LLM calls tools with no additional inputs

### 3. The finalResult Tool

When you provide `tools: {}` (even empty object), generateObject automatically adds a special tool:

**`finalResult`** - Called by LLM when done, with data matching the schema

**Flow:**
1. LLM calls user tools (searchGmail, readEmail, etc.)
2. LLM analyzes results
3. LLM calls `finalResult(data)` where data matches your schema
4. generateObject returns that data in `result`

### 4. Pattern vs Recipe

**Pattern:** Use with `pattern()` - for complex reactive components
```typescript
export const SearchGmailTool = pattern(({ query, authCharm }) => {
  // ... logic ...
  return previews;
});
```

**Recipe:** Use with `recipe<Input, Output>()` - for simple tools
```typescript
export const calculator = recipe<{ expression: string }, string>(
  ({ expression }) => {
    // ... logic ...
    return result;
  }
);
```

Both work with patternTool()!

### 5. Mixing Static and Dynamic Inputs

**For SearchGmailTool:**
```typescript
pattern((
  { query, authCharm }: {
    query: string;      // DYNAMIC - provided by LLM
    authCharm: any;     // STATIC - provided at registration
  }
) => { ... })

// Register with:
tools: {
  searchGmail: patternTool(SearchGmailTool, { authCharm }),
}

// LLM calls it with: searchGmail({ query: "from:marriott.com" })
// Framework merges: { query: "from:marriott.com", authCharm: <staticValue> }
```

### 6. State Management

**Question:** How does agent update brandHistory?

**Answer:** Agent doesn't update state directly. Two approaches:

**Option A: Handler-based approach (current 2-stage LLM uses this)**
- Use handler to save results after agent completes
- Handler reads `result` from generateObject
- Handler updates cells (memberships, brandHistory, etc.)

**Option B: Agent returns everything in finalResult**
- Agent calls finalResult with: `{ memberships, brandHistory, queriesAttempted }`
- Pattern extracts data from result
- Pattern updates cells based on result

For hotel membership extractor: **Use Option A** (handler-based)
- Keep existing save handler pattern
- Just replace 2-stage LLM with single agent
- Handler already updates brandHistory correctly

## Implementation Plan

### Step 1: Wire Up Tools

```typescript
// In main pattern, after authCharm setup:
const agent = generateObject({
  system: `You are a hotel membership number extractor...

  Strategy:
  1. searchGmail with broad queries first
  2. Analyze email subjects
  3. readEmail for promising emails
  4. Extract membership numbers
  5. If no success, refine query
  6. Try 3-5 queries per brand before moving on

  Brands: Marriott, Hilton, Hyatt, IHG, Accor`,

  prompt: derive([brandHistory, memberships, isScanning], ([history, found, scanning]) => {
    if (!scanning) return "";  // Don't run unless scanning

    return `Current state:
- Brands searched: ${history.map(h => `${h.brand} (${h.status})`).join(", ")}
- Memberships found: ${found.length}
- Last queries: ${history.flatMap(h => h.attempts.map(a => a.query)).slice(-3).join(", ")}

Find hotel membership numbers in my Gmail.`;
  }),

  tools: {
    searchGmail: patternTool(SearchGmailTool, { authCharm }),  // authCharm is static
    readEmail: patternTool(ReadEmailTool, { recentSearches: someCell }),  // Need to track recent searches
  },

  model: "anthropic:claude-sonnet-4-5",

  schema: {
    type: "object",
    properties: {
      memberships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            hotelBrand: { type: "string" },
            programName: { type: "string" },
            membershipNumber: { type: "string" },
            tier: { type: "string" },
            sourceEmailId: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["hotelBrand", "programName", "membershipNumber", "sourceEmailId", "confidence"],
        },
      },
      queriesAttempted: {
        type: "array",
        items: {
          type: "object",
          properties: {
            brand: { type: "string" },
            query: { type: "string" },
            emailsFound: { type: "number" },
            emailsRead: { type: "number" },
          },
        },
      },
    },
    required: ["memberships", "queriesAttempted"],
  },
});
```

### Step 2: Track Recent Searches for ReadEmail

Need a cell to store recent search results so ReadEmail can access them:

```typescript
// Track recent email previews from searches (for ReadEmail tool)
const recentEmailPreviews = Cell.of<any[]>([]);
```

But wait - SearchGmailTool returns previews with `_fullContent`. How do we capture those?

**Problem:** SearchGmailTool is called by the agent, we don't directly see its output.

**Solution:** SearchGmailTool should UPDATE a shared cell with its results:
- Pass `emailCache` cell to SearchGmailTool
- SearchGmailTool writes to cache
- ReadEmailTool reads from same cache

OR simpler: **SearchGmailTool already stores `_fullContent`** in its return value. The agent sees this. ReadEmailTool just needs to reference the same emails.

Actually, thinking about this more carefully: The agent's tool call results are available in the agent's context. When the agent calls readEmail, it can reference emails from previous searchGmail calls because the LLM has that context.

But our ReadEmailTool needs actual email data, not just LLM context.

**Best approach:** Use emailCache cell as shared storage:
- SearchGmailTool writes emails to emailCache
- ReadEmailTool reads from emailCache
- Both tools take `cache: Cell<EmailCache>` as input

### Step 3: Update Tool Signatures

```typescript
export const SearchGmailTool = pattern((
  { query, authCharm, cache }: {
    query: string;           // DYNAMIC from LLM
    authCharm: any;          // STATIC
    cache: Cell<EmailCache>; // STATIC
  }
) => {
  // ... fetch emails ...
  // ... update cache ...
  return previews;  // Return previews to LLM
});

export const ReadEmailTool = pattern((
  { emailId, cache }: {
    emailId: string;         // DYNAMIC from LLM
    cache: Cell<EmailCache>; // STATIC
  }
) => {
  // ... read from cache ...
  return emailFull;
});
```

### Step 4: Save Handler

Keep existing `saveExtractionResults` handler but update it to work with agent result:

```typescript
const saveAgentResults = handler((_, state) => {
  const agentResult = agent.result;  // Get final result from agent

  if (!agentResult) return;

  // Extract memberships and queries from agent result
  const newMemberships = agentResult.memberships.map(m => ({
    ...m,
    id: `${m.hotelBrand}-${m.membershipNumber}-${Date.now()}`,
    extractedAt: Date.now(),
  }));

  // Update brandHistory based on queriesAttempted
  // ... existing logic ...

  state.memberships.set([...state.memberships.get(), ...newMemberships]);
  state.brandHistory.set(updatedHistory);
});
```

## Next: Implement!
