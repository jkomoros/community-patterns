# Framework Runtime Questions

**Date:** 2025-12-02
**Context:** Confirmed behaviors from superstition verification. Question: **intentional or bug?**

---

## 1. generateObject: derive() vs direct Cell for prompts

**Conflicting superstitions - both confirmed with multiple observations.**

### Pattern A: Direct Cell (works for user input, avoids race conditions)

```tsx
interface Answer { answer: string; }

// This works - no race conditions
const result = generateObject({
  prompt: userInput,  // Cell<string> directly
  schema: toSchema<Answer>(),
});
```

### Pattern B: derive() (works for template strings in .map())

```tsx
interface Analysis { analysis: string; }

// This works - result is populated
items.map((item) => {
  const prompt = derive(item, (i) => `Analyze: ${i.name}`);
  const result = generateObject({
    prompt,  // derived Cell
    schema: toSchema<Analysis>(),
  });
  return result;
});
```

### The conflict

```tsx
interface Analysis { analysis: string; }
interface Answer { answer: string; }

// Pattern A in .map() - FAILS (result undefined)
items.map((item) => {
  const result = generateObject({
    prompt: item.name,  // direct access
    schema: toSchema<Analysis>(),
  });
  return result;  // <-- undefined
});

// Pattern B with user input - FAILS (race condition, stuck pending)
const prompt = derive(userInput, (text) => `Process: ${text}`);
const result = generateObject({
  prompt,
  schema: toSchema<Answer>(),
});
// result stays "pending" forever when userInput changes rapidly
```

**Question:** What's the correct pattern? When derive(), when direct?

---

## 2. derive() object parameter: types vs runtime mismatch

### Runtime behavior (auto-unwraps)

```tsx
const result = derive({ flag, count }, (values) => {
  // At RUNTIME:
  console.log(typeof values.flag);  // "boolean" (unwrapped!)
  console.log(typeof values.count); // "number" (unwrapped!)

  return values.flag ? values.count * 2 : 0;  // works without .get()
});
```

### TypeScript types (says Cell)

```tsx
const result = derive({ flag, count }, (values) => {
  // TypeScript thinks:
  // values.flag: Cell<boolean>
  // values.count: Cell<number>

  // This causes TS error: "Operator '*' cannot be applied to Cell<number>"
  return values.flag ? values.count * 2 : 0;

  // Must do this to satisfy TypeScript:
  return values.flag.get() ? values.count.get() * 2 : 0;
});
```

### Verification repro output

```
Single Cell: type=boolean, hasGet=false  // auto-unwrapped ✓
Object param: flag.hasGet=false, count.hasGet=false  // also auto-unwrapped!
```

**Question:** Types bug? Should `derive({ a, b }, (values) => ...)` have `values.a` typed as unwrapped?

---

## 3. Two-way binding fails inside ifElse branches

### The pattern that fails

```tsx
const showInput = cell<boolean>(true);
const inputValue = cell<string>("");

const handleSubmit = handler<unknown, { value: Cell<string> }>(
  (_, { value }) => {
    console.log(value.get());  // Always returns "" (default), not user input!
  }
);

return {
  [UI]: (
    <div>
      {ifElse(
        showInput,
        // TRUE BRANCH - input binding doesn't propagate
        <div>
          <ct-input $value={inputValue} />
          <button onClick={handleSubmit({ value: inputValue })}>
            Submit
          </button>
        </div>,
        // FALSE BRANCH
        <div>Hidden</div>
      )}
    </div>
  ),
};
```

### User experience

1. Input renders, user types "hello"
2. Input visually shows "hello"
3. Click submit
4. `value.get()` returns `""` (the default)

### Workaround (CSS instead of ifElse)

```tsx
// This works - binding propagates
<div style={{ display: showInput ? "block" : "none" }}>
  <ct-input $value={inputValue} />
</div>
```

**Question:** Intentional limitation or bug?

---

## 4. Array items undefined during hydration

### The crash pattern

