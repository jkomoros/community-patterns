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

### 🔬 DEEP DIVE: Why Cell.map() Returns OpaqueRef (Proxy)

**This is the core of our problem.** After extensive research into the git history, design docs, and implementation, here's why Cell.map() works the way it does.

#### The Architecture

**Key Insight:** OpaqueRef and Cell were MERGED in PR #2024 (Nov 2025). They are now the same thing!

```
OpaqueRef<T> === Cell<T> wrapped in a Proxy
```

The Proxy (from `cell.ts:getAsOpaqueRefProxy()`) provides:
1. **Symbol.iterator** - Array destructuring support
2. **Symbol.toPrimitive** - Throws error directing to use `derive`
3. **Recursive property access** - Each `.foo` returns another proxied child cell

#### Why Property Access Returns a Proxy

From `cell.ts` lines 1119-1134:
```typescript
} else if (typeof prop === "string" || typeof prop === "number") {
  // Recursive property access - wrap the child cell
  const nestedCell = self.key(prop) as Cell<T>;
  return nestedCell.getAsOpaqueRefProxy();  // Returns ANOTHER PROXY!
}
```

This is **intentional design** for fine-grained reactivity:
- Each property access creates a **reactive dependency**
- The system tracks which exact properties are read
- Changes to specific properties trigger only dependent computations

#### Why Cell.map() Returns OpaqueRef<S[]>

From `map.ts` (the map builtin implementation):
```typescript
// For each element, create a result cell and run a recipe
const resultCell = runtime.getCell(parentCell.space, { result, index }, undefined, tx);
runtime.runner.run(tx, opRecipe, recipeInputs, resultCell);
resultWithLog.key(initializedUpTo).set(resultCell);  // Store CELL in array
```

The map builtin:
1. Creates a **result Cell** containing an array
2. For each input element, runs a **recipe** (pattern)
3. Stores the **result cells** (not values!) in the output array
4. Returns the result Cell wrapped as OpaqueRef

So `Cell.map()` returns `OpaqueRef<S[]>` where **each element is itself a Cell**.

#### The Closure Transformation

When you write:
```typescript
state.items.map((item) => item.price * state.discount)
```

The **ts-transformers** package transforms this to:
```typescript
state.items.mapWithPattern(
  recipe(({ element, params: { state } }) => element.price * state.discount),
  { state: { discount: state.discount } }
)
```

From `closure-design.md`:
> Map callbacks on reactive arrays that capture variables from outer scope need those values passed explicitly.

This is why:
1. The callback is wrapped in a `recipe()`
2. Captured variables are passed as `params`
3. The callback receives `{ element, index, array, params }`

#### Is This Fundamental or Fixable?

**FUNDAMENTAL.** The proxy-based reactivity is core to how CommonTools works:

1. **Dependency tracking** - The system needs to know which cells are accessed
2. **Fine-grained updates** - Only re-run computations when dependencies change
3. **Lazy evaluation** - Don't compute until values are needed

**However**, there are potential framework enhancements that could help:

1. **Export `effect()` to patterns** - Would allow patterns to react to cell changes
2. **Add `Cell.mapValues()`** - A variant that returns plain values instead of cells (for aggregation)
3. **Add `Cell.every()`/`Cell.some()`** - Array aggregation methods that work reactively

#### Why JSX Works But derive() Doesn't

**JSX** (from `render.ts` lines 349-389):
```typescript
if (isCell(propValue)) {
  const cancel = effect(propValue, (replacement) => {
    setProperty(element, propKey, replacement);
  });
}
```

JSX uses `isCell()` to detect cells and `effect()` to subscribe to changes. It receives the **actual value** in the callback.

**derive()** (from `module.ts`):
```typescript
export function derive<In, Out>(input: Opaque<In>, f: (input: In) => Out): OpaqueRef<Out> {
  return lift(f)(input);
}
```

derive() passes the **proxied input** to the callback. When you access `.pending`, you get another proxy (the cell for that property), not the boolean value.

**Key difference:**
- **effect()** - Callback receives unwrapped values
- **derive()** - Callback receives proxied cells (for dependency tracking)

#### Timeline of Key Changes

| Commit | Date | Change |
|--------|------|--------|
| `7ec536e65` | Oct 2025 | Map closure transformation implemented |
| `b30582325` | Oct 2025 | Fix: fn in OpaqueRef.map(fn) gets OpaqueRef arguments |
| `c1c0183b7` | Nov 2025 | **Merge OpaqueRef and Cell** - they're now the same! |
| `af8d315ad` | Nov 2025 | Remove legacy proxy, complete merge |

