# Reactivity - Blessed ✓

Framework author approved community knowledge about reactivity in CommonTools.

**Official docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`

---

## Idempotent Side Effects in computed/lift/derive

**Blessed by:** Framework author (verbal guidance)
**Date:** 2024-12-08
**Framework version:** Current

---

### What Is Idempotency?

**Idempotency** means: **running an operation multiple times produces the same result as running it once.**

```
f(x) = f(f(x)) = f(f(f(x))) = ...
```

**Examples from everyday computing:**

| Operation | Idempotent? | Why |
|-----------|-------------|-----|
| `x = 5` | ✅ Yes | Running it 10 times still leaves x as 5 |
| `x = x + 1` | ❌ No | Running it 10 times gives different result than once |
| `SET key=value` | ✅ Yes | Same key-value pair regardless of repetition |
| `APPEND value` | ❌ No | Each run adds another copy |
| HTTP GET | ✅ Yes | Reading doesn't change state |
| HTTP POST | ❌ Usually no | Each request might create a new resource |
| HTTP PUT | ✅ Yes | Replaces resource with same data |

**The key test:** If your code runs 1 time vs 100 times, is the end state identical? If yes, it's idempotent.

---

### Why Reactive Systems Require Idempotency

In a reactive system like CommonTools, **computations may run unpredictably many times**:

1. **Dependency changes** - Any upstream cell change triggers re-computation
2. **Framework scheduling** - The framework may re-run computations for internal reasons
3. **Batching/debouncing** - Multiple changes might cause multiple runs
4. **No guaranteed execution count** - You cannot rely on "this runs exactly once"

**If your side effect isn't idempotent:**

```typescript
// ❌ NON-IDEMPOTENT - Appends on every run
computed(() => {
  const items = fetchedItems.get();
  history.set([...history.get(), ...items]);  // Keeps growing!
});
```

What happens:
- Run 1: history = [item1, item2]
- Run 2: history = [item1, item2, item1, item2]
- Run 3: history = [item1, item2, item1, item2, item1, item2]
- ... **"wild thrashing" - never settles!**

**If your side effect IS idempotent:**

```typescript
// ✅ IDEMPOTENT - Check-before-write
computed(() => {
  const items = fetchedItems.get();
  for (const item of items) {
    if (history.key(item.id).get()) continue;  // Already exists? Skip.
    history.key(item.id).set(item);
  }
});
```

What happens:
- Run 1: history = {id1: item1, id2: item2} (writes happen)
- Run 2: history = {id1: item1, id2: item2} (all keys exist, all skipped)
- Run 3: history = {id1: item1, id2: item2} (all keys exist, all skipped)
- ... **system settles - same state after N runs**

---

### The Key Insight

**`computed`, `lift`, and `derive` CAN have side effects - but they MUST be idempotent.**

This means: running the computation N times must produce the same end state as running it once. If side effects aren't idempotent, you get "wild thrashing" where the reactive system never settles.

### Why Idempotency Matters (Beyond Performance)

In React, `useMemo` optimizations are primarily about **performance** - avoiding unnecessary re-renders. In CommonTools, idempotency is critical for additional reasons:

1. **Security Model:** Key tracking is load-bearing for the security model. When you write to `cell.key(k).set(v)`, the system tracks which keys have been written. Non-idempotent writes can corrupt this tracking.

2. **CFC Policy Tracking:** The framework uses key tracking to enforce policies (like which charms can write which data). Thrashing writes undermines these guarantees.

3. **Cache Coherence:** Every write invalidates downstream caches. Non-idempotent writes cause cascading invalidations that never settle.

**Mental model:** Unlike React where `useMemo` violations cause slowness, CommonTools violations can cause **correctness** problems. Treat idempotency as a hard requirement, not an optimization.

### The Pattern: Accumulating Data with Idempotent Side Effects

**Use Case:** You want to automatically accumulate data from a `fetchData` result into a persistent cell (e.g., building up a history of all items ever fetched).

**Solution:** Use an object with deterministic keys, and check-before-write.

```typescript
// ✅ CORRECT: Object with deterministic keys
const history = cell<Record<string, HistoricalItem>>({});

