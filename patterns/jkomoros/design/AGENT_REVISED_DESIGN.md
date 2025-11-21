# Agent Architecture - REVISED Based on Framework Dev Feedback

## Framework Developer's Guidance

**Original proposal:** SearchGmailTool caches emails, ReadEmailTool reads from cache, tools coordinate via shared cell

**Framework dev says:**
1. ❌ Don't do caching in the tool
2. ❌ Don't need custom ReadEmailTool
3. ✅ SearchGmailTool should be thin wrapper around GmailImporter
4. ✅ Specify return type as second type parameter: `pattern<Input, Output>`
5. ✅ Make emails return type `any` → framework outputs as @link references
6. ✅ LLM uses built-in cell reading tools to read those links

## How Framework's @link System Works

When a pattern returns type `any`:
1. Framework converts cell references to `@link` format
2. LLM sees: `[{"@link": "/of:abc123/emails/0"}, {"@link": "/of:abc123/emails/1"}, ...]`
3. LLM can use **built-in cell reading tools** to read those links
4. No custom ReadEmailTool needed!

**Example:**
```
Agent: Let me search for Marriott emails
Agent calls: searchGmail({ query: "from:marriott.com" })
Tool returns: [{"@link": "/of:abc/email/0"}, {"@link": "/of:abc/email/1"}, ...]

Agent: I see 20 emails. Let me read the first one that looks promising
Agent calls: read({ path: "/of:abc/email/0" })  // Built-in tool!
Tool returns: { subject: "Your Marriott Bonvoy Account", content: "..." }

Agent: Found membership number 123456789
Agent calls: finalResult({ memberships: [...] })
```

## Revised Architecture

### 1. SearchGmailTool - SIMPLIFIED

**Before (wrong):**
- Wrapped GmailImporter
- Cached emails in emailCache cell
- Returned previews only
- Complex cache coordination

**After (correct):**
```typescript
export const SearchGmailTool = pattern<
  { query: string; authCharm: any },  // Input type
  any                                  // Output type (`any` triggers @link conversion)
>(
  ({ query, authCharm }) => {
    // Thin wrapper around GmailImporter
    const importer = GmailImporter({
      settings: {
        gmailFilterQuery: Cell.of(query),
        limit: Cell.of(20),
        historyId: Cell.of(""),
      },
      authCharm,
    });

    // Return emails directly - framework converts to @links
    return derive(importer.emails, (emails): any => emails || []);
  }
);
```

**What happens:**
- Tool fetches emails via GmailImporter
- Returns array of email objects
- Framework sees return type `any`, converts to `@link` references
- LLM receives links, not full content
- LLM uses built-in tools to read specific emails

### 2. ReadEmailTool - REMOVED

**Not needed!** Framework provides built-in cell reading tools.

Agent can directly read email links using built-in `read` tool.

### 3. EmailCache - REMOVED

**Not needed!** No custom caching. Framework handles cell storage.

Emails exist as cells in the pattern graph. Framework manages them.

### 4. Agent Setup - SIMPLIFIED

```typescript
const agent = generateObject({
  system: `You are a hotel membership extractor.

  Strategy:
  1. Use searchGmail to search for hotel emails
  2. Analyze the email links returned (subjects, senders)
  3. Use the built-in read tool to read promising emails
  4. Extract membership numbers
  5. Refine queries if needed

  Brands to search: Marriott, Hilton, Hyatt, IHG, Accor`,

  prompt: derive([brandHistory, memberships, isScanning], ([history, found, scanning]) => {
    if (!scanning) return "";

    return `Current progress:
- Brands searched: ${history.map(h => `${h.brand} (${h.status})`).join(", ")}
- Memberships found: ${found.length}

Search for hotel membership numbers in Gmail.`;
  }),

  tools: {
    // Only ONE custom tool - framework provides read tool automatically
    searchGmail: patternTool(SearchGmailTool, { authCharm }),
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
            sourceEmailSubject: { type: "string" },
            sourceEmailDate: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["hotelBrand", "programName", "membershipNumber", "confidence"],
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

**Key difference:** Only register `searchGmail`. Framework automatically provides tools for reading cells (the @link references).

## What Changed vs Original Design

| Aspect | Original Design | Revised Design |
|--------|----------------|----------------|
| SearchGmailTool | Complex: fetch + cache + return previews | Simple: thin wrapper, return emails as `any` |
| ReadEmailTool | Custom pattern reading from cache | ❌ Deleted - use built-in read tool |
| EmailCache | Custom FIFO cache cell | ❌ Deleted - framework handles via cells |
| Tool coordination | Via shared cache cell | Via @link references + built-in tools |
| Agent tools | `{ searchGmail, readEmail }` | `{ searchGmail }` only |
| Complexity | High - custom caching + coordination | Low - leverage framework features |

## Benefits of Revised Approach

1. **Simpler code** - No custom caching logic
2. **Less state management** - Framework handles cell storage
3. **Framework idiomatic** - Uses @link system as designed
4. **Built-in tools** - Leverage existing read/write tools
5. **Less code to maintain** - Delete ReadEmailTool, delete cache logic

## Implementation Checklist

- [ ] Rewrite SearchGmailTool as thin wrapper (return type `any`)
- [ ] Delete ReadEmailTool pattern (not needed)
- [ ] Remove emailCache from pattern input (not needed)
- [ ] Remove EmailCache interfaces (not needed)
- [ ] Update agent to only register searchGmail tool
- [ ] Test that agent can use built-in read tool for @links
- [ ] Update save handler to process agent.result
- [ ] Test end-to-end workflow

## Questions for Framework Dev (if needed)

1. ✅ Should SearchGmailTool return `importer.emails` directly or derive it first?
   - **Answer:** Derive it to unwrap the cell, type as `any`

2. ✅ Do I need to do anything special for built-in read tool to work?
   - **Answer:** No, it's automatic when return type is `any`

3. ✅ How does agent know to use read tool vs other built-in tools?
   - **Answer:** LLM sees @link format and knows it can read cells
