# LLM - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/LLM.md`

---

## The "Dumb Map Approach" Works for ALL Reactive Primitives

⭐⭐⭐ (Framework author confirmed + testing verified)

**Source:** Framework author explicitly stated: "The dumb looking approach where it's just a map should work"

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

### Verified Behaviors

Tested with 100 items and confirmed:

1. **Incremental caching works**: When you add 1 item to a list of 100, only 1 new LLM call is made. The other 100 items stay cached (show results instantly).

2. **Per-item reactivity**: Each item's `generateObject` is independent. Changing item #5 only re-triggers the LLM for item #5.

3. **Multi-level caching composes**: Chains of generateObject -> fetchData -> generateObject work correctly. Each level caches independently.

### Known Limitation

**Reactive state is NOT preserved across page reloads.** Framework author acknowledged this requires a non-trivial runtime change.

**Related:** `~/Code/labs/docs/common/LLM.md`

**Guestbook:**
- ✅ 2025-11-29 - Framework author confirmed approach (jkomoros)
- ✅ 2025-11-29 - Tested with 100-item list, confirmed 1 new item = 1 new LLM call (jkomoros)
- ✅ 2025-11-29 - Tested 3-level caching pipeline in prompt-injection-tracker (jkomoros)

---

## DON'T Build Custom Caching Layers for LLM Calls

⭐⭐⭐ (Framework author confirmed)

**Source:** Framework author: "Ugh, no, it is building another layer of caching on top"

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

### Why It's Wrong

1. **The framework already caches**: `generateObject()` caches based on the exact prompt string
2. **Double caching causes problems**: You're adding complexity for no benefit
3. **Hard to debug**: Two caching layers means two places things can go wrong
4. **Unnecessary code**: More code to maintain, more bugs to fix

### What To Do Instead

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

**Related:** See "The Dumb Map Approach" entry above

**Guestbook:**
- ✅ 2025-11-29 - Framework author explicitly rejected custom caching approach (jkomoros)
- ✅ 2025-11-29 - Verified fetchData also caches automatically (jkomoros)

---

## When to Use derive() for generateObject Prompts

⭐⭐⭐ (Systematic A/B testing verified)

**Short answer:** Use derive() for template strings with multiple properties. Otherwise, either approach works.

### The Rules

| Scenario | Direct Cell | derive() | Recommendation |
|----------|-------------|----------|----------------|
| Single property | ✅ Works | ✅ Works | Either |
| User input (even rapid typing) | ✅ Works | ✅ Works | Either |
| Template with multiple properties | ❌ Fails* | ✅ Works | **Use derive()** |
| Conditional prompt building | ❌ Fails* | ✅ Works | **Use derive()** |

*Fails with "Tried to directly access an opaque value" error.

### Why Template Strings Need derive()

Template strings in JavaScript are evaluated immediately:

```typescript
// ❌ FAILS - JS tries to access article.title immediately
prompt: `Title: ${article.title}
Content: ${article.content}`
```

Using `derive()`, the framework properly tracks dependencies:

```typescript
// ✅ WORKS
prompt: derive(article, (a) => {
  if (!a) return "";
  return `Title: ${a.title}
Content: ${a.content}`;
})
```

### Single Property Access Works Either Way

```typescript
// Both work identically
prompt: item.content
prompt: derive(item, (i) => i?.content ?? "")
```

### Previous "Race Condition" Concerns Resolved

Earlier observations suggested direct Cell access caused stuck pending states. Systematic testing (Dec 2025) proved this was either:
1. A framework bug that was fixed
2. A different issue misattributed to this
3. Context-specific to pre-populated defaults

Both approaches now work reliably.

**Related:** `~/Code/labs/docs/common/LLM.md`

**Guestbook:**
- ✅ 2025-11-25 - Original observation of direct vs derive differences (jkomoros)
- ✅ 2025-11-29 - Template string requires derive() (jkomoros)
- ✅ 2025-12-03 - Systematic A/B testing confirmed both work for single properties (jkomoros)

---