// Inside pattern body - idempotent auto-sync
computed(() => {
  const fetched = fetchedItems.get();
  if (!fetched || fetched.length === 0) return;

  for (const item of fetched) {
    const key = item.id; // deterministic key

    // CRITICAL: Check if already exists - skip to maintain idempotency
    if (history.key(key).get()) continue;

    // Only set on first encounter
    history.key(key).set({
      ...item,
      addedAt: new Date().toISOString(), // OK because only runs once
    });
  }
});
```

### Why This Is Idempotent

1. **First run:** Key doesn't exist → write value
2. **Second+ runs:** Key exists → skip (no-op)
3. **System settles** because state stops changing after first run

The timestamp (`new Date()`) would seem non-deterministic, but it's safe because the check-before-write ensures it only executes once per key.

### Critical: How to Write Values

**❌ WRONG - Thrashy, loses tracking:**
```typescript
// DON'T do this - causes thrashing and loses key tracking
for (const item of items) {
  const current = history.get();
  history.set({ ...current, [item.id]: item }); // BAD!
}
```

This is wrong because:
- Each `.set()` replaces the entire object, losing tracking metadata
- Framework can't efficiently track which keys changed
- Causes cascading cache invalidations

**✅ CORRECT - Individual key writes:**
```typescript
// Use .key(k).set(v) for individual keys
history.key(item.id).set(item);
```

**✅ CORRECT - Batch update:**
```typescript
// Use .update() for multiple new keys
const newItems = { key1: value1, key2: value2 };
history.update(newItems);
```

Both methods preserve key tracking and are equivalent performance inside a transaction.

### Object vs Array

**Use objects with deterministic keys** for accumulation patterns:

```typescript
// ✅ Object with keys - easy idempotent check
const history = cell<Record<string, Item>>({});
if (history.key(id).get()) continue; // O(1) check

// ❌ Array - harder to check, no key tracking
const history = cell<Item[]>([]);
if (history.get().some(x => x.id === id)) continue; // O(n) check
```

Objects also enable efficient partial updates via `.key()`.

### When to Use This Pattern

**Good use cases:**
- Accumulating fetched data into history
- Building up a cache from multiple sources
- Deduplicating items by ID
- Any "collect all seen items" pattern

**Not needed for:**
- Simple derived values (use pure computed)
- Values that should reset on each render
- State that handlers manage

### Example: Pizza History Accumulation

```typescript
// Type: object with date keys for idempotent updates
type PizzaHistory = Record<string, HistoricalPizza>;

const pattern = ({ history }) => {
  const { result } = fetchData({ url: pizzaScheduleUrl });
  const pizzaList = createPizzaList({ result });

  // Auto-sync fetched pizzas to history (idempotent side effect)
  computed(() => {
    const fetched = pizzaList.get();
    if (!fetched || fetched.length === 0) return;

    for (const pizza of fetched) {
      const key = pizza.date; // deterministic key

      // CRITICAL: Check if already exists
      if (history.key(key).get()) continue;

      // Only set on first encounter
      history.key(key).set({
        ...pizza,
        ate: "unknown",
        addedAt: new Date().toISOString(),
      });
    }
  });

  // ... rest of pattern
};
```

### Summary

| Aspect | Requirement |
|--------|-------------|
| Side effects in computed | Allowed if idempotent |
| Key structure | Use object with deterministic keys |
| Check before write | Always check if key exists first |
| Write method | Use `.key(k).set(v)` or `.update({...})` |
| Never do | `.set({...spread, newKey})` in a loop |
| Why it matters | Security model + policy tracking, not just performance |

---

## ifElse Executes BOTH Branches

**Blessed by:** Berni (verbal guidance)
**Date:** 2024-12-09
**Framework version:** Current

---

### The Rule

**`ifElse` evaluates BOTH branches, not just the "true" one.**

This is counter-intuitive if you're used to JavaScript's `if/else` or ternary operators.

```typescript
// ❌ WRONG ASSUMPTION: "This will only call generateObject when condition is true"
const result = ifElse(
  condition,
  () => generateObject({ prompt: expensivePrompt }),  // RUNS ANYWAY!
  () => null
);
```

Both branches execute regardless of the condition value.

### Why This Happens

The CommonTools scheduler is currently **push-based (eager)**:
- It schedules everything that *could* be needed
- It doesn't know that the output of branch B goes nowhere if condition is false
- A future "pull-based" scheduler would only run what's actually needed

### The Workaround

To prevent `generateObject` (or other expensive operations) from actually running, **pass an empty prompt**:

```typescript
// ✅ CORRECT: Empty prompt prevents actual LLM call
const result = generateObject({
  prompt: condition.get() ? expensivePrompt : "",  // Empty string = no LLM call
  // ... other options
});
```

When the prompt is empty, `generateObject` doesn't make an LLM call.

### Example: Conditional Generation

```typescript
// ❌ WRONG: Both branches execute
const summary = ifElse(
  hasContent,
  () => generateObject({
    prompt: `Summarize: ${content.get()}`,
    schema: z.object({ summary: z.string() }),
  }),
  () => ({ summary: "" })
);