```tsx
interface Item { id: number; name: string; }

const items: Cell<Item[]> = cell([
  { id: 1, name: "First" },
  { id: 2, name: "Second" },
]);

// This derive crashes on page refresh
const names = derive(items, (arr) => {
  return arr.map(item => item.name);  // TypeError: Cannot read 'name' of undefined
});
```

### What happens on page refresh

```
Pass 1: items.get() = [undefined, undefined]  // hydration in progress
Pass 2: items.get() = [{ id: 1, ... }, { id: 2, ... }]  // hydrated
```

### Can trigger reactivity loops

```
Error: Too many iterations: 101 action
```

### Workaround (null checks everywhere)

```tsx
const names = derive(items, (arr) => {
  return arr.filter(item => item != null).map(item => item.name);
});
```

**Question:** Expected hydration behavior? Should patterns always null-check array items?

---

## 5. Handler return values ignored as generateObject tools

### What doesn't work

```tsx
interface SearchResult { summary: string; }

const searchTool = handler<
  { query: string },
  { database: Cell<Item[]> }
>(
  (event, { database }) => {
    const results = database.get().filter(item =>
      item.name.includes(event.query)
    );
    return results;  // <-- LLM receives null!
  }
);

const result = generateObject({
  prompt: "Search for items about cats",
  schema: toSchema<SearchResult>(),
  tools: { search: searchTool({ database: items }) },
});
```

### What works (result.set())

```tsx
const searchTool = handler<
  { query: string; result: Cell<Item[]> },  // add result to schema
  { database: Cell<Item[]> }
>(
  (event, { database }) => {
    const results = database.get().filter(item =>
      item.name.includes(event.query)
    );
    event.result.set(results);  // <-- LLM receives this!
  }
);
```

**Question:** Intentional API design or should return values work?

---

## 6. Pre-populated defaults fail with generateObject in map

### What doesn't work

```tsx
interface Item { name: string; }
interface Category { category: string; }
interface Input {
  // Pre-populated array
  items: Default<Item[], [{ name: "Apple" }, { name: "Banana" }]>;
}

export default pattern<Input, Output>(({ items }) => {
  return {
    results: items.map((item) => {
      const result = generateObject({
        prompt: derive(item, (i) => `Categorize: ${i.name}`),
        schema: toSchema<Category>(),
      });
      return result;  // <-- undefined for ALL items
    }),
  };
});
```

### What works (empty default + handler push)

```tsx
interface Item { name: string; }
interface Category { category: string; }
interface Input {
  items: Default<Item[], []>;  // Empty array
}

export default pattern<Input, Output>(({ items }) => {
  // Load via handler instead of pre-populated default
  const loadItems = handler<unknown, { items: Cell<Item[]> }>(
    (_, { items }) => {
      items.push({ name: "Apple" });
      items.push({ name: "Banana" });
    }
  );

  return {
    results: items.map((item) => {
      const result = generateObject({
        prompt: derive(item, (i) => `Categorize: ${i.name}`),
        schema: toSchema<Category>(),
      });
      return result;  // <-- works! Returns { category: "..." }
    }),
  };
});
```

### A/B test results

| Approach | Items | Results extracted |
|----------|-------|-------------------|
| Pre-populated `Default<Item[], [...]>` | 12 | 0 |
| Empty + handler `Default<Item[], []>` | 12 | 12 |

**Question:** Why does pre-populated fail? Bug or expected?

---

## Summary

| # | Issue | Impact |
|---|-------|--------|
| 1 | derive vs direct Cell conflict | High - conflicting guidance |
| 2 | derive types vs runtime | Medium - requires workaround |
| 3 | ifElse binding broken | Medium - surprising behavior |
| 4 | Hydration undefined | Medium - causes crashes |
| 5 | Handler return ignored | Low - workaround clear |
| 6 | Pre-populated defaults fail | Medium - mysterious |

**Response options:**
- **Intentional** - Expected, will document
- **Bug** - Will fix
- **Won't fix** - Known limitation
- **Needs investigation**
