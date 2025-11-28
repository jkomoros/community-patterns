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

## TL;DR - Current Recommendation

After extensive research, here's our best understanding:

**What Works:**
1. ✅ **Server-side LLM caching works** - even with raw `fetch()` to the API
2. ✅ **derive/computed work on SINGLE generateObject results** - note.tsx, suggestion.tsx show this
3. ✅ **JSX can display per-item status** from Cell.map() results (via internal effect/isCell detection)
4. ✅ **Empty prompts return immediately** - no LLM call, useful for "needs content" detection

**What Doesn't Work:**
1. ❌ **Cell.map() returns OpaqueRef, not Array** - can't aggregate completion across dynamic arrays
2. ❌ **derive/computed on Cell.map() arrays** - items are proxied, `.pending` returns proxy not boolean
3. ❌ **effect() not available** - exported from runner but not from commontools public API

**Recommended Approaches:**
For our use case (dynamic per-item LLM processing with per-item caching):

**Option 1: Architecture G - Worker Pool (NEW - Most Promising)**
1. Create FIXED number of workers using `Array.from()` (plain JS, not Cell.map)
2. Each worker's prompt derives from batch position + item array
3. Use `computed(() => workers.every(w => !w.pending))` to track batch completion - THIS WORKS!
4. User clicks "Next Batch" to advance through items
5. Per-item caching works, parallel processing, completion tracking

```typescript
// Key pattern: Array.prototype.map creates plain array, not OpaqueRef
const workers = Array.from({ length: 5 }, (_, i) =>
  generateObject({ prompt: derive([items, batchStart], ...), ... })
);
const batchDone = computed(() => workers.every(w => !w.pending)); // WORKS!
```

**Option 2: Architecture B - Imperative Fetch (Confirmed Working)**
1. Handler loops through items with `await fetch("/api/ai/llm/generateObject")`
2. Server-side caching still applies
3. Single button, full control, but less idiomatic

**Option 3: Architecture F - Direct Map + Handler Aggregation**
1. Use Cell.map() for per-item generateObject (gets caching)
2. Display per-item progress in JSX
3. User clicks "Continue" when visually complete
4. Handler aggregates using `.get()`

**Key Trade-offs:**
- **G (Worker Pool):** Best balance - batch completion tracking, per-item caching, but N-click flow
- **B (Imperative):** Single click, but bypasses reactive system
- **F (Direct Map):** Most idiomatic, but can't detect completion programmatically

**Key Question for Framework Author:** Would exposing `effect()` to patterns help here? Or is there a better pattern for "run handler when cell becomes true"?

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

### ✅ CONFIRMED: Why JSX Works but derive() Fails for .pending Access

**Source:** `~/Code/labs/packages/html/src/render.ts` (lines 349-389) and `~/Code/labs/packages/runner/src/cell.ts` (lines 1086-1141)

**The critical difference:**

**JSX uses `isCell()` detection and wraps cells in `effect()` for reactivity:**
```typescript
// From render.ts - bindProps()
if (isCell(propValue)) {
  // JSX detects cells and handles them specially
  const cancel = effect(propValue, (replacement) => {
    setProperty(element, propKey, replacement);
  });
}
```

**derive() receives OpaqueRef (proxied cells) and accessing properties returns another proxy:**
```typescript
// From cell.ts - getAsOpaqueRefProxy()
get(target, prop) {
  if (typeof prop === "string" || typeof prop === "number") {
    const nestedCell = self.key(prop) as Cell<T>;
    return nestedCell.getAsOpaqueRefProxy();  // Returns ANOTHER proxy, not the value!
  }
}
```

