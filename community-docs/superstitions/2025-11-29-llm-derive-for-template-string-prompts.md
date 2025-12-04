---
topic: llm
discovered: 2025-11-29
confirmed_count: 1
last_confirmed: 2025-11-29
sessions: [prompt-injection-tracker-v3]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: superstition
stars: ⭐⭐
---

# ⚠️ SUPERSTITION - PARTIALLY VERIFIED

**This is based on an error encountered during development.** It clarifies when `derive()` is needed vs when direct access works.

---

# Use derive() for Template String Prompts with Multiple Properties

## The Distinction

**IMPORTANT UPDATE:** Testing revealed that even direct property access may need derive() for proper `.result` population:

```typescript
// ⚠️ COMPILE SUCCESS BUT .result UNDEFINED
const extractions = items.map((item) => ({
  extraction: generateObject({
    prompt: item.content,  // Compiles, but result may be undefined!
    schema: SCHEMA,
  }),
}));

// ✅ WORKS - result is populated correctly
const extractions = items.map((item) => ({
  extraction: generateObject({
    prompt: derive(item, (i) => i?.content ?? ""),
    schema: SCHEMA,
  }),
}));
```

**Template strings with multiple properties need derive()**:
```typescript
// ❌ FAILS - "Tried to directly access an opaque value"
const extractions = articles.map((article) => ({
  extraction: generateObject({
    prompt: `Title: ${article.title}
Content: ${article.content}`,  // Closure over opaque values!
    schema: SCHEMA,
  }),
}));

// ✅ WORKS - use derive() to build the prompt
const extractions = articles.map((article) => ({
  extraction: generateObject({
    prompt: derive(article, (a) => {
      if (!a) return "";
      return `Title: ${a.title}
Content: ${a.content}`;
    }),
    schema: SCHEMA,
  }),
}));
```

## Why This Happens

Template strings in JavaScript are evaluated immediately. When you write:
```typescript
`Title: ${article.title}`
```

JavaScript tries to access `article.title` right then to build the string. But `article` is an `OpaqueRef` (a reactive wrapper), so direct access fails.

Using `derive()`:
- The framework tracks which properties you access
- The template string is built reactively when `article` data is available
- Changes to `article` trigger re-evaluation

## When to Use Each

| Scenario | Approach |
|----------|----------|
| Single property as prompt | Direct: `prompt: item.content` |
| Template with one property | Either works, derive() safer |
| Template with multiple properties | **Must use derive()** |
| Conditional prompt building | **Must use derive()** |

## Context

Discovered while building prompt-injection-tracker-v3:
- Simple `item.content` worked in map-test-100-items.tsx
- Template string with `${article.title}` and `${article.content}` failed
- Adding `derive()` around the template string fixed it

## Related

- `2025-11-29-llm-dumb-map-approach-works.md` - The overall pattern that works
- `2025-11-22-llm-generateObject-reactive-map-derive.md` - Similar issue with image data

---

## ⚠️ UPDATE (Dec 3, 2025): BOTH APPROACHES WORK

**Systematic testing with `2025-12-03-derive-vs-direct-cell-test.tsx` showed:**

| Scenario | Direct Cell/Property | derive() Wrapper |
|----------|---------------------|------------------|
| User input | ✅ Works | ✅ Works |
| User input (rapid typing) | ✅ Works | ✅ Works |
| map() with handler-loaded items | ✅ Works | ✅ Works |

**Conclusion:** Both approaches work identically. The earlier conflicting observations may have been:
1. Bugs that were fixed in the framework
2. Context-specific issues with pre-populated defaults
3. Misattributed causes from other issues

**Recommendation:** Use whichever is more readable. For template strings with multiple properties, derive() is still required (to avoid "opaque value" errors).

---

**Confidence level:** HIGH (systematic A/B testing, both approaches work)