#### Design Docs Referenced

- `packages/ts-transformers/docs/closure-design.md` - Map closure transformation design
- `packages/ts-transformers/docs/hierarchical-params-spec.md` - How captured params are structured
- `packages/ts-transformers/docs/closure-implementation-roadmap.md` - Future plans

#### Conclusion

The proxy behavior is **by design** to enable reactive dependency tracking. The issue isn't a bug or incomplete implementation - it's a fundamental architectural choice.

Our options are:
1. **Work within the design** (Architecture B, F, G)
2. **Request framework enhancements** (expose `effect()`, add `Cell.every()`)
3. **Use imperative workarounds** (handlers with `.get()`)

---

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

---

## 💭 DREAM SKETCH: Ideal Framework Primitives

*This section explores what framework primitives could elegantly solve this problem while fitting the reactive design philosophy.*

### The Gap in Current Primitives

The framework has excellent primitives for:
- **Single async operations:** `generateObject()` returns `{pending, result, error}`
- **Mapping over arrays:** `Cell.map()` creates per-item reactive results
- **Deriving from single cells:** `derive(cell, fn)` tracks dependencies beautifully

But it lacks primitives for:
- **Aggregating across dynamic arrays** - Can't do `cells.every(c => !c.pending)`
- **Collecting results when all complete** - No reactive "wait for all"
- **Automatic phase continuation** - Can't "derive from results when all done"

### Proposed Primitive: `whenAll()`

**The simplest, most powerful addition would be a reactive `Promise.all()` equivalent.**

#### API Design

```typescript
import { whenAll } from "commontools";

// Input: array of async cells (generateObject, fetchData, etc.)
const extractions = parsedArticles.map(article =>
  generateObject({ prompt: `...${article.content}...`, ... })
);

// whenAll aggregates completion status reactively
const all = whenAll(extractions);

// all.pending: OpaqueRef<boolean>     - true while ANY item pending
// all.results: OpaqueRef<T[] | undefined> - all results when complete
// all.errors:  OpaqueRef<Error[] | undefined> - any errors encountered
// all.progress: OpaqueRef<{completed: number, total: number}>
```

#### Why This Fits the Framework Philosophy

1. **Returns cells** - Everything is reactive, fits the dependency model
2. **No side effects** - It's a derived computation, not imperative
3. **Preserves per-item caching** - Each generateObject is still separate
4. **Enables automatic continuation** - Just derive from results!

#### Usage Pattern

```typescript
// Step 1: Create per-item async operations (each cached individually)
const extractions = parsedArticles.map(article =>
  generateObject({
    system: EXTRACTION_SYSTEM,
    prompt: `Analyze: ${article.title}\n${webPageCache[article.url]?.content}`,
    schema: EXTRACTION_SCHEMA,
  })
);

// Step 2: Aggregate with whenAll (framework handles the iteration)
const allExtractions = whenAll(extractions);

// Step 3: Automatic continuation via derive!
const novelURLs = derive(allExtractions.results, results => {
  if (!results) return [];  // Still pending
  return dedupeAndFilter(results.flatMap(r => r.links));
});

// Step 4: Next phase triggers automatically when novelURLs populated
const reportFetches = novelURLs.map(url => fetchData({ url }));
const allReports = whenAll(reportFetches);

// Step 5: Final summarization
const summaries = derive(allReports.results, reports => {
  if (!reports) return [];
  return reports.map(r => generateObject({ prompt: `Summarize: ${r.content}` }));
});

// UI just displays progress - everything flows automatically!
return {
  [UI]: (
    <div>
      <h2>Pipeline Status</h2>

      <div>Extracting: {allExtractions.progress.completed}/{allExtractions.progress.total}</div>
      {allExtractions.pending ? <Spinner /> : <span>✅ Extraction complete</span>}

      <div>Fetching: {allReports.progress.completed}/{allReports.progress.total}</div>
      {allReports.pending ? <Spinner /> : <span>✅ Reports fetched</span>}

      {/* Results flow automatically when each phase completes */}
      {summaries.map(s => <ReportCard report={s.result} />)}
    </div>
  ),
};
```

#### Implementation Sketch

