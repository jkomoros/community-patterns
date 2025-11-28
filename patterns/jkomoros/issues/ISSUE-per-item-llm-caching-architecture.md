# Per-Item LLM Caching Architecture

## Summary

Seeking guidance on the idiomatic way to process a dynamic array of items through per-item LLM calls with framework caching, triggered by a single user action.

**Pattern:** prompt-injection-tracker
**Use case:** Process Google Alert emails → fetch article content → extract security report links via LLM → fetch reports → summarize via LLM → save reports

## Goals

### 1. Per-Item LLM Caching
Each article should have its own `generateObject` call so that:
- Same article content = cached LLM result (instant)
- New articles = fresh LLM call
- Re-running the pipeline on same data costs $0 and is fast

### 2. Per-URL Web Fetch Caching
Each URL fetch should be cached:
- Same URL = cached content
- This ensures LLM prompts are character-by-character identical

### 3. Single User Action
User clicks ONE button → entire pipeline runs:
1. Fetch web content for all articles (parallel, cached)
2. LLM extracts links from each article (per-item, cached)
3. Dedupe and identify novel report URLs
4. Fetch novel report content (parallel)
5. LLM summarizes reports
6. Save to reports array

### 4. Progress Visibility
UI shows progress as pipeline runs (X/N articles processed, etc.)

---

## Research Findings

### ✅ CONFIRMED: Server-Side LLM Caching Works for Raw Fetch

After reviewing the toolshed codebase, **LLM caching happens at the HTTP endpoint level**, meaning raw `fetch()` requests DO benefit from caching.

**Source:** `~/Code/labs/packages/toolshed/routes/ai/llm/cache.ts` and `llm.handlers.ts`

**How it works:**
1. Cache key = SHA-256 hash of request payload (excluding `cache` and `metadata` fields)
2. Cache includes: `messages`, `system`, `model`, `stopSequences`, `tools`, `maxTokens`, `schema`
3. Cache storage: `./cache/llm-api-cache/{sha256-hash}.json`
4. Cache is enabled by default (`cache: true`)

**Key code from `llm.handlers.ts` (lines 143-157):**
```typescript
const shouldCache = payload.cache === true;

let cacheKey: string | undefined;
if (shouldCache) {
  cacheKey = await hashKey(
    JSON.stringify(removeNonCacheableFields(payload)),
  );
  // First, check whether the request is cached, if so return the cached result
  const cachedResult = await loadFromCache(cacheKey);
  if (cachedResult) {
    const lastMessage = cachedResult.messages[cachedResult.messages.length - 1];
    return c.json(lastMessage);  // Returns JSON, not stream
  }
}
```

**Implication:** Architecture B (imperative handler with raw fetch) WILL get per-item caching! The cache key is deterministic based on request content.

---

### ✅ CONFIRMED: Agentic Tool Calls Cache Full Conversation, NOT Individual Calls

**Source:** `~/Code/labs/packages/toolshed/routes/ai/llm/llm.handlers.ts` (lines 129-142)

The framework caches the **full multi-turn conversation**, not individual tool calls:

```typescript
// Enable caching for all requests including those with tools.
// With the sequential request architecture, each request includes complete context
// (including tool results from previous rounds), making each response cacheable.
//
// Cache key naturally includes:
// - Original user message
// - Tool definitions
// - Tool results (in messages array for subsequent rounds)
// - Full conversation history
```

**Implication for Architecture E (Agentic Loop):**
- ❌ Individual tool calls are NOT cached separately
- ✅ If the agent runs the exact same sequence with same tool results, the full conversation is cached
- ⚠️ Non-deterministic tools (like searching Gmail which might return different emails) will produce different cache keys
- ❌ **NOT suitable for per-item LLM caching** - agent might vary its prompts or call order

---

### ✅ CONFIRMED: Cell.map() Returns OpaqueRef, NOT Array

**Source:** `~/Code/labs/packages/runner/src/cell.ts` (lines 1147-1169)

**Root cause of Architecture A failure:**

