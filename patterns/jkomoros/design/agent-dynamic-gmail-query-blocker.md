# Agent Tool for Dynamic Gmail Queries - Framework Blocker

**Date:** 2025-11-21
**Status:** BLOCKED - Need framework guidance

## Use Case

Building an agent that searches Gmail for hotel membership numbers. The agent needs to:

1. **Try different queries dynamically** - Agent decides which Gmail queries to try based on what it finds
2. **Call server-side Gmail API** - GmailImporter handles auth, token refresh, parsing (must stay server-side)
3. **Wait for async results** - Gmail fetch is async, tool must wait and return results to agent

**Example agent workflow:**
- Agent tries: `"from:marriott.com"`
- Gets 50 emails back
- Sees mostly promotional content
- Refines: `"from:marriott.com subject:(account OR membership)"`
- Gets 3 relevant emails
- Extracts membership numbers

## The Problem

How should an agent tool call GmailImporter with dynamic queries?

GmailImporter is:
- A pattern (not a simple function)
- Server-side (handles OAuth tokens, Gmail API calls, rate limiting)
- Async/reactive (fetches then updates cells)

Agent needs:
- Each tool call to use a different query string
- Results to wait for async fetch to complete
- To work like other tools (searchWeb, readWebpage)

## Existing Reference: searchWeb

Here's how searchWeb works in `common-tools.tsx`:

```typescript
export const searchWeb = recipe<
  SearchQuery,
  SearchWebResult | { error: string }
>(({ query }) => {
  const { result, error } = fetchData<SearchWebResult>({
    url: "/api/agent-tools/web-search",
    mode: "json",
    options: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        query,
        max_results: 5,
      },
    },
  });

  return ifElse(error, { error }, result);
});

// Used in tools:
const tools = {
  search_web: {
    pattern: searchWeb,
  },
};
```

This works because:
- `fetchData()` is a built-in that makes async HTTP calls
- Returns reactive `{result, error, pending}`
- Agent framework automatically waits for `pending` to become false

**Problem:** GmailImporter can't be replaced with simple `fetchData()` because it:
- Runs server-side (tokens never exposed to browser)
- Does complex work: token refresh, message parsing, rate limiting
- Requires background updater to function

## What We've Tried

### Approach 1: Handler with Shared Cell

**Idea:** Handler updates shared query cell → triggers GmailImporter fetch → reads results

**Full Code:**

```typescript
// Tool definition
export const SearchGmailTool = handler<
  { query: string },
  {
    queryCell: Cell<string>;
    emailsCell: Cell<Email[]>;
  }
>((input, state) => {
  console.log(`[SearchGmailTool] Agent requested query: "${input.query}"`);

  // 1. Update shared query cell → triggers GmailImporter to fetch
  state.queryCell.set(input.query);
  console.log(`[SearchGmailTool] Updated queryCell to: "${input.query}"`);

  // 2. Read current emails from shared cell
  const emails = state.emailsCell.get();

  console.log(`[SearchGmailTool] Current emails in cell: ${emails?.length || 0}`);

  if (!emails || !Array.isArray(emails)) {
    console.log("[SearchGmailTool] No emails available yet");
    return [];
  }

  // 3. Transform: metadata visible, body as @links
  return emails.map(email => ({
    id: email.id,
    threadId: email.threadId,
    subject: email.subject,
    from: email.from,
    date: email.date,
    to: email.to,
    snippet: email.snippet,
    markdownContent: Cell.of(email.markdownContent) as any,
    htmlContent: Cell.of(email.htmlContent) as any,
    plainText: Cell.of(email.plainText) as any,
  }));
});

// Pattern setup
const agentQueryCell = cell<string>("");

const agentGmailImporter = GmailImporter({
  settings: {
    gmailFilterQuery: agentQueryCell,  // Reactive - updates trigger fetch
    limit: Cell.of(20),
    historyId: Cell.of(""),
  },
  authCharm,
});

const boundSearchGmail = SearchGmailTool({
  queryCell: agentQueryCell,
  emailsCell: agentGmailImporter.emails,
});

const agentTools = {
  searchGmail: {
    description: "Search Gmail with a query string...",
    handler: boundSearchGmail,
  },
};
```

**Result:** ❌ **Timing Issue**

Console logs from test:
```
[SearchGmailTool] Agent requested query: "from:marriott.com"
[SearchGmailTool] Updated queryCell to: "from:marriott.com"
[SearchGmailTool] Current emails in cell: 0
```

This pattern repeated 23 times - every single query returned 0 emails.

**Root Cause:**
1. Handler executes synchronously within a transaction
2. Handler calls `state.queryCell.set(input.query)` - marks cell as changed
3. Handler immediately calls `state.emailsCell.get()` - gets current (stale) value
4. Handler returns
5. **Transaction commits**
6. **Reactive system processes changes** - GmailImporter reacts to queryCell change
7. GmailImporter fetches from Gmail (async)
8. Emails arrive in emailsCell - **but handler already returned**

The handler cannot wait because reactive computations don't start until after the handler's transaction commits.

---

### Approach 2: Handler with Polling

**Idea:** Poll inside handler until emails arrive or timeout

**Full Code (addition to Approach 1):**