```typescript
// In packages/runner/src/builder/built-in.ts

export function whenAll<T extends { pending: boolean; result: unknown; error: unknown }>(
  cells: OpaqueRef<T[]>
): OpaqueRef<WhenAllResult<T>> {
  // Implementation would:
  // 1. Create a result cell for the aggregate state
  // 2. Use internal effect() to subscribe to each item's .pending
  // 3. Track completion count, collect results as items finish
  // 4. Update result cell reactively as items complete
  // 5. Handle dynamic array growth (new items added)

  return createNodeFactory({
    type: "ref",
    implementation: "whenAll",
  })(cells);
}

// The whenAll builtin (in builtins/when-all.ts) would:
export function whenAllBuiltin(
  inputsCell: Cell<{ cells: Array<{pending: boolean; result: any; error: any}> }>,
  sendResult: (tx: IExtendedStorageTransaction, result: any) => void,
  addCancel: AddCancel,
  // ...
): Action {
  return (tx) => {
    const { cells } = inputsCell.asSchema(...).withTx(tx).get();

    let completed = 0;
    const results: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell.pending) {
        completed++;
        if (cell.result !== undefined) results[i] = cell.result;
        if (cell.error !== undefined) errors[i] = cell.error;
      }
    }

    sendResult(tx, {
      pending: completed < cells.length,
      results: completed === cells.length ? results : undefined,
      errors: errors.length > 0 ? errors : undefined,
      progress: { completed, total: cells.length },
    });
  };
}
```

### Alternative/Complementary Primitives

#### `Cell.every()` / `Cell.some()` / `Cell.count()`

Reactive array methods that work with cells:

```typescript
// These would iterate with UNWRAPPED values, not proxies
const allDone = extractions.every(e => !e.pending);     // OpaqueRef<boolean>
const anyFailed = extractions.some(e => !!e.error);     // OpaqueRef<boolean>
const doneCount = extractions.count(e => !e.pending);   // OpaqueRef<number>
```

**Implementation insight:** These methods would use internal `effect()` to:
1. Iterate over the array cell
2. Call the predicate with **unwrapped values** (not proxies)
3. Track dependencies on each item's accessed properties
4. Return a derived cell that re-evaluates when dependencies change

#### `Cell.settled()` - Like Promise.allSettled

```typescript
const status = extractions.settled();
// Returns OpaqueRef<Array<{
//   status: 'pending' | 'fulfilled' | 'rejected',
//   value?: T,
//   reason?: Error
// }>>

// Useful for "process what we can, skip failures"
const successfulResults = derive(status, items =>
  items.filter(i => i.status === 'fulfilled').map(i => i.value)
);
```

#### `phases()` - High-Level Pipeline Builder

For complex multi-stage pipelines:

```typescript
const pipeline = phases({
  extract: {
    from: parsedArticles,
    process: (article) => generateObject({...}),
  },
  dedupe: {
    waitFor: 'extract',
    process: (extractResults) => dedupeURLs(extractResults),
  },
  summarize: {
    waitFor: 'dedupe',
    process: (novelURLs) => novelURLs.map(url => generateObject({...})),
  },
});

// Type-safe access to each phase
pipeline.extract.pending   // boolean
pipeline.extract.results   // T[] | undefined
pipeline.summarize.results // Summary[] | undefined
```

### Why `whenAll()` Should Be First

| Primitive | Solves Aggregation | Enables Continuation | Familiar Concept | Minimal API |
|-----------|-------------------|---------------------|------------------|-------------|
| `whenAll()` | ✅ | ✅ | ✅ (Promise.all) | ✅ |
| `Cell.every()` | ✅ | ❌ (just boolean) | ✅ (Array.every) | ✅ |
| `Cell.settled()` | ✅ | ⚠️ (partial) | ✅ (Promise.allSettled) | ✅ |
| `phases()` | ✅ | ✅ | ⚠️ (new concept) | ❌ (complex) |

**Recommendation:** Start with `whenAll()` - it solves the core problem with minimal API surface and familiar semantics.

### How This Would Solve Our Use Case

