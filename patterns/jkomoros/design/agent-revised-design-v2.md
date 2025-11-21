# Agent Architecture - V2 Based on Latest Framework Feedback

## Latest Framework Author Clarification

**Original understanding:** Return entire emails as `any` → everything becomes @links

**Actual guidance:** "make the type of the email *body* any. That way it'll send a link for the body but still get the subject, etc"

**Key insight:**
- Email METADATA (subject, from, date, id) → visible directly to agent
- Email BODY (markdownContent, htmlContent, plainText) → type `any` → @links

**Why this matters:**
- Agent can see subjects/senders and FILTER emails without reading bodies
- Agent only calls read() on @links for emails that look promising
- Much more efficient than reading every email

## Current Problem

**Module Loading Error:** `gmail_importer_tsx_1 is not defined`

Imported classes (GmailClient, GmailFetcher) aren't available in compiled tool context.

## Root Cause Analysis

**What we've been trying:**
1. Import GmailClient/GmailFetcher classes → Module not defined at runtime
2. Import `process()` function → Uses GmailClient internally → Same error
3. Create GmailImporter inside tool → Pattern-within-pattern error

**The real issue:** Tools run in a compiled/restricted context where imports don't work the same way.

## Framework Dev's Actual Intent

**"SearchGmailTool should be thin wrapper around GmailImporter"**

This likely means:
- **Don't create a new GmailImporter inside the tool** (pattern-within-pattern ❌)
- **Reuse the existing GmailImporter** that's already in the main pattern
- Pass it as a STATIC input to the tool

## Revised Architecture

### Current Pattern Structure

```typescript
export default pattern({...}) => {
  // Gmail auth
  const authCharm = GmailAuth({ auth });

  // ONE GmailImporter instance for the whole pattern
  const importer = GmailImporter({
    settings: {
      gmailFilterQuery: autoQuery,  // Reactive query
      limit,
      historyId: "",
    },
    authCharm,
  });

  const emails = importer.emails;

  // Agent with tools
  const agent = generateObject({
    tools: {
      searchGmail: patternTool(SearchGmailTool, {
        gmailImporter: importer,  // Pass existing importer!
      }),
    },
  });

  return { ... };
};
```

### SearchGmailTool - NEW APPROACH

```typescript
type EmailPreview = {
  id: string;
  subject: string;
  from: string;
  date: string;
  to: string;
  snippet: string;
  // Body fields as cells (type any) → @links
  markdownContent: any;
  htmlContent: any;
  plainText: any;
};

export const SearchGmailTool = pattern<
  {
    query: string;  // DYNAMIC from agent
    gmailImporter: any;  // STATIC - the existing GmailImporter instance
  },
  EmailPreview[]
>(
  ({ query, gmailImporter }) => {
    // 1. Get importer's settings cell
    const settings = gmailImporter.settings || gmailImporter.bgUpdater?.state?.settings;

    // 2. Update query (triggers fetch via reactive derive in importer)
    // How? Importer's settings is reactive, changing it triggers fetch

    // 3. Read importer's emails
    return derive([gmailImporter.emails, query], ([emails, q]): EmailPreview[] => {
      if (!emails || emails.length === 0) return [];

      // 4. Transform: metadata visible, body as cells (@links)
      return emails.map(email => ({
        id: email.id,
        subject: email.subject,
        from: email.from,
        date: email.date,
        to: email.to,
        snippet: email.snippet,
        // Body fields as cells - framework converts to @links
        markdownContent: Cell.of(email.markdownContent) as any,
        htmlContent: Cell.of(email.htmlContent) as any,
        plainText: Cell.of(email.plainText) as any,
      }));
    });
  }
);
```

### How It Works

1. **Main pattern creates ONE GmailImporter** - this is the source of truth
2. **GmailImporter's query is already reactive** via `autoQuery` derived cell
3. **SearchGmailTool receives existing importer** as static input
4. **Tool reads importer.emails** and transforms them
5. **Returns email previews** with metadata visible, body as @links
6. **Agent sees:** `[{id, subject, from, date, body: @link}, ...]`
7. **Agent calls:** `read(@link)` on promising emails