`Cell.map()` returns `OpaqueRef<S[]>` (a reactive cell reference), NOT a plain JavaScript array:

```typescript
// From api/index.ts - IDerivable interface
map<S>(fn: (element, index, array) => Opaque<S>): OpaqueRef<S[]>;  // Returns OpaqueRef!
```

**This explains the TypeError:**
```typescript
// What we wrote:
const articleLinkExtractions = articlesWithContent.map((article) => {
  return generateObject({...});  // Returns {result, pending, error}
});

// What we expected: Array<{result, pending, error}>
// What we got: OpaqueRef<Array<{result, pending, error}>>  ← Can't access .pending directly!
```

**Why the docs example works:**
```typescript
const articles: Article[] = [...];  // Plain JavaScript array
const extractions = articles.map((article) => generateObject({...}));
// ↑ This is Array.prototype.map(), returns plain array
```

**Why our code fails:**
```typescript
const articlesWithContent = derive(...);  // Returns Cell
const extractions = articlesWithContent.map(...);
// ↑ This is Cell.map(), returns OpaqueRef<S[]>, NOT Array<S>
```

**Key insight:** The docs example uses a **plain JavaScript array**, not a Cell. When mapping over a Cell, you get a Cell back, not an array of generateObject results.

---

## What Works (from official docs)

Per LLM.md, this pattern SHOULD work for per-item LLM calls:

```typescript
const articles: Article[] = [...];

const extractions = articles.map((article) => ({
  article,
  extraction: generateObject<ExtractionResult>({
    prompt: `Title: ${article.title}\n\n${article.content}`,
    system: "Extract security report links from this article.",
  }),
}));
```

## What We've Tried That Doesn't Work

### Attempt 1: generateObject inside derive().map()

```typescript
// articlesWithContent is derived from parsedArticles + webPageCache
const articlesWithContent = derive(
  [parsedArticles, webPageCache] as const,
  ([articles, cache]) => {
    return articles
      .filter(a => cache[a.articleURL])
      .map(a => ({
        ...a,
        articleContent: cache[a.articleURL].content,
      }));
  }
);

// Try to create per-article generateObject calls
const articleLinkExtractions = articlesWithContent.map((article) => {
  return generateObject({
    system: LINK_EXTRACTION_SYSTEM,
    prompt: derive(article, (a) => {
      if (!a?.articleContent) return "";
      return JSON.stringify({
        articleURL: a.articleURL,
        articleContent: a.articleContent,
        title: a.title,
      });
    }),
    model: "anthropic:claude-sonnet-4-5",
    schema: SINGLE_ARTICLE_EXTRACTION_SCHEMA,
  });
});
```

**Result:** `TypeError: Cannot read properties of undefined (reading 'pending')`

**Hypothesis:** The result of `articlesWithContent.map()` isn't an array of `{result, pending, error}` objects. Perhaps calling `generateObject` inside `.map()` on a derived array doesn't work the same as in the docs example?

### Attempt 2: Imperative handler with raw fetch()

```typescript
const processAllArticles = handler(async (_, { articlesWithContent, ... }) => {
  for (const article of articlesWithContent) {
    const result = await fetch("/api/ai/llm/generateObject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: LINK_EXTRACTION_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(article) }],
        model: "anthropic:claude-sonnet-4-5",
        schema: singleArticleSchema,
      }),
    });
    // ... process result
  }
});
```

**Result:** Works functionally, and:
- ✅ **CONFIRMED:** Server-side LLM caching DOES apply to raw fetch requests!
- ⚠️ Not idiomatic (bypasses reactive generateObject)
- ✅ Can update progress cells during execution

### Attempt 3: Trigger cells for reactive generateObject

```typescript
const linkExtractionTrigger = cell<string>("");

const { result, pending } = generateObject({
  system: LINK_EXTRACTION_SYSTEM,
  prompt: linkExtractionTrigger,  // Set from handler
  ...
});

// Handler sets trigger to kick off LLM
const startProcessing = handler(async (_, { linkExtractionTrigger }) => {
  linkExtractionTrigger.set(JSON.stringify(articleBatch));
});
```