```typescript
// prompt-injection-tracker with whenAll()

export default pattern<Input, Output>(({ emails, reports }) => {
  // Phase 1: Parse emails (sync, instant)
  const parsedArticles = derive(emails, e =>
    e.filter(hasArticleURL).map(toArticleInfo)
  );

  // Phase 2: Fetch article content (async, cached per-URL)
  const articleFetches = parsedArticles.map(a => fetchData({ url: a.url }));
  const allArticles = whenAll(articleFetches);

  // Phase 3: Extract links via LLM (async, cached per-article)
  const extractions = derive(allArticles.results, articles => {
    if (!articles) return [];
    return articles.map(a => generateObject({
      prompt: `Extract security report links from: ${a.content}`,
      schema: LINK_SCHEMA,
    }));
  });
  const allExtractions = whenAll(extractions);

  // Phase 4: Dedupe and identify novel URLs (sync)
  const novelURLs = derive(
    [allExtractions.results, reports],
    ([results, existing]) => {
      if (!results) return [];
      const allLinks = results.flatMap(r => r.links);
      return dedupeAndFilterKnown(allLinks, existing);
    }
  );

  // Phase 5: Fetch novel reports (async, cached)
  const reportFetches = novelURLs.map(url => fetchData({ url }));
  const allReports = whenAll(reportFetches);

  // Phase 6: Summarize reports (async, cached per-report)
  const summaries = derive(allReports.results, reports => {
    if (!reports) return [];
    return reports.map(r => generateObject({
      prompt: `Summarize this security report: ${r.content}`,
      schema: SUMMARY_SCHEMA,
    }));
  });
  const allSummaries = whenAll(summaries);

  // Single-button trigger: just need to start phase 1
  const startPipeline = handler((_, { emails }) => {
    // Trigger email fetch - everything else flows automatically!
    emails.set(fetchGmailEmails());
  });

  return {
    [NAME]: "Prompt Injection Tracker",
    [UI]: (
      <div>
        <button onclick={startPipeline({emails})}>🚀 Run Pipeline</button>

        <PipelineProgress
          phases={[
            { name: "Fetch Articles", ...allArticles },
            { name: "Extract Links", ...allExtractions },
            { name: "Fetch Reports", ...allReports },
            { name: "Summarize", ...allSummaries },
          ]}
        />

        {/* Results appear automatically as pipeline completes */}
        {allSummaries.results?.map(s => <ReportCard summary={s} />)}
      </div>
    ),
    reports: allSummaries.results ?? [],
  };
});
```

### Summary

The framework's reactive model is powerful, but lacks primitives for aggregating across dynamic arrays of async operations. Adding `whenAll()` would:

1. **Fit the philosophy** - Returns reactive cells, no side effects
2. **Enable automatic continuation** - derive() from results when complete
3. **Preserve per-item caching** - Each async operation stays separate
4. **Be familiar** - Developers know Promise.all()
5. **Solve the core problem** - Single button triggers full pipeline

This would transform our 6-architecture workaround document into a simple, idiomatic pattern.

---

### 🔴 CRITIQUE: Why This Proposal May Be Flawed

#### 1. **Reactive Systems Don't "Wait"**

The proposal smuggles imperative thinking into a reactive model. `whenAll()` implies a state machine (pending → complete), but reactive systems don't have "states" - they have **values that change over time**.

```typescript
// This looks reactive but thinks imperatively
const all = whenAll(extractions);
const next = derive(all.results, results => ...);  // "when results exist, do X"
```

This is essentially `if (condition) then action` - imperative control flow dressed up as reactive data flow. The framework might intentionally NOT support this pattern.

#### 2. **The derive() Re-creation Problem**

Consider:
```typescript
const extractions = derive(allArticles.results, articles => {
  if (!articles) return [];
  return articles.map(a => generateObject({...}));  // Creates NEW cells!
});
```

Every time `allArticles.results` changes (including from `undefined` to `[...]`), this derive re-runs and creates **new** generateObject calls. Questions:
- Are the old generateObject cells garbage collected?
- Do the new ones hit cache? (Probably yes, if prompts match)
- What about cell identity? Are these the "same" cells or different ones?

This could cause subtle bugs or performance issues.

#### 3. **Dynamic Arrays Break the Model**

What happens when the input array grows mid-processing?

```typescript
const all = whenAll(extractions);
// User adds new email while processing
// Does "all complete" reset? Does it include new items?
```

`Promise.all()` works because Promise arrays are static. Reactive arrays are inherently dynamic. The semantics become unclear:
- **Option A:** Snapshot at call time → Not reactive, defeats the purpose
- **Option B:** Track dynamically → "All complete" may never be true
- **Option C:** ??? → Complex edge cases

#### 4. **Too Specific to Our Use Case**

`whenAll()` solves "process array, wait for all, continue" - but this is ONE pattern. The framework might prefer more general primitives:

- **Expose `effect()`** - Let patterns build custom aggregation
- **Add `Cell.reduce()`** - General-purpose array reduction
- **Improve handler ergonomics** - Make the "Continue button" pattern nicer

A `whenAll()` that only solves pipeline-style processing may be too narrow.

#### 5. **It Might Encourage Anti-Patterns**