### But Wait - How Does Query Update?

**Problem:** Agent calls `searchGmail({query: "from:marriott.com"})` but how does this update GmailImporter's query?

**Current pattern already has this!** The `autoQuery` derived cell:

```typescript
const autoQuery = derive(
  [queryResult, queryPending, isScanning, gmailFilterQuery],
  ([result, pending, scanning, manualQuery]) => {
    // During scanning, use LLM-generated query
    if (scanning && !pending && result && result.query !== "done") {
      return result.query;
    }
    // Otherwise use manual query
    return manualQuery;
  }
);

const importer = GmailImporter({
  settings: {
    gmailFilterQuery: autoQuery,  // ← Reactive!
    ...
  },
  authCharm,
});
```

**So the tool doesn't need to update the query!** It just:
1. Receives the query parameter from agent (for filtering/reference)
2. Reads whatever emails GmailImporter currently has
3. Could optionally filter them by the query (client-side)
4. Transforms and returns them

**But this breaks the dynamic search capability...**

The agent wants to try DIFFERENT queries. If we only return emails from ONE query at a time, the agent can't explore.

## Alternative: Tool Triggers Query Update

Maybe SearchGmailTool should:
1. Update some cell that triggers query generation
2. Wait for GmailImporter to fetch
3. Return the results

But this gets complex with timing/reactivity...

## Simplest Approach: Tool as Filter Only

**What if we accept a limitation:**
- GmailImporter fetches a BROAD set of emails once (e.g., "hotel" or "from:*.com")
- SearchGmailTool filters those emails by query (client-side)
- Agent refines its search by trying different search terms

```typescript
export const SearchGmailTool = pattern<
  { query: string; gmailImporter: any },
  EmailPreview[]
>(({ query, gmailImporter }) => {
  return derive([gmailImporter.emails, query], ([emails, q]): EmailPreview[] => {
    if (!emails) return [];

    // Client-side filter by query
    const filtered = emails.filter(email => {
      const searchText = `${email.subject} ${email.from} ${email.snippet}`.toLowerCase();
      return searchText.includes(q.toLowerCase());
    });

    // Transform to have body as @links
    return filtered.map(email => ({
      id: email.id,
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
```

**Pros:**
- Simple
- No timing/reactivity issues
- Reuses existing GmailImporter
- No pattern-within-pattern
- No module loading issues

**Cons:**
- Can't do server-side Gmail query filtering
- Limited to emails already fetched
- Agent can't try "from:marriott.com" vs "from:hilton.com" at Gmail API level

## Better Approach: Separate Importer Per Query

Actually wait - what if SearchGmailTool DOES create a GmailImporter, but as a SUB-PATTERN of the tool itself?

No, that's pattern-within-pattern which causes the error.

## REAL Solution: Recipe Instead of Pattern?

Framework dev said we CAN use recipes. What if SearchGmailTool is a RECIPE not a PATTERN?

Actually no, they said "Specify return type as second type parameter: `pattern<Input, Output>`" - so it should be a pattern.

## Stepping Way Back

Let me reconsider what "thin wrapper around GmailImporter" means.

Maybe it means: Use the same BACKGROUND HANDLER mechanism that GmailImporter uses (`googleUpdater`), but call it directly?

GmailImporter exports:
- `process()` function - does the actual Gmail API calls
- `GmailClient` class - handles API requests
- `GmailFetcher` class - wraps fetching logic

The tool could use `process()` directly... but we tried this and got module loading errors.

## The Real Answer

I think the issue is that we need to ask the framework author for clarification on HOW to make dynamic Gmail queries work in a tool without pattern-within-pattern or module loading issues.

The current approaches we've tried:
1. ❌ Instantiate GmailImporter in tool → pattern-within-pattern error
2. ❌ Import and use GmailClient/GmailFetcher → module not defined at runtime
3. ❌ Import and use process() → uses GmailClient internally → same error
4. ❓ Pass existing GmailImporter and update its query → timing/reactivity complex
5. ❓ Pass existing GmailImporter and filter client-side → loses server-side query power

## Proposed Plan

**Document the situation and ask user/framework dev:**