// ✅ CORRECT: Use conditional prompt
const summary = generateObject({
  prompt: hasContent.get() ? `Summarize: ${content.get()}` : "",
  schema: z.object({ summary: z.string() }),
});
```

### Future Improvement

Robin has a change coming that will make this better:
- If your data doesn't match the schema, the function won't be called
- This will catch many cases where you're trying to guard with `ifElse`

Until then, use the empty prompt workaround.

### Summary

| Approach | Works? | Why |
|----------|--------|-----|
| `ifElse` to skip work | ❌ No | Both branches execute |
| Conditional in prompt | ✅ Yes | Empty prompt = no LLM call |
| Guard with undefined check | ❌ No | Function still called |

**Rule of thumb:** Don't use `ifElse` to prevent expensive operations. Use empty/undefined inputs instead.

---

## Don't Use IDs - Use Cell References and cell.equals()

**Blessed by:** Berni (verbal guidance)
**Date:** 2024-12-09
**Framework version:** Current

---

### The Rule

**Don't generate your own IDs to track items. Use object references and `cell.equals()` instead.**

```typescript
// ❌ WRONG: Generating IDs manually
type Item = {
  id: string;  // Don't do this
  name: string;
};

const items = cell<Item[]>([]);

const findItem = (id: string) => {
  return items.get().find(item => item.id === id);
};
```

```typescript
// ✅ CORRECT: Use cell references
const items = cell<Item[]>([]);

// Get a cell reference to a specific item
const itemCell = items.key(index);

// Compare cells using .equals()
if (cellA.equals(cellB)) {
  // Same item
}
```

### Why IDs Are Problematic

The framework already tracks object identity under the covers:
- It knows when objects are the same or different
- It has its own internal tracking for reactivity
- Your manual IDs may conflict with or duplicate this tracking
- Can cause subtle reactivity issues and performance problems

### The Better Approach

Use the framework's built-in mechanisms:

```typescript
// Get a reference to an item in a collection
const itemRef = collection.key(itemKey);

// Pass the cell reference around instead of an ID
<ItemEditor item={itemRef} />

// Compare using .equals()
const isSameItem = item1.equals(item2);
```

### When Finding Items in Lists

Instead of:
```typescript
// ❌ Finding by ID
const item = items.get().find(x => x.id === targetId);
```

Use:
```typescript
// ✅ Pass cell references directly
// The component already has the cell reference it needs
```

### Summary

| Approach | Recommended? | Why |
|----------|--------------|-----|
| Manual ID generation | ❌ No | Duplicates framework tracking |
| String ID lookups | ❌ No | Loses reactivity benefits |
| Cell references | ✅ Yes | Works with framework's tracking |
| `cell.equals()` | ✅ Yes | Proper object identity comparison |

**Rule of thumb:** If you're generating IDs, you're probably doing it wrong. Pass cell references instead.