The "dream" 6-phase pipeline is impressive but possibly wrong:

```typescript
// Is this actually good design?
Phase1 → whenAll → Phase2 → whenAll → Phase3 → whenAll → Phase4 → ...
```

Maybe the framework is RIGHT to make this hard because:
- **Complex pipelines should be multiple charms** - Each phase is its own charm
- **User confirmation is a feature** - "Continue" buttons let users verify intermediate results
- **Simpler patterns are better** - One async operation per pattern, compose via linking

#### 6. **Type System Nightmare**

```typescript
function whenAll<T extends { pending: boolean; result: unknown; error: unknown }>(
  cells: OpaqueRef<T[]>
): OpaqueRef<WhenAllResult<T>>
```

This requires:
- Inferring `T` from `OpaqueRef<T[]>` (tricky with Cell.map results)
- Handling heterogeneous arrays (what if items have different result types?)
- Preserving type information through the proxy chain

The type gymnastics might be prohibitive.

#### 7. **Progress Tracking is Expensive**

```typescript
all.progress: OpaqueRef<{completed: number, total: number}>
```

This requires iterating the entire array on every change. For 1000 items, that's 1000 iterations per item completion. The framework might avoid this intentionally.

#### 8. **Error Semantics Are Unclear**

- `Promise.all` - Fails fast on first error
- `Promise.allSettled` - Collects all results/errors

The proposal has both `results` and `errors` but:
- When is `results` populated? Only if zero errors? Or always?
- Is `errors` an array of all errors? Just the first?
- How do partial failures work?

This ambiguity suggests the abstraction isn't well-defined.

#### 9. **Maybe the "Problem" is Actually Fine**

Our workarounds (Architecture B, F, G) all **work**. They're verbose but functional. The framework might consider this acceptable:

- **Architecture B (imperative fetch):** Works, gets caching, single button
- **Architecture G (worker pool):** Works, parallel processing, batch tracking
- **Manual "Continue" button:** User confirms each phase, catches errors

Perhaps the "problem" is that we want automatic pipelines, but the framework philosophy is that **humans should be in the loop** for multi-stage processing.

---

### 🟡 ALTERNATIVE: Smaller, More Composable Primitives

Instead of `whenAll()`, consider requesting:

#### Option A: Export `effect()` to Patterns

```typescript
import { effect } from "commontools";

// Patterns can build their own aggregation
let completed = 0;
extractions.forEach(e => {
  effect(e.pending, (pending) => {
    if (!pending) completed++;
    if (completed === extractions.length) {
      // All done - trigger next phase
    }
  });
});
```

**Pros:** Maximum flexibility, minimal API surface
**Cons:** Imperative, breaks pure reactive model, patterns become stateful

#### Option B: Reactive `Cell.reduce()`

```typescript
const allDone = extractions.reduce(
  (acc, item) => acc && !item.pending,
  true
);
```

The framework would handle unwrapping proxies internally.

**Pros:** General-purpose, familiar API
**Cons:** Still has the "reduce over proxies" implementation challenge

#### Option C: Better Handler Ergonomics

Instead of new primitives, make the handler-based approach nicer:

```typescript
// Current: awkward .get() calls
const collectResults = handler((_, { extractions }) => {
  for (const e of extractions) {
    const pending = e.pending.get?.() ?? e.pending;  // Ugly
    // ...
  }
});

// Improved: handlers automatically unwrap cells
const collectResults = handler((_, { extractions }) => {
  // extractions is already unwrapped!
  for (const e of extractions) {
    if (e.pending) continue;  // Just works
    results.push(e.result);
  }
});
```

**Pros:** Works within existing model, no new concepts
**Cons:** Still requires user action to trigger

#### Option D: Accept the Multi-Charm Pattern

Maybe the answer is: **don't build monolithic pipelines**.

```
Charm 1: Email Parser       → outputs: parsedArticles
Charm 2: Link Extractor     → inputs: parsedArticles, outputs: extractedLinks
Charm 3: Report Summarizer  → inputs: extractedLinks, outputs: summaries
```

Each charm is simple, testable, and handles one phase. Users link them together. The framework's job is making charm linking seamless, not enabling mega-patterns.

---

### 🟢 VERDICT

The `whenAll()` proposal is **appealing but possibly misguided**. It:

1. ✅ Would solve our immediate problem elegantly
2. ❌ May not fit the reactive philosophy (waiting is imperative)
3. ❌ Has unclear semantics for dynamic arrays and errors
4. ❌ Might encourage complex patterns that should be decomposed
5. ❓ May be solvable with smaller primitives (`effect()`, better handlers)

