---
topic: llm
discovered: 2025-11-27
confirmed_count: 1
last_confirmed: 2025-11-27
sessions: [prompt-injection-tracker-dev]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

---

# NEVER Use Raw fetch() for LLM APIs - Use generateObject Instead

## Problem

When calling LLM APIs from patterns, using raw `fetch()` to `/api/ai/llm/generateObject`:

1. **Bypasses framework LLM caching** - each call is a fresh HTTP request
2. **May be restricted by policy in future** - direct API access might be limited
3. **Makes debugging harder** - not visible in framework tooling

**Example of what NOT to do:**

```typescript
// ❌ BAD - bypasses caching, may be restricted
async function callLLM(system: string, prompt: string, schema: object): Promise<any> {
  const response = await fetch("/api/ai/llm/generateObject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      messages: [{ role: "user", content: prompt }],
      model: "anthropic:claude-sonnet-4-5",
      schema,
    }),
  });
  if (!response.ok) throw new Error(`LLM API error: ${response.status}`);
  const data = await response.json();
  return data.object;
}
```

## Solution That Seemed To Work

Use the reactive `generateObject` function from commontools instead:

```typescript
import { generateObject, cell } from "commontools";

// ✅ GOOD - uses framework caching
const promptTrigger = cell<string>("");

const { result, pending } = generateObject({
  system: "Your system prompt here",
  prompt: promptTrigger,  // Reactive - triggers when this changes
  model: "anthropic:claude-sonnet-4-5",
  schema: {
    type: "object",
    properties: { /* your schema */ },
    required: ["..."],
  },
});

// To trigger LLM call, set the prompt cell
// Framework will cache identical prompts and return cached results instantly
promptTrigger.set(JSON.stringify({ articleURL, articleContent, title }));
```

## Key Insight

For LLM caching to work, the prompt must be **character-by-character identical**. This means:

1. Cache any dynamic content (like fetched web pages) in a cell first
2. Build prompts deterministically from cached content
3. Use `generateObject` which integrates with framework caching

**Architecture for consistent prompts:**

```
URL → webPageCache (cell) → build prompt from cache → generateObject (cached)
      ↓
      Content is IMMUTABLE once cached
      ↓
      Same URL = same content = same prompt = cached LLM response
```

## Context

Discovered while building prompt-injection-tracker pattern. Initial implementation used `callLLM()` helper with raw fetch, which:
- Made fresh LLM call every time even for identical prompts
- Cost money and time for repeated processing
- Didn't benefit from framework's automatic caching

After discussing with framework author, learned that `generateObject` is the correct approach.

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/LLM.md`
- **Related superstition:** `2025-11-22-llm-generateObject-reactive-map-derive.md`
- **Related superstition:** `2025-11-25-generateObject-race-condition-pass-cell-directly.md`

## Next Steps

- [ ] Needs confirmation by another session
- [ ] Verify caching behavior in production
- [ ] Check if official docs explicitly state this

## Notes

- The reactive nature of `generateObject` requires a different architecture than imperative `callLLM()`
- May need to use trigger cells to control when LLM runs
- Consider using `pending` to track in-progress LLM calls
- For per-item caching, each item needs its own `generateObject` call (not batched)

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