1. **Goal:** Agent needs to try different Gmail queries (from:marriott.com, from:hilton.com, etc.)
2. **Constraint:** Can't instantiate GmailImporter inside tool (pattern-within-pattern)
3. **Constraint:** Can't import/use classes at runtime (module loading error)
4. **Question:** How should SearchGmailTool dynamically fetch emails with different queries?

**Possible solutions to explore:**
- Make SearchGmailTool a recipe instead of pattern?
- Use a different import mechanism?
- Structure the code differently to avoid module issues?
- Accept client-side filtering limitation?

## FINAL SOLUTION: Shared Cell Architecture

**Key Insight:** GmailImporter ALREADY supports dynamic queries via reactive cells! We just need to share a cell between the tool and the importer.

### Architecture

```typescript
// Main pattern
const agentQueryCell = cell<string>("");  // Shared query cell

const importer = GmailImporter({
  settings: {
    gmailFilterQuery: agentQueryCell,  // ← Reactive! Updates trigger fetch
    limit: Cell.of(20),
    historyId: Cell.of(""),
  },
  authCharm,
});

const agent = generateObject({
  tools: {
    searchGmail: patternTool(SearchGmailTool, {
      queryCell: agentQueryCell,      // STATIC: To update query
      emailsCell: importer.emails,    // STATIC: To read results
    }),
  },
});
```

### SearchGmailTool Implementation

```typescript
type EmailPreview = {
  id: string;
  subject: string;
  from: string;
  date: string;
  to: string;
  snippet: string;
  // Body fields as `any` → @links
  markdownContent: any;
  htmlContent: any;
  plainText: any;
};

export const SearchGmailTool = pattern<
  {
    query: string;              // DYNAMIC from agent
    queryCell: Cell<string>;    // STATIC shared cell
    emailsCell: Cell<Email[]>;  // STATIC emails from importer
  },
  EmailPreview[]
>(({ query, queryCell, emailsCell }) => {
  // 1. Update shared query cell → triggers GmailImporter to fetch
  queryCell.set(query);

  // 2. Return transformed emails (reactive - updates when fetch completes)
  return derive(emailsCell, (emails): EmailPreview[] => {
    if (!emails) return [];

    return emails.map(email => ({
      // Metadata visible to agent
      id: email.id,
      subject: email.subject,
      from: email.from,
      date: email.date,
      to: email.to,
      snippet: email.snippet,
      // Body content as cells (type any) → framework converts to @links
      markdownContent: Cell.of(email.markdownContent) as any,
      htmlContent: Cell.of(email.htmlContent) as any,
      plainText: Cell.of(email.plainText) as any,
    }));
  });
});
```

### How It Works

1. **Agent calls:** `searchGmail({ query: "from:marriott.com" })`
2. **Tool updates:** `queryCell.set("from:marriott.com")`
3. **GmailImporter reacts:** Sees query changed → fetches from Gmail API
4. **Tool's derive:** Re-evaluates when `emailsCell` updates with new emails
5. **Returns:** Email previews with metadata visible, body as @links
6. **Agent sees:** `[{id, subject, from, date, snippet, body: @link}, ...]`
7. **Agent filters:** Can see subjects/senders without reading bodies
8. **Agent reads:** Calls `read(@link)` on promising emails

### Benefits

✅ **Full dynamic Gmail queries** - Agent can try "from:marriott.com", "from:hilton.com", etc.
✅ **No pattern-within-pattern** - Tool just updates a cell and reads another
✅ **No module loading issues** - No imports of classes, uses existing importer
✅ **Fully reactive** - GmailImporter's existing machinery handles fetch
✅ **Metadata visible, body as @links** - Agent can filter before reading
✅ **Simple and clean** - Leverages framework's reactive cell system

### Implementation Plan

1. Create `agentQueryCell` in main pattern
2. Update GmailImporter to use `agentQueryCell` instead of `autoQuery`
3. Rewrite SearchGmailTool to use shared cell approach
4. Update agent tools registration to pass both cells
5. Test: Agent tries different queries
6. Verify: Email bodies become @links
7. Verify: Agent can read() the @links
8. Test: End-to-end membership extraction
