---
topic: llm
discovered: 2025-11-29
confirmed_count: 3
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

> "The dumb looking approach where it's just a map should work"
> - Framework author, Nov 2025

---

# The "Dumb Map Approach" Works for ALL Reactive Primitives

## Key Insight

When you need to call reactive primitives for each item in a list, **just use `.map()` directly**. Don't build complex caching layers or trigger patterns.

**This works for ALL reactive primitives:**
- `generateObject()` - LLM structured output (cached by prompt + schema)
- `fetchData()` - Web requests (cached by URL + options)
- `generateText()` - LLM text output (cached by prompt)

```typescript
// THIS WORKS - "dumb map approach" for generateObject
const extractions = items.map((item) => ({
  itemId: item.id,
  extraction: generateObject({
    system: "Extract data from this item...",
    prompt: item.content,
    model: "anthropic:claude-sonnet-4-5",
    schema: EXTRACTION_SCHEMA,
  }),
}));

// THIS ALSO WORKS - "dumb map approach" for fetchData
const webContent = urls.map((url) => ({
  url,
  content: fetchData({
    url: "/api/agent-tools/web-read",
    mode: "json",
    options: { method: "POST", body: { url } },
  }),
}));
```

## Verified Behaviors

We tested with 100 items and confirmed:

1. **Incremental caching works**: When you add 1 item to a list of 100, only 1 new LLM call is made. The other 100 items stay cached (show results instantly).

2. **Per-item reactivity**: Each item's `generateObject` is independent. Changing item #5 only re-triggers the LLM for item #5.

3. **Access results directly**: In JSX, access `.pending`, `.result`, `.error` directly:
   ```tsx
   {extractions.map((e) => (
     <div>
       {e.extraction.pending ? "Loading..." : e.extraction.result?.data}
     </div>
   ))}
   ```

## Test Case That Verified This

```typescript
// From map-test-100-items.tsx
const extractions = items.map((item) => ({
  itemId: item.id,
  extraction: generateObject({
    system: "Count the words in the content and return the count.",
    prompt: item.content,
    model: "anthropic:claude-sonnet-4-5",
    schema: {
      type: "object" as const,
      properties: {
        wordCount: { type: "number" as const },
      },
      required: ["wordCount"] as const,
    },
  }),
}));

// Track pending count
const pendingCount = derive(extractions, (list) =>
  list.filter((e: any) => e.extraction?.pending).length
);
```

**Results:**
- Started with 5 items, all completed (0/5 pending)
- Added 1 item → showed 1/6 pending (only the new item)
- New item completed → 0/6 pending
- **Conclusion:** Adding 1 item triggers exactly 1 new LLM call

## Known Limitation

**Reactive state is NOT preserved across page reloads.**

Framework author acknowledged:
> "for this we need to remember reactive state and that's a non-trivial runtime change"

On reload, all items will re-request from the LLM (though API-level caching may help speed up responses).

## Multi-Level Caching Composes Automatically

**UPDATE 2025-11-29**: Tested three-level caching pipeline in prompt-injection-tracker-v3:

```typescript
// Level 1: Extract links from articles (generateObject, cached by content)
const extractions = articles.map((article) => ({
  extraction: generateObject({ prompt: article.content, ... }),
}));

// Level 2: Fetch web content for each link (fetchData, cached by URL)
const webContent = extractedLinks.map((url) => ({
  content: fetchData({ url: "/api/agent-tools/web-read", options: { body: { url } } }),
}));

// Level 3: Summarize fetched content (generateObject, cached by fetched content)
const summaries = webContent.map((item) => ({
  summary: generateObject({ prompt: item.content.result, ... }),
}));
```

**Test Results:**
- 5 articles → 11 unique links extracted (Level 1)
- 11 web pages fetched via fetchData (Level 2)
- 11 summaries generated with severity + LLM-specific flags (Level 3)
- Each level caches independently - changing one article only triggers cascading updates for affected items

## Related

- See `2025-11-29-llm-no-custom-caching-layers.md` for what NOT to do
- See `2025-11-29-llm-no-opaqueref-casting.md` for another anti-pattern

---

**Confidence level:** HIGH (framework author confirmed + verified with testing)
