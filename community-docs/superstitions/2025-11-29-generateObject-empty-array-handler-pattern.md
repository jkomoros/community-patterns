---
topic: llm, generateObject, map, handler, pattern
discovered: 2025-11-29
confirmed_count: 1
last_confirmed: 2025-11-29
sessions: [prompt-injection-tracker-v3]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: superstition
stars: ⭐⭐⭐⭐
---

# ⚠️ SUPERSTITION - NEEDS VERIFICATION

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

---

# generateObject with map(): Use Empty Array + Handler, NOT Pre-populated Default

## The Problem

When using `items.map((item) => generateObject({...}))` pattern, pre-populated default data results in `.result` being undefined even when `pending: false`.

**Symptoms:**
- UI shows completed (checkmarks, `pending: false`)
- Debug output shows `result` field is MISSING entirely
- LLM calls may complete but results aren't stored

## What DOESN'T Work

```typescript
// ❌ BROKEN: Pre-populated default data
interface MyInput {
  articles: Default<Article[], typeof TEST_ARTICLES>;  // Pre-populated!
}

const extractions = articles.map((article) => ({
  extraction: generateObject({
    prompt: article.content,
    schema: SCHEMA,
  }),
}));
// Result: extraction.result is UNDEFINED even when pending: false
```

## What WORKS

```typescript
// ✅ WORKS: Empty array default + handler to load data
interface MyInput {
  articles: Default<Article[], []>;  // Start empty!
}

// Handler to load articles
const loadArticles = handler<unknown, { articles: Cell<Article[]> }>(
  (_event, { articles }) => {
    for (const article of TEST_ARTICLES) {
      articles.push(article);
    }
  }
);

const extractions = articles.map((article) => ({
  extraction: generateObject({
    prompt: article.content,
    schema: SCHEMA,
  }),
}));
// Result: extraction.result has data after pending: false
```

## Why This Might Work

The framework's reactive system may handle items differently based on how they're added:

1. **Pre-populated defaults**: Items exist at pattern initialization time. The map + generateObject may not properly wire up the reactive dependencies.

2. **Handler-added items**: Items are added through the reactive system (via `Cell.push()`). This properly triggers the reactive graph and wires up generateObject results.

## Verified Behavior

Tested with prompt-injection-tracker-v3:

| Approach | `.pending` | `.result` | URLs extracted |
|----------|------------|-----------|----------------|
| Pre-populated default | `false` | `undefined` | 0 |
| Empty default + handler | `false` | `{urls: [...]}` | 12 |

## Implementation Pattern

```typescript
// 1. Start with empty array
interface Input {
  items: Default<Item[], []>;
}

// 2. Create handler to load data
const loadItems = handler<unknown, { items: Cell<Item[]> }>(
  (_event, { items }) => {
    for (const item of DATA) {
      items.push(item);
    }
  }
);

// 3. Map with generateObject
const results = items.map((item) => ({
  result: generateObject({
    prompt: item.content,
    schema: SCHEMA,
  }),
}));

// 4. Add load button to UI
<button onClick={loadItems({ items })}>Load Data</button>
```

## Related

- `map-test-100-items.tsx` - Working pattern that uses empty default + addItem handler
- `2025-11-29-llm-derive-for-template-string-prompts.md` - Earlier findings (may be superseded)
- `2025-11-25-generateObject-race-condition-pass-cell-directly.md` - Earlier superstition

## Context

Discovered while building prompt-injection-tracker-v3:
- Initial approach with `Default<Article[], typeof TEST_ARTICLES>` showed 0 links
- Switching to `Default<Article[], []>` + handler showed 12 links
- The key difference is HOW items enter the reactive system

## Questions for Framework Author

1. Is this expected behavior with pre-populated defaults?
2. Is there a way to use pre-populated defaults with generateObject in map?
3. Should the framework handle both cases the same way?

---

## Framework Author Response (seefeldb, 2025-12-03)

> "default propagation bug, hopefully Robin's bug fixes it"

### Test Results (Dec 3, 2025)

Testing with `2025-12-03-prepopulated-defaults-test.tsx`:

| Approach | Items | generateObject Results |
|----------|-------|------------------------|
| `Default<T[], typeof CONST>` | 0 items | N/A (array empty!) |
| Empty default + handler | 3 items | ✅ All work correctly |

**Key finding:** The `typeof CONST` default syntax doesn't populate the array at all in our test. This might be a separate issue from the original superstition, or the same "default propagation bug" Berni mentioned.

### Recommendation

**Use the handler pattern until Robin's fix lands:**

```typescript
// Start with empty array
items: Default<Item[], []>;

// Load via handler
const loadItems = handler<unknown, { items: Cell<Item[]> }>(
  (_, { items }) => {
    for (const item of DATA) items.push(item);
  }
);
```

### Repro

See: `community-docs/superstitions/repros/2025-12-03-prepopulated-defaults-test.tsx`

---

**Confidence level:** HIGH (clear A/B test, reproducible)
