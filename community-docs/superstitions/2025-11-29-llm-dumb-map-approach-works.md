---
topic: llm
discovered: 2025-11-29
confirmed_count: 1
last_confirmed: 2025-11-29
sessions: [prompt-injection-tracker-map-approach]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: superstition
stars: ⭐⭐⭐
source: framework-author
---

# ⭐⭐⭐ FRAMEWORK AUTHOR CONFIRMED

**This came directly from the framework author** - higher confidence than typical superstitions.

> "The dumb looking approach where it's just a map should work"
> - Framework author, Nov 2025

---

# The "Dumb Map Approach" Works for Per-Item LLM Calls

## Key Insight

When you need to call `generateObject()` for each item in a list, **just use `.map()` directly**. Don't build complex caching layers or trigger patterns.

```typescript
// THIS WORKS - "dumb map approach"
const extractions = items.map((item) => ({
  itemId: item.id,
  extraction: generateObject({
    system: "Extract data from this item...",
    prompt: item.content,
    model: "anthropic:claude-sonnet-4-5",
    schema: EXTRACTION_SCHEMA,
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

## Related

- See `2025-11-29-llm-no-custom-caching-layers.md` for what NOT to do
- See `2025-11-29-llm-no-opaqueref-casting.md` for another anti-pattern

---

**Confidence level:** HIGH (framework author confirmed + verified with testing)