**Result:** Works for batched processing, but:
- ❌ Batches all articles into one LLM call (no per-item caching)
- ✅ Uses reactive generateObject (idiomatic)
- ⚠️ Requires multiple button clicks for multi-phase pipeline

---

## Potential Architectures

### Architecture A: Reactive Per-Item ❌ BLOCKED (Cell.map issue)

```
parsedArticles (derive from emails)
        ↓
articlesWithContent (derive joining with webPageCache)
        ↓
articlesWithContent.map(article => generateObject({...}))  ← RETURNS OpaqueRef, NOT Array!
        ↓
linkExtractionProgress (derive tracking pending/completed)  ← TypeError here
        ↓
novelReportURLs (derive collecting results)
```

**Root Cause (CONFIRMED):**
`Cell.map()` returns `OpaqueRef<S[]>`, not `Array<S>`. So `articlesWithContent.map(...)` returns a Cell, not an array of `{result, pending, error}` objects. Accessing `.pending` on a Cell throws TypeError.

**Pros:**
- Would be fully reactive (one button, automatic updates)
- Would get per-item LLM caching
- Framework would handle all the complexity

**Cons:**
- ❌ `Cell.map()` returns `OpaqueRef`, not array - can't access individual item properties
- ❌ Docs example uses plain array, not Cell - different behavior

**Question:** Is there a way to use `Cell.map()` with `generateObject` and properly access the individual `{result, pending, error}` objects?

---

### Architecture B: Imperative Handler with fetch() ✅ CACHING WORKS

```
User clicks button
        ↓
handler runs async loop:
  for each article:
    await fetch("/api/ai/llm/generateObject", {...})  ← CACHED per-item!
    update progress cell
        ↓
  collect novel URLs
        ↓
  for each novel URL:
    await fetch("/api/ai/llm/generateObject", {...})  ← CACHED per-item!
        ↓
  save reports to cell
```

**Pros:**
- ✅ Works today
- ✅ **Server-side caching DOES work** (same request = cache hit)
- ✅ Full control over async flow
- ✅ Can update progress cells during execution
- ✅ Per-item caching achieved

**Cons:**
- ⚠️ Not idiomatic (bypasses reactive system)
- ⚠️ Imperative instead of declarative
- ⚠️ Unclear if this is the "right" way

**This is currently our best working option for per-item caching.**

---

### Architecture C: Static Array at Pattern Init (Limited)

```typescript
export default pattern(({ existingArticles }) => {
  // Only works if articles are known at pattern creation time
  const extractions = existingArticles.map((article) =>
    generateObject({...})
  );
  ...
});
```

**Pros:**
- Per official docs, this should work
- Fully reactive