**Recommendation for framework author discussion:**

> "We're struggling with aggregating completion across dynamic arrays. We sketched `whenAll()` but realize it may be too specific or philosophically wrong. What's your view on:
> 1. Should patterns support multi-phase pipelines, or should that be multiple linked charms?
> 2. Would exposing `effect()` be acceptable, or does that break the reactive model?
> 3. Is there a simpler primitive we're missing?"

The answer might be: "Use multiple charms" or "The Continue button is the right pattern" - and that's a valid framework opinion.

---

### 🧠 DEEPER ANALYSIS: Why MapReduce Was Brilliant (And What We Can Learn)

Before proposing a MapReduce-inspired primitive, let's understand WHY MapReduce was so transformative at Google scale. The insights are relevant.

#### The Problem MapReduce Solved

Google had petabytes of web pages to process. The naive approach:
```
for each page in all_pages:
    process(page)
    accumulate(result)
```

This fails at scale because:
- **Sequential processing** - One page at a time is too slow
- **Shared state** - The accumulator becomes a bottleneck
- **Failure handling** - If one page fails, restart everything?
- **Resource coordination** - How do you distribute work across 10,000 machines?

#### The MapReduce Insight: Separate "What" From "How"

MapReduce's brilliance was decomposing computation into two **pure functions**:

```
MAP:    (key, value) → list of (key', value')
REDUCE: (key', list of value') → (key', aggregated_value')
```

**Why this decomposition is powerful:**

1. **Map is Embarrassingly Parallel**
   - Each mapper works on one chunk, independently
   - No coordination between mappers
   - No shared state
   - Failures are isolated - just retry that chunk

2. **The Only Synchronization is the Shuffle**
   - Map emits (key, value) pairs
   - Framework groups values by key
   - This is the ONLY place data from different mappers "meets"
   - It's a well-defined, optimizable operation

3. **Reduce is Also Parallel (Per Key)**
   - Each key's values reduced independently
   - Different keys reduced in parallel
   - Reducer is just a fold/accumulate operation

4. **No "Waiting for All"**
   - Reducers can start as soon as ANY mapper completes for their key
   - It's **streaming**, not batch
   - Values flow through the system incrementally

#### The Key Insight We Missed

Our `whenAll()` proposal thought in **batch** terms:
```
[all mappers complete] → BARRIER → [proceed to reduce]
```

But MapReduce is **streaming**:
```
[mapper 1 completes] → values flow to reducer → [reducer updates]
[mapper 2 completes] → values flow to reducer → [reducer updates]
[mapper 3 completes] → values flow to reducer → [reducer updates]
...
```

**There is no "wait for all" in MapReduce!** Values flow incrementally. The reduce accumulates progressively. The system converges toward completion, but there's no explicit barrier.

#### Why This Fits Reactive Systems Perfectly

Reactive systems are inherently **streaming**:
- Values change over time
- Derived computations update when dependencies change
- Data flows through the graph incrementally

The mismatch in our thinking was:
- We wanted **batch semantics** (`whenAll` → proceed)
- The framework provides **streaming semantics** (values update → derivations update)

**We were fighting the reactive model instead of embracing it!**

#### What MapReduce Teaches Us

| Concept | MapReduce | Reactive Framework | Our Problem |
|---------|-----------|-------------------|-------------|
| **Map** | Pure function on each item | `Cell.map()` | ✅ Works! |
| **Emit** | (key, value) pairs | Cell updates | ✅ Works! |
| **Shuffle** | Group by key | Dependency tracking | ✅ Built-in! |
| **Reduce** | Fold values for each key | ??? | ❌ Missing! |

**The gap isn't `whenAll()` - it's a proper reactive REDUCE!**

#### The Real Primitive We Need: Streaming Reduce

Instead of "wait for all, then aggregate", we need "aggregate incrementally as items complete":

```typescript
// MapReduce-inspired: incremental aggregation
const links = articles.mapReduce({
  // Map: extract links from each article (parallel, cached)
  map: (article) => generateObject({
    prompt: `Extract links from: ${article.content}`,
    schema: LINK_SCHEMA,
  }),

  // Reduce: accumulate results as they arrive (streaming)
  reduce: (accumulated, item) => {
    if (item.pending) return accumulated;  // Skip pending
    if (item.error) return accumulated;     // Skip errors
    return [...accumulated, ...item.result.links];  // Accumulate
  },

  initial: [],  // Starting accumulator
});

// links updates incrementally as each extraction completes!
// No "waiting" - just reactive updates
```

