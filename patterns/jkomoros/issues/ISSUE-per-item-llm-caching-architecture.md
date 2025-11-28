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

**Result:** Works functionally, but:
- ❓ Does server-side LLM caching apply to raw fetch requests?
- ❌ Not idiomatic (bypasses reactive generateObject)
- ❌ Can't show reactive progress in UI easily

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

### Architecture B: Imperative Handler with fetch() (Works but not idiomatic)

```
User clicks button
        ↓
handler runs async loop:
  for each article:
    await fetch("/api/ai/llm/generateObject", {...})
    update progress cell
        ↓
  collect novel URLs
        ↓
  for each novel URL:
    await fetch("/api/ai/llm/generateObject", {...})
        ↓
  save reports to cell
```

**Pros:**
- Works today
- Full control over async flow
- Can update progress cells during execution

**Cons:**
- ❓ Does server-side caching work for raw fetch?
- Not idiomatic (bypasses reactive system)
- Imperative instead of declarative

**Question:** Does the server cache LLM requests regardless of how they're made?

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

## Specific Questions for Framework Author

1. **Per-item generateObject from dynamic arrays:**
   The docs show `emails.map(email => generateObject({...}))` working. But when the source array comes from `derive()`, this doesn't seem to work. Is there a pattern for this?

2. **Server-side LLM caching:**
   Does the server cache LLM requests based on (system + prompt + schema) regardless of whether they come from reactive `generateObject` or raw `fetch()`?

3. **Triggering reactive things from handlers:**
   Is there a way to "kick off" multiple independent `generateObject` calls from a handler that will each be cached individually?

4. **Recommended architecture:**
   For "process N items with LLM, cache per-item" use case, what's the idiomatic pattern?

## Related Code/Docs

- **Pattern:** `patterns/jkomoros/prompt-injection-tracker.tsx`
- **Official docs:** `~/Code/labs/docs/common/LLM.md`
- **Superstition:** `community-docs/superstitions/2025-11-22-llm-generateObject-reactive-map-derive.md`
- **Superstition:** `community-docs/superstitions/2025-11-27-llm-never-raw-fetch-use-generateObject.md`

## Environment

- Local dev (localhost:8000 / localhost:5173)
- Date: November 27, 2025
- labs repo: HEAD of main