**Why this matters:**
- In JSX: `{extraction.pending}` → JSX detects this is a cell, uses `effect()` to observe it
- In derive(): `extractions.filter(e => e.pending)` → `e.pending` returns a **proxy**, not a boolean
  - The proxy is truthy (it's an object), so conditions fail unexpectedly

**This explains our Architecture A failure:**
```typescript
// FAILS: derive() receives proxied cells
derive(articleLinkExtractions, (extractions) => {
  extractions.filter(e => e.pending)  // e.pending is a PROXY, not a boolean!
  // Proxy is always truthy, so filter doesn't work as expected
});

// WORKS: JSX uses isCell() detection
{articleExtractions.map(({ extraction }) => (
  <div>{extraction.pending ? "Loading..." : "Done"}</div>  // JSX handles this correctly
))}
```

**generateObject result structure (from llm.ts lines 109-119):**
```typescript
const GenerateObjectResultSchema = {
  type: "object",
  properties: {
    pending: { type: "boolean", default: false },
    result: { type: "object" },
    error: {},
    partial: { type: "string" },
    requestHash: { type: "string" },
  },
  required: ["pending"],
};
```

Each property (`.pending`, `.result`, `.error`) is a separate sub-cell accessed via `.key()`.

---

### ✅ CONFIRMED: Empty Prompts Don't Trigger LLM Calls

**Source:** `~/Code/labs/packages/runner/src/builtins/llm.ts` (lines 715-721)

```typescript
if ((!prompt && (!messages || messages.length === 0)) || !schema) {
  resultWithLog.set(undefined);
  errorWithLog.set(undefined);
  partialWithLog.set(undefined);
  pendingWithLog.set(false);  // Immediately not pending
  return;  // No LLM call made!
}
```

**Behavior when prompt is empty:**
1. **No LLM call is triggered** - function returns immediately
2. **`pending` = `false`** - not waiting for anything
3. **`result` = `undefined`** - no result available
4. **`error` = `undefined`** - no error occurred

**Implication for Architecture F:** Articles without cached content won't trigger LLM calls - they'll just show as "not pending" with undefined result. This is actually good - we can detect "needs content" vs "processing" vs "done" states:
- `pending=false, result=undefined, content=""` → Needs content (cache empty)
- `pending=true` → Processing (LLM running)
- `pending=false, result=defined` → Done

---

### ✅ CONFIRMED: derive() and computed() WORK on Single generateObject Results

**Source:** `~/Code/labs/packages/patterns/note.tsx` (line 182) and `~/Code/labs/packages/patterns/suggestion.tsx` (lines 36-40)

**Key discovery:** The problem isn't that derive/computed can't access `.pending` - they CAN when working with a SINGLE generateObject result!

**note.tsx example:**
```typescript
const result = generateText({
  system: str`Translate the content to ${language}.`,
  prompt: str`<to_translate>${content}</to_translate>`,
});

return derive(result, ({ pending, result }) => {
  if (pending) return undefined;
  if (result == null) return "Error occured";
  return result;
});
```

**suggestion.tsx example:**
```typescript
return ifElse(
  computed(() => suggestion.pending && !suggestion.result),
  undefined,
  suggestion.result,
);
```

**The REAL problem:** When using `Cell.map()` to create an ARRAY of generateObject calls:
1. `Cell.map()` returns `OpaqueRef<S[]>` (a proxy), not `Array<S>`
2. Inside derive(), iterating over this proxy gives proxied items
3. Accessing `.pending` on proxied items returns another proxy, not a boolean

**So the issue is specifically with ARRAYS from Cell.map(), not with derive/computed in general!**

---

### ❓ OPEN QUESTION: How to Track Completion Across DYNAMIC Arrays

**The Core Problem:**
- We can derive/compute completion for a SINGLE generateObject result
- We can display per-item status in JSX (works fine)
- But we can't aggregate completion across a DYNAMIC array from Cell.map()

**Why existing patterns don't show this:**
The docs examples (email summarizer) only show displaying status in JSX - they don't aggregate "all done" for a next phase.

**Potential Solutions:**

**1. Fixed-Size Batch Processing (Works but limited)**
```typescript
// Create generateObject calls at pattern body level (not in Cell.map)
const extraction0 = generateObject({ prompt: derive(batch, b => b[0]?.content ?? ""), ... });
const extraction1 = generateObject({ prompt: derive(batch, b => b[1]?.content ?? ""), ... });
const extraction2 = generateObject({ prompt: derive(batch, b => b[2]?.content ?? ""), ... });

// Now we can compute completion from the fixed set
const allComplete = computed(() =>
  !extraction0.pending && !extraction1.pending && !extraction2.pending
);
```
- ✅ Works with derive/computed
- ❌ Limited to fixed batch size
- ⚠️ Verbose, not scalable

**2. Explicit User Action (Simple, works)**
```typescript
// User sees all items marked "✅ Done" in UI via JSX
// User clicks "Continue" button
const continueHandler = handler((_, { articleExtractions, novelURLs }) => {
  const allResults = [];
  for (const { extraction } of articleExtractions) {
    // In handlers, .get() works to read cell values
    const pending = extraction.pending.get?.() ?? extraction.pending;
    const result = extraction.result.get?.() ?? extraction.result;
    if (pending) {
      alert("Some items still processing!");
      return;
    }
    allResults.push(result);
  }
  // All done, process results...
  novelURLs.set(collectNovelURLs(allResults));
});
```
- ✅ Works today
- ✅ User confirms all items are done visually
- ⚠️ Requires user action, not automatic

**3. Per-Item Derived State (Untested hypothesis)**
```typescript
// Create a derived "isDone" cell for EACH item
// NOT using Cell.map - doing it at pattern body level
const article1Done = derive(extraction1, e => !e.pending);
const article2Done = derive(extraction2, e => !e.pending);

// Then compute from the fixed set of booleans
const allDone = computed(() => article1Done && article2Done);
```
- ⚠️ Only works with fixed-size arrays
- ❓ Untested if this actually works

**4. effect() - Not Available to Patterns**
The `effect()` function exists in `@commontools/runner` and is used internally by JSX rendering:
```typescript
// From runner/src/reactivity.ts
export const effect = <T>(
  value: Cell<T> | T,
  callback: (value: T) => Cancel | undefined | void,
): Cancel => {
  if (isCell(value)) {
    return value.sink(callback);
  }
  // ...
};
```
- ❌ Not exported from `commontools` public API
- ❌ Cannot be used in patterns

**Question for framework author:** Is there an idiomatic way to:
1. Track completion across a DYNAMIC array of generateObject calls?
2. Automatically trigger the next phase when all items complete?
3. Or is the "user clicks Continue" pattern the expected approach?

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

### Architecture G: Fixed Worker Pool with Batch Processing ⚠️ EXPERIMENTAL

**Key Insight:** The problem with Cell.map() is that it returns OpaqueRef. But if we create a FIXED number of workers using Array.prototype.map (plain JS), we get a plain array of generateObject results that we CAN use with derive/computed!

**Concept:**
```
Fixed Workers (N=5)              Batch Queue               Accumulated Results
┌─────────────────┐              ┌─────────┐              ┌─────────┐
│ Worker 0        │◄─────────────│ Batch 0 │─────────────►│Result 0 │
│ Worker 1        │   Batch N    │ Batch 1 │   Collect   │Result 1 │
│ Worker 2        │◄─────────────│ Batch 2 │─────────────►│Result 2 │
│ Worker 3        │              │ ...     │              │...      │
│ Worker 4        │              └─────────┘              └─────────┘
└─────────────────┘
    ↓
All workers at PATTERN BODY level
Can use computed() to track batch completion!
```

**Implementation:**
```typescript
const NUM_WORKERS = 5;
const currentBatchStart = Cell.of(0);
const allResults = Cell.of<ExtractionResult[]>([]);

// Fixed workers - each derives its input from batch position
// NOTE: Array.prototype.map here, NOT Cell.map!
const workers = Array.from({ length: NUM_WORKERS }, (_, i) => {
  const workerPrompt = derive(
    [articlesToProcess, currentBatchStart],
    ([articles, batchStart]) => {
      const item = articles[batchStart + i];
      return item ? JSON.stringify(item) : "";
    }
  );

  return generateObject<ExtractionResult>({
    system: EXTRACTION_SYSTEM,
    prompt: workerPrompt,
    model: "anthropic:claude-sonnet-4-5",
    schema: EXTRACTION_SCHEMA,
  });
});

// NOW we can compute batch completion!
// workers is Array<generateObjectResult>, not OpaqueRef
const currentBatchDone = computed(() =>
  workers.every(w => !w.pending)
);

// Track progress
const totalItems = computed(() => articlesToProcess.length);
const processedItems = computed(() =>
  Math.min(currentBatchStart + NUM_WORKERS, totalItems)
);
const batchesTotal = computed(() => Math.ceil(totalItems / NUM_WORKERS));
const currentBatchNum = computed(() =>
  Math.floor(currentBatchStart / NUM_WORKERS) + 1
);

// Handler to advance to next batch
const advanceBatch = handler((_, state) => {
  // First collect current batch results
  for (const worker of workers) {
    const result = worker.result.get?.() ?? worker.result;
    if (result) {
      state.allResults.push(result);
    }
  }

  // Advance to next batch
  const current = state.currentBatchStart.get();
  const total = state.articlesToProcess.length;
  if (current + NUM_WORKERS < total) {
    state.currentBatchStart.set(current + NUM_WORKERS);
  }
});

// UI shows batch progress
{currentBatchDone ? (
  <div>
    <p>Batch {currentBatchNum}/{batchesTotal} complete!</p>
    <button onclick={advanceBatch({...})}>
      {currentBatchStart + NUM_WORKERS >= totalItems
        ? "Finish & Collect Results"
        : "Process Next Batch"}
    </button>
  </div>
) : (
  <div>
    <p>Processing batch {currentBatchNum}/{batchesTotal}...</p>
    {workers.map((w, i) => (
      <div>Worker {i}: {w.pending ? "⏳" : "✅"}</div>
    ))}
  </div>
)}
```

**Why This Works:**
1. `Array.from()` creates a plain JS array, not a Cell
2. Each worker is a separate generateObject call at pattern body level
3. `workers.every(w => !w.pending)` works in computed() because:
   - `workers` is a plain Array
   - Each `w` is a generateObject result cell
   - `w.pending` is accessed on individual cells (which works!)
4. We can aggregate completion across the fixed worker set

**Pros:**
- ✅ Per-item LLM caching (each worker prompt is deterministic for each item)
- ✅ Parallel processing (N items at once)
- ✅ Can compute batch completion (no proxy issues!)
- ✅ Progress visible (X/Y items, batch N/M)
- ✅ Works with dynamic array sizes (just takes more batches)

**Cons:**
- ⚠️ Still requires user clicks between batches
- ⚠️ Fixed parallelism (N workers)
- ⚠️ Items processed in order (can't skip ahead)
- ❓ Empty prompts for workers past end of data - need to handle gracefully

**Handling Short Final Batch:**
```typescript
// Workers past end of data get empty prompt → no LLM call, pending=false immediately
const workerPrompt = derive(
  [articlesToProcess, currentBatchStart],
  ([articles, batchStart]) => {
    const item = articles[batchStart + i];
    // No item = empty prompt = no LLM call
    return item ? JSON.stringify(item) : "";
  }
);
```
Per our research, empty prompts return immediately with `pending=false, result=undefined`, so workers without items just complete instantly.

**Potential Enhancement - Auto-Advance:**
```typescript
// If we could trigger handler when currentBatchDone becomes true...
// But we can't use effect() in patterns

// Alternative: Very fast polling in UI?
// Or: Framework enhancement to support "when cell becomes true, run handler"
```

**Key Limitation:** Still requires manual "Next Batch" clicks. True automatic advancement would need effect() or similar reactive trigger.

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

| Architecture | Per-Item Cache | Single Button | Idiomatic | Progress UI | Batch Completion | Works Today |
|-------------|----------------|---------------|-----------|-------------|------------------|-------------|
| A: Reactive Per-Item | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ Cell.map returns proxy |
| **B: Imperative fetch()** | **✅** | **✅** | ⚠️ | **✅** | **✅** | **✅ CONFIRMED** |
| C: Static Array | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ Limited to init-time data |
| D: Hybrid | ✅ | ❌ | ⚠️ | ⚠️ | ❓ | ❓ Unclear |
| E: Agentic Loop | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ But no per-item cache |
| F: Direct Map + JSX | ✅ | ⚠️ 2-btn | ✅ | ✅ | ❌ | ❓ NEEDS TESTING |
| **G: Worker Pool** | **✅** | ⚠️ N-btn | **✅** | **✅** | **✅** | **❓ EXPERIMENTAL** |

**Conclusions:**
1. **Architecture B (imperative fetch)** is the only CONFIRMED working option with single button
2. **Architecture G (worker pool)** is promising - gets batch completion tracking, per-item caching, parallel processing
3. **Architecture F (direct map + JSX)** works for display but can't aggregate completion
4. The key insight: use Array.prototype.map (plain JS), NOT Cell.map(), to create fixed workers

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

2. **~~Why does derive() wrapper break generateObject results?~~** ✅ ANSWERED
   Architecture A failed when we wrapped `articleExtractions` in `derive()` to aggregate results.

   **ANSWER:** derive/computed work FINE on single generateObject results (see note.tsx, suggestion.tsx).
   The problem is specifically with ARRAYS from Cell.map():
   - `Cell.map()` returns `OpaqueRef<S[]>` (proxy)
   - Inside derive, array items are proxied
   - `.pending` on proxied items returns another proxy, not boolean

   JSX works because it uses `isCell()` detection and `effect()` internally.

3. **Is Architecture B (imperative fetch) acceptable long-term?**
   Using `await fetch("/api/ai/llm/generateObject", {...})` in a handler works and gets caching. Is this:
   - An acceptable pattern?
   - Going to break in the future?
   - Missing framework benefits?

4. **Recommended pattern for dynamic per-item LLM processing?**
   For "user clicks button → process N items through LLM → each item cached individually":
   - Is Architecture F (direct map + JSX display + handler aggregation) the right approach?
   - Should we use "user clicks Continue" for phase transitions?
   - Or is there a more automatic approach?

5. **~~Empty prompt handling:~~** ✅ ANSWERED
   ~~If a generateObject prompt is empty, what happens?~~

   **ANSWER:** (from llm.ts lines 715-721)
   - **No LLM call is triggered** - function returns immediately
   - **pending = false** - not waiting
   - **result = undefined** - no result
   This is actually useful for detecting "needs content" vs "processing" vs "done" states.

---

## Related Code/Docs

**Patterns:**
- `patterns/jkomoros/prompt-injection-tracker.tsx` - Main pattern with this issue
- `patterns/jkomoros/hotel-membership-extractor.tsx` - Agentic example (Architecture E)
- `~/Code/labs/packages/patterns/note.tsx` (line 182) - **Working example:** derive() on single generateText result
- `~/Code/labs/packages/patterns/suggestion.tsx` (lines 36-40) - **Working example:** computed() with generateObject.pending
- `~/Code/labs/packages/patterns/write-and-run.tsx` (lines 109-113) - **Working example:** computed() with compileAndRun.pending

**Framework Code (researched):**
- `~/Code/labs/packages/toolshed/routes/ai/llm/cache.ts` - LLM cache implementation
- `~/Code/labs/packages/toolshed/routes/ai/llm/llm.handlers.ts` - Cache key logic, tool caching (lines 129-157)
- `~/Code/labs/packages/runner/src/cell.ts` - Cell.map() implementation (lines 1147-1169), OpaqueRef proxy (lines 1086-1141)
- `~/Code/labs/packages/runner/src/reactivity.ts` - effect() implementation (not exported to patterns)
- `~/Code/labs/packages/html/src/render.ts` - How JSX uses isCell() + effect() (lines 349-389)
- `~/Code/labs/packages/api/index.ts` - IDerivable interface showing OpaqueRef return type

**Official docs:**
- `~/Code/labs/docs/common/LLM.md` - generateObject documentation
- `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` - Derived statistics pattern (line 433-448)

**Community docs:**
- `community-docs/superstitions/2025-11-22-llm-generateObject-reactive-map-derive.md`
- `community-docs/superstitions/2025-11-27-llm-never-raw-fetch-use-generateObject.md`

## Environment

- Local dev (localhost:8000 / localhost:5173)
- Date: November 27, 2025
- labs repo: HEAD of main
