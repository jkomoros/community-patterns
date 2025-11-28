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

### Architecture A: Reactive Per-Item (Idiomatic but blocked)

```
parsedArticles (derive from emails)
        ↓
articlesWithContent (derive joining with webPageCache)
        ↓
articlesWithContent.map(article => generateObject({...}))  ← DOESN'T WORK
        ↓
linkExtractionProgress (derive tracking pending/completed)
        ↓
novelReportURLs (derive collecting results)
```

**Pros:**
- Fully reactive (one button, automatic updates)
- Per-item LLM caching
- Framework handles all the complexity

**Cons:**
- generateObject inside derive/map doesn't seem to work
- "Can't kick off reactive things from inside derive"

**Question:** Is there an idiomatic way to do this?

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

### Architecture E: Agentic Loop with Tools (hotel-membership-extractor pattern)

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
- ❓ **Unclear: Does per-tool-call caching work?** If the agent makes the same tool call twice, is it cached?
- ⚠️ Harder to get per-article caching (agent might batch or vary prompts)

**Question for framework author:** For agentic workflows, does the framework cache individual tool calls or the full multi-turn conversation?

---

## Comparison Matrix

| Architecture | Per-Item Cache | Single Button | Idiomatic | Progress UI | Works Today |
|-------------|----------------|---------------|-----------|-------------|-------------|
| A: Reactive Per-Item | ✅ | ✅ | ✅ | ✅ | ❌ |
| B: Imperative fetch() | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| C: Static Array | ✅ | ✅ | ✅ | ✅ | ⚠️ Limited |
| D: Hybrid | ✅ | ❌ | ⚠️ | ⚠️ | ❓ |
| E: Agentic Loop | ❓ | ✅ | ✅ | ✅ | ✅ |

---

## Specific Questions for Framework Author

1. **Per-item generateObject from dynamic arrays:**
   The docs show `emails.map(email => generateObject({...}))` working. But when the source array comes from `derive()`, this doesn't seem to work. Is there a pattern for this?

2. **~~Server-side LLM caching:~~** ✅ ANSWERED
   ~~Does the server cache LLM requests based on (system + prompt + schema) regardless of whether they come from reactive `generateObject` or raw `fetch()`?~~

   **Yes!** Cache is at HTTP endpoint level. Key = SHA-256(payload minus cache/metadata).

3. **Triggering reactive things from handlers:**
   Is there a way to "kick off" multiple independent `generateObject` calls from a handler that will each be cached individually?

4. **Agentic tool caching:**
   In Architecture E (agentic loop), are individual tool calls cached? Or only the final result?

5. **Recommended architecture:**
   For "process N items with LLM, cache per-item" use case, what's the idiomatic pattern?
   - Architecture B (imperative fetch) works but feels like a workaround
   - Architecture E (agentic) is elegant but unclear on caching

---

## Related Code/Docs

- **Pattern:** `patterns/jkomoros/prompt-injection-tracker.tsx`
- **Pattern:** `patterns/jkomoros/hotel-membership-extractor.tsx` (agentic example)
- **Official docs:** `~/Code/labs/docs/common/LLM.md`
- **Cache implementation:** `~/Code/labs/packages/toolshed/routes/ai/llm/cache.ts`
- **Superstition:** `community-docs/superstitions/2025-11-22-llm-generateObject-reactive-map-derive.md`
- **Superstition:** `community-docs/superstitions/2025-11-27-llm-never-raw-fetch-use-generateObject.md`

## Environment

- Local dev (localhost:8000 / localhost:5173)
- Date: November 27, 2025
- labs repo: HEAD of main
