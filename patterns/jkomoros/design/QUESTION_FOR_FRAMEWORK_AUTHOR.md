# Question: Dynamic Tool Calls That Trigger Data Fetches

## Goal

We want an LLM agent with a `searchGmail(query)` tool where:
1. Agent calls `searchGmail({ query: "from:marriott.com" })`
2. Tool updates a shared cell → triggers GmailImporter to fetch from Gmail API
3. Tool returns fetched emails (metadata visible, body as @links)
4. Agent can try different queries dynamically

## Desired Architecture

```typescript
// Shared query cell
const agentQueryCell = cell<string>("");

// GmailImporter reacts to query changes
const agentGmailImporter = GmailImporter({
  settings: {
    gmailFilterQuery: agentQueryCell,  // Reactive - updates trigger fetch
    limit: Cell.of(20),
    historyId: Cell.of(""),
  },
  authCharm,
});

// Tool that updates query and returns emails
const SearchGmailTool = ???  // How to implement this?

const agent = generateObject({
  tools: {
    searchGmail: SearchGmailTool,  // Agent can call this dynamically
  },
  ...
});
```

## What We've Tried

### Attempt 1: Pattern with cell.set() ❌
```typescript
export const SearchGmailTool = pattern<{ query: string; queryCell: Cell<string> }, EmailPreview[]>(
  ({ query, queryCell }) => {
    queryCell.set(query);  // ❌ ERROR: "Tried to directly access an opaque value"
    return derive(emailsCell, ...);
  }
);
```

**Issue:** Patterns can't have side effects. Can't call `cell.set()` in pattern body.

### Attempt 2: Handler ✅ (Compiles, but will it work as a tool?)
```typescript
export const SearchGmailTool = handler<
  { query: string },
  { queryCell: Cell<string>; emailsCell: Cell<Email[]> }
>((input, state) => {
  state.queryCell.set(input.query);  // ✅ Handlers CAN have side effects
  const emails = state.emailsCell.get();
  return emails.map(email => ({
    ...email,
    markdownContent: Cell.of(email.markdownContent) as any,  // @links
  }));
});

// Bind with shared cells
const boundSearchGmail = SearchGmailTool({
  queryCell: agentQueryCell,
  emailsCell: agentGmailImporter.emails,
});

// Register as tool
const agent = generateObject({
  tools: {
    searchGmail: boundSearchGmail,  // Will this work?
  },
  ...
});
```

**Status:**
- ✅ Compiles successfully
- ✅ Deploys successfully
- ❓ Unknown: Can generateObject use a handler as a tool?
- ❓ Unknown: Will the LLM be able to call it?
- ❓ Unknown: Will returned @links work correctly?

### Attempt 3: Client-side filtering ✅ (Works but limited)
```typescript
// Pre-fetch broad set of emails once
const agentGmailImporter = GmailImporter({
  settings: {
    gmailFilterQuery: Cell.of("hotel OR marriott OR hilton"),
    limit: Cell.of(100),
  },
  authCharm,
});

// Tool filters client-side
export const SearchGmailTool = pattern<{ query: string; emailsCell: Cell<Email[]> }, EmailPreview[]>(
  ({ query, emailsCell }) => {
    const queryCell = Cell.of(query);
    return derive([emailsCell, queryCell], ([emails, q]) => {
      return emails.filter(email =>
        email.subject.toLowerCase().includes(q.toLowerCase())
      ).map(...);
    });
  }
);
```

**Status:** ✅ Works perfectly BUT:
- ❌ Can't do dynamic server-side Gmail API queries
- ❌ Limited to 100 pre-fetched emails
- ❌ Much less powerful than the vision

## Questions

1. **Can handlers be used as tools for `generateObject`?**
   - We've successfully bound a handler and passed it to `tools: { searchGmail: boundHandler }`
   - Will the LLM be able to call this?
   - Will the framework properly invoke the handler?

2. **Is there a different pattern for tools that need to trigger side effects?**
   - Like updating a cell that triggers a data fetch
   - Then reading and returning the fetched data

3. **Should we use `patternTool()` wrapper?**
   - We tried: `patternTool(SearchGmailTool, { queryCell, emailsCell })`
   - But that expects a pattern, not a handler

4. **Is there a better architecture for "tool calls trigger fetches"?**
   - Maybe using handlers differently?
   - Maybe a different reactive pattern?

## What We Need

A way for agent tool calls to:
1. Update a reactive cell (trigger side effect)
2. Read data that was fetched reactively
3. Return that data to the agent
4. Support dynamic parameters from the agent

## Current Blocker

We have a handler-based implementation that compiles and deploys, but we don't know if it will actually work when the agent tries to call it. If handlers can't be used as tools, we need guidance on the correct pattern.

## Fallback

If dynamic queries aren't possible, we'll use client-side filtering (Attempt 3), but this significantly limits the power of the agent.