**Cons:**
- Articles must exist at pattern init (can't dynamically add)
- Doesn't work for "process new emails" flow

---

### Architecture D: Hybrid (Fetch content imperatively, process reactively)

```
1. User clicks "Fetch Articles"
        ↓
   handler: for each URL, fetch content, write to webPageCache cell
        ↓
2. articlesWithContent automatically updates (reactive join)
        ↓
3. ???: How to trigger per-item generateObject reactively?
```

**Question:** Is there a way to "instantiate" generateObject calls dynamically when new items appear in a cell?

---

### Architecture E: Agentic Loop with Tools ❌ NO PER-ITEM CACHING

**Reference implementation:** `patterns/jkomoros/hotel-membership-extractor.tsx`

This pattern uses a different approach: instead of processing items in a loop, it gives an LLM agent tools to fetch and process items, and the agent decides the flow.

```typescript
// Define tools as handlers
const searchGmailHandler = handler<
  { query: string; result?: Cell<any> },
  { auth: Cell<Auth>; progress: Cell<SearchProgress> }
>(async (input, state) => {
  // Do async work (fetch emails)
  const emails = await fetchGmailEmails(token, input.query);

  // CRITICAL: Write to result cell for tool calling
  if (input.result) {
    input.result.set({ success: true, emails });
  }
  return { success: true, emails };
});

const reportMembershipHandler = handler<
  { hotelBrand: string; membershipNumber: string; result?: Cell<any> },
  { memberships: Cell<MembershipRecord[]> }
>((input, state) => {
  // Save to cell immediately
  state.memberships.push(newMembership);

  if (input.result) {
    input.result.set({ success: true });
  }
  return { success: true };
});

// Agent with tools
const agent = generateObject({
  system: `You are a hotel loyalty membership extractor.
    Use searchGmail to find hotel emails.
    When you find a membership, IMMEDIATELY call reportMembership.`,

  prompt: agentPrompt,  // Derived cell that triggers when isScanning=true

  tools: {
    searchGmail: {
      description: "Search Gmail with a query",
      handler: searchGmailHandler({ auth, progress }),
    },
    reportMembership: {
      description: "Save a found membership",
      handler: reportMembershipHandler({ memberships }),
    },
  },

  model: "anthropic:claude-sonnet-4-5",
  schema: { /* final result schema */ },
});
```

**Flow:**
```
User clicks "Scan"
        ↓
handler sets isScanning = true
        ↓
agentPrompt derives non-empty string (triggers generateObject)
        ↓
Agent starts, calls tools in multi-turn loop:
  - searchGmail({ query: "from:hilton.com" }) → returns emails
  - Agent analyzes emails, finds membership
  - reportMembership({ brand, number }) → saves to cell
  - searchGmail({ query: "from:marriott.com" }) → ...
  - ...repeats until done
        ↓
Agent returns final summary
        ↓
handler sets isScanning = false
```

**Pros:**
- ✅ Single button click triggers full workflow
- ✅ Agent handles multi-step logic naturally
- ✅ Tools can do async work (fetch, save)
- ✅ Results saved incrementally (via tool handlers)
- ✅ Progress visible via progress cell updates
- ✅ Uses reactive generateObject (idiomatic)

**Cons:**
- ⚠️ LLM decides the flow (less deterministic)
- ⚠️ More expensive (LLM is reasoning about what to do)
- ⚠️ Tool results must write to `input.result` cell (gotcha!)
- ❌ **CONFIRMED: NO per-tool-call caching** - only full conversation is cached
- ❌ Non-deterministic tools (Gmail search) produce different cache keys each time
- ❌ **NOT suitable for per-item LLM caching** - agent varies prompts/order

**Caching behavior (CONFIRMED):**
From `llm.handlers.ts` lines 129-142: The cache key includes the full conversation history including all tool results. Individual tool calls are NOT cached separately. If the agent makes the same sequence with identical tool results, the full conversation is cached - but this is unlikely with non-deterministic tools like Gmail search.

---

### Architecture F: Direct Map + Inline Cache Access ⚠️ NEEDS TESTING

**Key insight from LLM.md docs:** The email summarizer example shows `emails.map()` with `generateText` working because:
1. `emails` is an input (opaque ref to array)
2. Template literal prompts like `${email.body}` are reactive
3. Results are displayed directly in JSX (no derive wrapper for aggregation)

**The issue with Architecture A:** We tried to wrap the extraction results in `derive()` to aggregate them. But derive receives unwrapped values, and the generateObject results might not behave the same way inside derive.

**New approach:** Map directly, access cache inline, display in JSX, aggregate via handler.

```typescript
// parsedArticles is derived from emails - it's an opaque ref
const parsedArticles = computed(() =>
  emails.filter(e => e.articleURL).map(e => ({
    emailId: e.id,
    articleURL: e.articleURL,
    title: e.subject,
  }))
);

// webPageCache stores fetched content
const webPageCache = Cell.of<Record<string, { content: string }>>({});

// Map over parsedArticles directly - don't pre-compute articlesWithContent!
// Access cache INLINE in the prompt - this should be reactive
const articleExtractions = parsedArticles.map((article) => ({
  article,
  extraction: generateObject<ExtractionResult>({
    system: LINK_EXTRACTION_SYSTEM,
    // Template literal with inline cache access - reactive!
    prompt: `URL: ${article.articleURL}
Title: ${article.title}
Content: ${webPageCache[article.articleURL]?.content ?? ""}`,
    // Empty content = empty prompt section = might still trigger LLM (need to test)
  }),
}));

// Display progress directly in JSX (no derive wrapper!)
{articleExtractions.map(({ article, extraction }) => (
  <div>
    <span>{article.title}</span>
    {extraction.pending ? (
      <span>⏳ Analyzing...</span>
    ) : extraction.error ? (
      <span>❌ {extraction.error}</span>
    ) : (
      <span>✅ Found {extraction.result.links?.length ?? 0} links</span>
    )}
  </div>
))}

// Aggregate results via handler when user clicks "Continue"
const collectResults = handler<unknown, {
  articleExtractions: { article: any; extraction: { result: any; pending: boolean } }[];
  novelURLs: Cell<string[]>;
}>((_, { articleExtractions, novelURLs }) => {
  const urls: string[] = [];
  // In handler, we can use .get() to read values
  for (const item of articleExtractions) {
    const ext = item.extraction;
    if (!ext.pending && ext.result?.links) {
      urls.push(...ext.result.links);
    }
  }
  novelURLs.set(urls);
});
```

**Flow:**
```
1. User clicks "Fetch Articles"
        ↓
   handler: fetch content, write to webPageCache[url]
        ↓
2. Prompts reactively update (cache access is inline)
        ↓
3. generateObject calls run (one per article)
        ↓
4. JSX shows per-item progress (direct access, no derive)
        ↓
5. User clicks "Continue" when all complete
        ↓
6. Handler aggregates results using .get()
```

**Why this might work:**
- Template literals in prompts are reactive (per LLM.md email example)
- `webPageCache[url]?.content` should be reactive property access on a Cell
- Results displayed directly in JSX (no derive wrapper that might cause issues)
- Aggregation done in handler where .get() works

**Pros:**
- ✅ Per-item generateObject calls (per-item caching)
- ✅ Uses reactive generateObject (idiomatic)
- ✅ Progress visible in JSX
- ⚠️ Requires "Continue" button (not fully automatic)

**Cons:**
- ⚠️ Two-button flow (Fetch Articles → Continue)
- ❓ **UNTESTED:** Does inline cache access work reactively in map callback?
- ❓ **UNTESTED:** Does empty prompt content prevent LLM call or just return empty result?
- ❓ **UNTESTED:** Can handler read articleExtractions properly?

**Key Questions to Test:**
1. Does `webPageCache[article.articleURL]` work reactively inside a map callback?
2. When cache is updated, do the generateObject calls re-run?
3. Can we read `.pending` and `.result` directly in JSX on mapped generateObject results?
4. Does an empty prompt section trigger an LLM call or get filtered?

---

## Comparison Matrix (Updated with Research)

| Architecture | Per-Item Cache | Single Button | Idiomatic | Progress UI | Works Today |
|-------------|----------------|---------------|-----------|-------------|-------------|
| A: Reactive Per-Item | ✅ | ✅ | ✅ | ✅ | ❌ derive() wrapper fails |
| **B: Imperative fetch()** | **✅** | **✅** | ⚠️ | **✅** | **✅ CONFIRMED** |
| C: Static Array | ✅ | ✅ | ✅ | ✅ | ⚠️ Limited to init-time data |
| D: Hybrid | ✅ | ❌ | ⚠️ | ⚠️ | ❓ Unclear |
| E: Agentic Loop | ❌ | ✅ | ✅ | ✅ | ✅ But no per-item cache |
| **F: Direct Map + JSX** | **✅** | ⚠️ 2-btn | **✅** | **✅** | **❓ NEEDS TESTING** |

**Conclusions:**
1. **Architecture B (imperative fetch)** is the only CONFIRMED working option
2. **Architecture F (direct map + JSX)** is promising and more idiomatic - needs testing
3. The key insight: don't wrap generateObject results in derive() for aggregation

---

## Specific Questions for Framework Author

### ✅ ANSWERED by Research

1. **~~Server-side LLM caching:~~** ✅ ANSWERED
   ~~Does the server cache LLM requests based on (system + prompt + schema) regardless of whether they come from reactive `generateObject` or raw `fetch()`?~~

   **Yes!** Cache is at HTTP endpoint level. Key = SHA-256(payload minus cache/metadata). Raw fetch benefits from caching.

2. **~~Agentic tool caching:~~** ✅ ANSWERED
   ~~In Architecture E (agentic loop), are individual tool calls cached? Or only the final result?~~

   **Full conversation only.** Individual tool calls are NOT cached separately. Cache key includes full message history + tool results.

3. **~~Why doesn't Cell.map() work with generateObject?~~** ✅ ANSWERED
   ~~The docs show `emails.map(email => generateObject({...}))` working. But when the source array comes from `derive()`, this doesn't seem to work.~~

   **Cell.map() returns OpaqueRef, not Array.** The docs example uses a plain JavaScript array (`articles: Article[]`), which uses `Array.prototype.map()`. But `derive()` returns a Cell, and `Cell.map()` returns `OpaqueRef<S[]>`, not `Array<S>`.

### ❓ REMAINING QUESTIONS

1. **Architecture F validation - does inline cache access work?**
   In `parsedArticles.map((article) => generateObject({ prompt: \`...${webPageCache[article.url]?.content}...\` }))`:
   - Does `webPageCache[article.url]` work reactively inside a map callback?
   - When cache is updated, do generateObject prompts reactively update?
   - Can we access `.pending` and `.result` directly in JSX on mapped results?

2. **Why does derive() wrapper break generateObject results?**
   Architecture A failed when we wrapped `articleExtractions` in `derive()` to aggregate results:
   ```typescript
   derive(articleExtractions, (extractions) => {
     extractions.filter(e => e.pending)  // TypeError!
   });
   ```
   But accessing the same properties in JSX seems to work (per LLM.md example). Why?

3. **Is Architecture B (imperative fetch) acceptable long-term?**
   Using `await fetch("/api/ai/llm/generateObject", {...})` in a handler works and gets caching. Is this:
   - An acceptable pattern?
   - Going to break in the future?
   - Missing framework benefits?

4. **Recommended pattern for dynamic per-item LLM processing?**
   For "user clicks button → process N items through LLM → each item cached individually":
   - Is Architecture F (direct map + JSX display) the right approach?
   - Or is there a better idiomatic pattern?

5. **Empty prompt handling:**
   If a generateObject prompt is empty (e.g., cache not yet populated), does it:
   - Trigger an LLM call with empty input?
   - Get filtered/skipped?
   - Return an error?

---

## Related Code/Docs

**Patterns:**
- `patterns/jkomoros/prompt-injection-tracker.tsx` - Main pattern with this issue
- `patterns/jkomoros/hotel-membership-extractor.tsx` - Agentic example (Architecture E)

**Framework Code (researched):**
- `~/Code/labs/packages/toolshed/routes/ai/llm/cache.ts` - LLM cache implementation
- `~/Code/labs/packages/toolshed/routes/ai/llm/llm.handlers.ts` - Cache key logic, tool caching (lines 129-157)
- `~/Code/labs/packages/runner/src/cell.ts` - Cell.map() implementation (lines 1147-1169)
- `~/Code/labs/packages/api/index.ts` - IDerivable interface showing OpaqueRef return type

**Official docs:**
- `~/Code/labs/docs/common/LLM.md` - generateObject documentation

**Community docs:**
- `community-docs/superstitions/2025-11-22-llm-generateObject-reactive-map-derive.md`
- `community-docs/superstitions/2025-11-27-llm-never-raw-fetch-use-generateObject.md`

## Environment

- Local dev (localhost:8000 / localhost:5173)
- Date: November 27, 2025
- labs repo: HEAD of main