**Why this fits reactive philosophy:**
1. **No barriers** - Results flow through as they complete
2. **Progressive updates** - UI shows partial results immediately
3. **Pure functions** - Map and reduce are both pure
4. **Streaming** - Embraces the reactive model instead of fighting it

#### Why This Is Better Than `whenAll()`

| Aspect | `whenAll()` | `mapReduce()` |
|--------|-------------|---------------|
| **Semantics** | Batch (wait for all) | Streaming (incremental) |
| **Partial results** | None until complete | Available immediately |
| **Dynamic arrays** | Ambiguous | Natural (new items join stream) |
| **Fits reactive model** | Somewhat forced | Native fit |
| **Error handling** | All-or-nothing | Per-item (skip errors) |
| **Progress** | Binary (pending/done) | Continuous (N items accumulated) |

#### The Deeper Lesson

MapReduce succeeded because it **matched the nature of the problem**:
- Data is distributed → Map is distributed
- Aggregation needs coordination → Shuffle provides it
- Results build up → Reduce accumulates

Similarly, a reactive framework primitive should **match the reactive nature**:
- Items complete asynchronously → Process them as they complete
- Results build up over time → Accumulate incrementally
- No natural "end" → The accumulator is always "current"

**We were trying to impose batch thinking on a streaming system. MapReduce shows us how to think in streams.**

---

### 🔧 PROPOSED PRIMITIVE: Reactive `reduce()`

#### The Core Problem (Revisited)

Why doesn't this work today?

```typescript
const links = derive(extractions, (items) => {
  return items.reduce((acc, item) => {
    if (item.pending) return acc;  // BUG: item.pending is a PROXY, not boolean!
    return [...acc, ...item.result.links];
  }, []);
});
```

The issue: inside `derive()`, array items are **proxied cells**. Accessing `.pending` returns another proxy, not a boolean. The proxy is truthy, so the condition always fails.

#### What Reduce Needs to Do Differently

The key insight: **reduce needs to UNWRAP values** before passing them to the reducer function, similar to how:
- **Handlers** receive unwrapped values (you can use `.get()` or values are plain)
- **JSX** unwraps cells via `effect()` internally

A reactive `reduce()` would:
1. Iterate over the array cell
2. For each item, **unwrap** the cell to get plain values
3. Call the reducer with **plain values** (not proxies)
4. Track dependencies on each unwrapped cell
5. Re-run when any dependency changes
6. Return a cell containing the accumulated result

#### Proposed API

```typescript
import { reduce } from "commontools";

// Basic usage
const completedLinks = reduce(
  extractions,                          // Array cell to reduce
  (acc, item) => {                      // Reducer function (receives UNWRAPPED values!)
    if (item.pending) return acc;       // item.pending is boolean, not proxy!
    if (item.error) return acc;         // item.error is Error | undefined
    return [...acc, ...item.result.links];  // item.result is the actual object
  },
  []                                    // Initial accumulator
);

// completedLinks: OpaqueRef<string[]>
// Updates incrementally as each extraction completes
```

#### How It Would Work Internally

```typescript
// Conceptual implementation (in builtins/reduce.ts)
export function reduceBuiltin(
  inputsCell: Cell<{
    array: Array<{ pending: boolean; result: any; error: any }>;
    initial: any;
  }>,
  reducerRecipe: Recipe,  // The reducer function wrapped as a recipe
  sendResult: (tx, result) => void,
  addCancel: AddCancel,
  runtime: IRuntime,
): Action {
  return (tx) => {
    // Get array with schema that unwraps cells to plain values
    const { array, initial } = inputsCell.asSchema({
      type: "object",
      properties: {
        array: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pending: { type: "boolean" },
              result: { asCell: false },  // Unwrap to plain value!
              error: {},
            },
          },
        },
        initial: {},
      },
    }).withTx(tx).get();

    // Run reducer with unwrapped values
    let accumulator = initial;
    for (let i = 0; i < (array?.length ?? 0); i++) {
      const item = array[i];
      // item.pending is now a real boolean!
      // item.result is now the actual value!
      accumulator = runReducer(reducerRecipe, accumulator, item, i);
    }

    sendResult(tx, accumulator);
  };
}
```

#### The Key Difference from derive()

