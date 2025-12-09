---
topic: llm
discovered: 2025-11-29
confirmed_count: 2
last_confirmed: 2025-12-08
sessions: [prompt-injection-tracker-map-approach, verification-testing]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: promoted
stars: ⭐⭐⭐
source: framework-author
promoted_to: folk_wisdom/llm.md
---

# PROMOTED TO FOLK WISDOM

**This superstition has been promoted to folk wisdom.**

See: `community-docs/folk_wisdom/llm.md`

---

**Original content preserved below.**

---

# ⭐⭐⭐ FRAMEWORK AUTHOR CONFIRMED

**This came directly from the framework author** - higher confidence than typical superstitions.

> "Ugh, no, it is building another layer of caching on top"
> - Framework author, Nov 2025 (reacting to a webPageCache pattern)

---

# DON'T Build Custom Caching Layers for LLM Calls

## Anti-Pattern

Don't create your own caching mechanisms for LLM calls:

```typescript
// ❌ WRONG - Don't do this
interface CachedWebPage {
  content: string;
  fetchedAt: string;
}

const webPageCache = cell<Record<string, CachedWebPage>>({});

// Check cache before calling LLM...
// Store results in cache...
// Complex derives to join cache with articles...
```

## Why It's Wrong

1. **The framework already caches**: `generateObject()` caches based on the exact prompt string
2. **Double caching causes problems**: You're adding complexity for no benefit
3. **Hard to debug**: Two caching layers means two places things can go wrong
4. **Unnecessary code**: More code to maintain, more bugs to fix

## What To Do Instead

Just use the "dumb map approach" - let the framework handle caching:

```typescript
// ✅ RIGHT - Let framework handle caching
const extractions = articles.map((article) =>
  generateObject({
    system: "Extract links...",
    prompt: article.content,  // Same content = cached response
    schema: EXTRACTION_SCHEMA,
  })
);
```

The framework will automatically:
- Cache based on the prompt string
- Return cached results for identical prompts
- Handle invalidation when prompts change

## Context

This came up when building a prompt-injection-tracker pattern that:
1. Fetches articles from Gmail
2. Extracts security report links via LLM
3. Summarizes reports via LLM

Initial implementation built a `webPageCache` to ensure "character-by-character identical prompts." Framework author explicitly rejected this approach.

## UPDATE: Use fetchData Instead of Handler-Based Caching

**UPDATE 2025-11-29**: Even for web fetching, you don't need custom caching! Use `fetchData`:

```typescript
// ✅ BETTER - Use fetchData with dumb map approach
const webContent = urls.map((url) => ({
  url,
  content: fetchData({
    url: "/api/agent-tools/web-read",
    mode: "json",
    options: { method: "POST", body: { url } },
  }),
}));
```

`fetchData` is cached by URL + options automatically. No handler needed!

**The key distinctions:**
- ❌ Don't cache LLM results yourself (use generateObject)
- ❌ Don't build handler-based web fetch caching (use fetchData)
- ✅ Use the "dumb map approach" for ALL reactive primitives

See `2025-11-29-llm-dumb-map-approach-works.md` for the full pattern.

---

**Confidence level:** HIGH (framework author explicitly rejected custom caching + fetchData verified working)