```typescript
export const SearchGmailTool = handler<
  { query: string },
  {
    queryCell: Cell<string>;
    emailsCell: Cell<Email[]>;
  }
>((input, state) => {
  console.log(`[SearchGmailTool] Agent requested query: "${input.query}"`);

  // 1. Update shared query cell → triggers GmailImporter to fetch
  state.queryCell.set(input.query);
  console.log(`[SearchGmailTool] Updated queryCell to: "${input.query}"`);

  // 2. Wait for emails to arrive (polling with timeout)
  const maxWaitMs = 5000; // Wait up to 5 seconds
  const pollIntervalMs = 200; // Check every 200ms
  const startTime = Date.now();

  let emails = state.emailsCell.get();
  let attempts = 0;

  // Poll until we get emails or timeout
  while ((Date.now() - startTime) < maxWaitMs) {
    emails = state.emailsCell.get();
    attempts++;

    // If we have emails, break out
    if (emails && Array.isArray(emails) && emails.length > 0) {
      console.log(`[SearchGmailTool] Got ${emails.length} emails after ${Date.now() - startTime}ms (${attempts} attempts)`);
      break;
    }

    // Busy-wait for pollIntervalMs
    const pollStart = Date.now();
    while (Date.now() - pollStart < pollIntervalMs) {
      // Busy wait
    }
  }

  const finalEmails = state.emailsCell.get();
  console.log(`[SearchGmailTool] Final result: ${finalEmails?.length || 0} emails after ${Date.now() - startTime}ms`);

  if (!finalEmails || !Array.isArray(finalEmails) || finalEmails.length === 0) {
    console.log("[SearchGmailTool] No emails found (or timeout)");
    return [];
  }

  // 3. Transform: metadata visible, body as @links
  return finalEmails.map(email => ({
    id: email.id,
    threadId: email.threadId,
    subject: email.subject,
    from: email.from,
    date: email.date,
    to: email.to,
    snippet: email.snippet,
    markdownContent: Cell.of(email.markdownContent) as any,
    htmlContent: Cell.of(email.htmlContent) as any,
    plainText: Cell.of(email.plainText) as any,
  }));
});
```

**Result:** ❌ **Still Times Out - Same Issue**

Console logs from test:
```
[SearchGmailTool] Final result: 0 emails after 5000ms
[SearchGmailTool] No emails found (or timeout)
```

All 23 queries timed out after 5 seconds with 0 emails.

**Root Cause:**
Polling doesn't help because:
- Handler executes within a transaction
- Reactive fetch **cannot start** until transaction commits
- Handler can poll forever, but emails will **never arrive during handler execution**
- Emails only arrive **after** handler returns and transaction commits

---

### Approach 3: Recipe Creating GmailImporter

**Idea:** Use recipe (like searchWeb), instantiate GmailImporter per query

**Full Code:**

```typescript
export const SearchGmailTool = recipe<
  { query: string; authCharm: any },
  EmailPreview[]
>(({ query, authCharm }) => {
  // Create importer directly with reactive query cell
  // Each recipe invocation gets its own importer instance
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery: query,  // Pass query cell directly (reactive)
      limit: Cell.of(20),
      historyId: Cell.of(""),
    },
    authCharm,  // Pass authCharm directly (reactive)
  });

  // Transform emails from importer - returns reactive value
  // Agent framework waits for this cell to populate
  return derive(importer.emails, (emailsList) => {
    const count = emailsList?.length || 0;
    console.log(`[SearchGmailTool] Returning ${count} emails`);

    if (!emailsList || !Array.isArray(emailsList)) return [];

    return emailsList.map((email: Email) => ({
      id: email.id,
      threadId: email.threadId,
      subject: email.subject,
      from: email.from,
      date: email.date,
      to: email.to,
      snippet: email.snippet,
      markdownContent: Cell.of(email.markdownContent) as any,
      htmlContent: Cell.of(email.htmlContent) as any,
      plainText: Cell.of(email.plainText) as any,
    }));
  });
});

// Pattern setup
const agentTools = {
  searchGmail: {
    description: "Search Gmail with a query string...",
    pattern: SearchGmailTool,
    args: { authCharm },  // Provide authCharm as static arg
  },
};
```

**Result:** ❌ **Framework Error: "Invalid recipe"**

Browser console errors:
```
Tool searchGmail failed: Error: Invalid recipe
    at Runner.instantiateRecipeNode (http://localhost:8000/scripts/index.js:...)
```

**Root Cause:**
Framework doesn't allow patterns to instantiate other patterns in this context. GmailImporter is a pattern, and calling it from within SearchGmailTool recipe causes "Invalid recipe" error.

---

## Question for Framework Author

**How should an agent tool dynamically query Gmail using GmailImporter?**

Requirements:
- ✅ Agent provides different query string each call
- ✅ GmailImporter runs server-side (OAuth, parsing, rate limiting)
- ✅ Tool waits for async Gmail fetch to complete
- ✅ Tool returns results to agent

Current blockers:
- ❌ Handlers can't wait for reactive fetches (transaction-based)
- ❌ Recipes can't instantiate patterns ("Invalid recipe")
- ❌ Shared cell has timing issues

**Possible solutions we haven't tried:**
1. Is there a way to make handlers async/wait for reactive updates?
2. Is there a different tool pattern for pattern-calling-pattern?
3. Should GmailImporter be refactored into a different primitive?
4. Is there a server-side API endpoint pattern we should use instead?

## Test Space

Current test deployment:
- Space: `hotel-test-recipe`
- Charm ID: `baedreifrk5mbsensnsqqaj53fjjs3sali7km444yby6oba2h6cbv6phtfy`
- URL: http://localhost:8000/hotel-test-recipe/baedreifrk5mbsensnsqqaj53fjjs3sali7km444yby6oba2h6cbv6phtfy

Files:
- Main pattern: `patterns/jkomoros/hotel-membership-extractor.tsx`
- This doc: `patterns/jkomoros/design/agent-dynamic-gmail-query-blocker.md`
- Previous attempts: `patterns/jkomoros/design/hotel-membership-agent-implementation.md`