| Aspect | `derive()` | `reduce()` |
|--------|-----------|-----------|
| **Values received** | Proxied cells | Unwrapped plain values |
| **item.pending** | Returns proxy (truthy object) | Returns boolean |
| **item.result** | Returns proxy | Returns actual value |
| **Dependency tracking** | Via proxy access | Via schema unwrapping |
| **Use case** | Transform values | Aggregate values |

#### Transformation by ts-transformers

Like `map()` callbacks, `reduce()` callbacks would be transformed:

**Pattern code:**
```typescript
const links = extractions.reduce(
  (acc, item) => item.pending ? acc : [...acc, ...item.result.links],
  []
);
```

**Transformed to:**
```typescript
const links = extractions.reduceWithRecipe(
  recipe(({ accumulator, element, params }) =>
    element.pending ? accumulator : [...accumulator, ...element.result.links]
  ),
  { /* captured variables */ },
  []  // initial
);
```

#### Full Example: Streaming Pipeline

```typescript
export default pattern<Input, Output>(({ emails, existingReports }) => {
  // Phase 1: Parse emails (sync)
  const articles = derive(emails, e => e.filter(hasURL).map(toArticle));

  // Phase 2: Extract links via LLM (async, per-item cached)
  const extractions = articles.map(article =>
    generateObject({
      prompt: `Extract links from: ${article.content}`,
      schema: LINK_SCHEMA,
    })
  );

  // Phase 3: Aggregate completed results (STREAMING!)
  const extractedLinks = reduce(
    extractions,
    (acc, item) => {
      if (item.pending || item.error) return acc;
      return [...acc, ...item.result.links];
    },
    []
  );
  // extractedLinks updates incrementally as each extraction completes!

  // Phase 4: Derive novel URLs (sync, reactive)
  const novelURLs = derive(
    [extractedLinks, existingReports],
    ([links, existing]) => dedupeAndFilter(links, existing)
  );
  // novelURLs updates as extractedLinks grows!

  // Phase 5: Fetch novel reports (async, per-item cached)
  const reportFetches = novelURLs.map(url => fetchData({ url }));

  // Phase 6: Aggregate fetched reports (STREAMING!)
  const fetchedReports = reduce(
    reportFetches,
    (acc, item) => {
      if (item.pending || item.error) return acc;
      return [...acc, { url: item.url, content: item.result }];
    },
    []
  );

  // Progress computed reactively
  const extractionProgress = reduce(
    extractions,
    (acc, item) => ({
      total: acc.total + 1,
      completed: acc.completed + (item.pending ? 0 : 1),
      errors: acc.errors + (item.error ? 1 : 0),
    }),
    { total: 0, completed: 0, errors: 0 }
  );

  return {
    [NAME]: "Prompt Injection Tracker",
    [UI]: (
      <div>
        <h2>Extraction Progress</h2>
        <p>{extractionProgress.completed}/{extractionProgress.total} complete</p>
        {extractionProgress.errors > 0 && (
          <p>⚠️ {extractionProgress.errors} errors</p>
        )}

        <h2>Found Links ({extractedLinks.length})</h2>
        {/* Links appear incrementally as extractions complete */}
        {extractedLinks.map(link => <LinkItem link={link} />)}

        <h2>Novel Reports ({fetchedReports.length})</h2>
        {fetchedReports.map(report => <ReportCard report={report} />)}
      </div>
    ),
    reports: fetchedReports,
  };
});
```

#### Why This Works

1. **No barriers** - Each phase flows into the next incrementally
2. **Streaming** - Results appear as items complete, not all-at-once
3. **Reactive** - Everything updates automatically via dependency tracking
4. **Cacheable** - Per-item operations (map) are cached individually
5. **Pure functions** - Both map and reduce are pure transformations
6. **Fits the model** - Uses cells and derivations, no imperative tricks

#### Implementation Complexity: Medium

The reduce builtin would need to:
1. Handle array iteration with schema-based unwrapping
2. Track dependencies on each array item's relevant properties
3. Re-run when any tracked property changes
4. Support the closure transformation (capture external variables)

This is similar in complexity to the existing `map` builtin, which already:
- Iterates over arrays
- Runs recipes per item
- Tracks dependencies
- Handles closures via transformation

#### Comparison to Alternatives

| Approach | Streaming | Fits Model | Implementation |
|----------|-----------|------------|----------------|
| `whenAll()` | ❌ Batch | ⚠️ Forced | Medium |
| `effect()` export | ✅ | ❌ Imperative | Low |
| `reduce()` | ✅ | ✅ Native | Medium |
| Better handlers | N/A | ✅ | Low |

**Recommendation:** `reduce()` is the most philosophically aligned solution.
