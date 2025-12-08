# Reactivity - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`

---

## Understanding Pattern, Computed, Derive, and Handler

⭐⭐⭐ (3 confirmations - synthesized from multiple sessions)

**The four core constructs and their read/write capabilities:**

| Construct | Purpose | Can READ? | Can WRITE? |
|-----------|---------|-----------|------------|
| **pattern** | Define the reactive graph | Yes | Yes (defines cells) |
| **computed** | Transform data reactively | Yes | Yes, if idempotent* |
| **derive** | Transform data reactively (same as computed) | Yes | Yes, if idempotent* |
| **handler** | Respond to events | Yes (.get()) | Yes (.set(), .push()) |

*See "Side Effects in computed/derive - MUST Be Idempotent" section and `blessed/reactivity.md` for details.

### Pattern - The Container

A **pattern** is the top-level factory function that creates your entire reactive system. It runs at **build time** to construct the graph structure.

```typescript
export default pattern(({ items, title }) => {
  // This runs at BUILD TIME to construct the graph
  // You define what exists, not what happens at runtime

  return { /* outputs */ };
});
```

**Mental Model:** Pattern is the architect's blueprint. It defines *what rooms exist*, not *what furniture goes in them*.

### Computed / Derive - Pure Transformations

`computed()` and `derive()` are **the same thing** (derive is the older name). They create reactive derived values that automatically update.

**Mental Model:** Think of these like React's `useMemo` - reactive computations that re-run when dependencies change.

```typescript
// React useMemo (for comparison)
const doubled = useMemo(() => count * 2, [count]);

// CommonTools computed/derive (similar concept)
const completedTasks = computed(() => items.filter(t => t.done));
const totalPrice = computed(() => items.reduce((sum, i) => sum + i.price, 0));
```

**Can Write?** YES, but only if **idempotent**. See `blessed/reactivity.md`.

**Mental Model:** `computed()` describes a **relationship**. "The total is always the sum of prices" is a fact that's always true. Side effects are allowed if they're idempotent (running N times = same result as once). Non-idempotent side effects cause thrashing and break framework guarantees.

**When to use:**
- Filtering, sorting, grouping data
- Calculations (totals, averages, counts)
- Data transformations needed multiple times
- Anything expressed as "X is always derived from Y"

### Handler - Imperative Event Response

Handlers are where you **respond to user actions** and **mutate state**.

```typescript
const addItem = handler<void, { items: Cell<Item[]>; input: Cell<string> }>(
  (_, { items, input }) => {
    items.push({ text: input.get(), done: false });
    input.set("");  // Clear the input
  }
);
```

**Can Write?** YES - this is the ONLY place you should mutate cells.

**The Cell<> type matters:** Parameters must be typed as `Cell<T>` to allow mutations.

```typescript
// Can only READ 'items'
handler<void, { items: Item[] }>((_, { items }) => {
  // items is read-only here - no .set(), .push(), .update()
});

// Can READ and WRITE 'items'
handler<void, { items: Cell<Item[]> }>((_, { items }) => {
  items.push(newItem);  // Works!
});
```

### The Conceptual Split: Declarative vs Imperative

| | Computed (Declarative) | Handler (Imperative) |
|---|---|---|
| **Describes** | "What is true" | "What to do" |
| **Example** | "Filtered list IS items where done=true" | "When user clicks, add item" |
| **Framework role** | Maintains the relationship | Runs code on events |

### Quick Decision Guide

| Scenario | Use |
|----------|-----|
| Transform data reactively | `computed()` |
| Filter/sort/group data | `computed()` |
| User clicks button, mutate state | `handler()` |
| Two-way binding (input ↔ cell) | `$` prefix (`$value={text}`) |
| Define overall structure | `pattern()` |

**Related:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`

**Guestbook:**
- ✅ 2025-11-22 - Discovered derives can't mutate in food-recipe pattern (jkomoros)
- ✅ 2025-11-25 - Confirmed handler-inside-derive readonly error in smart-rubric (jkomoros)
- ✅ 2025-11-26 - Synthesized conceptual overview from docs research (jkomoros)

---

## JSX is Automatically Reactive (No computed() Needed Inside)

⭐⭐⭐ (3 confirmations)

**JSX has automatic reactivity built-in.** When the framework parses your JSX, it sets up reactive tracking for any values you reference.

```typescript
// Unnecessary - computed() inside JSX
<div>
  {computed(() => `Hello, ${userName}`)}  // Pointless extra wrapper!
</div>

// Just reference directly - JSX is already reactive!
<div>
  Hello, {userName}
</div>
```

**Why?** JSX compilation in CommonTools creates reactive bindings automatically. When you write `{userName}`, the framework already knows to re-render when it changes.

**When you DO need computed():** Outside JSX, to create reusable reactive values:

```typescript
// Outside JSX - this makes sense
const filteredItems = computed(() => items.filter(i => !i.done));
const totalPrice = computed(() => items.reduce((sum, i) => sum + i.price, 0));

// Then use in JSX (where reactivity is automatic)
<div>Total: {totalPrice}</div>
{filteredItems.map(item => <div>{item.name}</div>)}
```

**Related:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` (lines 241-265)

**Guestbook:**
- ✅ 2025-11-22 - Confirmed in official docs research (jkomoros)
- ✅ 2025-11-24 - Verified computed/derive both return OpaqueRef via lift() (jkomoros)
- ✅ 2025-11-26 - Confirmed in conceptual overview synthesis (jkomoros)

---

## computed() and derive() Are The Same Thing

⭐⭐ (2 confirmations)

**These are functionally identical.** Code review of `packages/runner/src/builder/module.ts` shows:

```typescript
derive(input, fn) → calls lift(fn)(input) → returns OpaqueRef<T>
computed(fn)      → calls lift(fn)(undefined) → returns OpaqueRef<T>
```

**Both return `OpaqueRef<T>`** - they are fundamentally the same!

The only difference:
- `derive(deps, fn)` - explicit dependencies in first argument
- `computed(fn)` - dependencies captured from closure

**Implication:** Any claim that one works where the other doesn't is likely caused by something else (a different bug fixed during refactoring, or explicit vs implicit dependency tracking).

**Use `computed()` in new code** - it's the preferred modern name per official docs.

**Related:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` (line 197: "You may see derive() in some docs - it's the same as computed()")

**Guestbook:**
- ✅ 2025-11-25 - Code review confirmed both use lift() internally (jkomoros)
- ✅ 2025-11-26 - Verified against official docs (jkomoros)

---

## Side Effects in computed/derive - MUST Be Idempotent

⭐⭐⭐⭐ (4 confirmations - **supersedes "Derives Cannot Mutate Cells"**)

**UPDATE 2024-12-08:** Previous guidance said `.set()` in computed/derive "silently fails". This was **incorrect**.

**The truth:** `computed`, `derive`, and `lift` **CAN** have side effects including `.set()`, but they **MUST be idempotent** - running N times must produce the same end state as running once.

**See:** `blessed/reactivity.md` - "Idempotent Side Effects in computed/lift/derive" for full details.

### Quick Summary

```typescript
// ✅ CORRECT - Idempotent side effect (check-before-write)
computed(() => {
  const items = fetchedItems.get();
  for (const item of items) {
    if (history.key(item.id).get()) continue;  // Skip if exists
    history.key(item.id).set(item);  // Only set once per key
  }
});

// ❌ WRONG - Non-idempotent (always modifies)
computed(() => {
  const items = fetchedItems.get();
  history.set([...history.get(), ...items]);  // Appends every run!
});
```

### Why Idempotency Matters (Beyond Performance)

Unlike React's `useMemo`, this isn't just about performance:

1. **Security Model:** Key tracking is load-bearing for the security model
2. **CFC Policy Tracking:** Framework uses key tracking to enforce policies
3. **Cache Coherence:** Non-idempotent writes cause cascading invalidations

### When to Use Handlers vs Idempotent Computed

| Scenario | Use |
|----------|-----|
| User-triggered mutation (button click) | Handler |
| Automatic accumulation from fetch | Idempotent computed |
| One-time action | Handler |
| "Always keep X in sync with Y" | Idempotent computed |

**Related:** `blessed/reactivity.md` (authoritative), `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`

**Guestbook:**
- ✅ 2025-11-22 - Original observation (jkomoros)
- ✅ 2025-11-25 - Confirmed context issues with handlers in derive (jkomoros)
- ✅ 2025-11-26 - Verified against conceptual model (jkomoros)
- ✅ 2024-12-08 - **CORRECTED:** Framework author confirmed `.set()` works if idempotent. See blessed/reactivity.md (jkomoros)

---

## Handlers Inside derive() Cause ReadOnlyAddressError

⭐⭐⭐ (3 confirmations)

When button click handlers are placed **inside** a `derive()` block, calling `.set()` from those handlers causes `ReadOnlyAddressError`.

```typescript
// BROKEN - Button inside derive() - handler can't write to Cells
{derive({ result }, ({ result }) => {
  if (!result) return null;
  return (
    <>
      <div>Result: {result.value}</div>
      {/* This button's handler will fail! */}
      <ct-button onClick={() => promptCell.set("")}>
        Clear
      </ct-button>
    </>
  );
})}
```

**Error:** `ReadOnlyAddressError: Cannot write to read-only address`

**Why this happens:**
1. `derive()` creates a reactive computation context
2. Inside this context, Cells are wrapped as **read-only proxies**
3. Handlers called from inside derive inherit this read-only context
4. Any `.set()` call fails because the Cell reference is read-only

**The Solution:** Move buttons OUTSIDE the derive block:

```typescript
// WORKS - Buttons OUTSIDE derive()
{derive({ result }, ({ result }) => {
  if (!result) return <div>No result yet</div>;
  return <div><strong>Result:</strong> {result.value}</div>;
})}

{/* Action buttons OUTSIDE derive - handlers can write to Cells */}
<ct-button onClick={() => promptCell.set("")}>
  Clear
</ct-button>
```

**Key insight:** Separate display (inside derive) from actions (outside derive).

**Guestbook:**
- ✅ 2025-11-25 - Discovered in smart-rubric-phase-5 with generateObject results (jkomoros)
- ✅ 2025-11-25 - Confirmed pattern: display in derive, buttons outside (jkomoros)
- ✅ 2025-11-26 - Verified against readonly proxy mental model (jkomoros)

**Known Limitations:**
- If you need conditional buttons based on derive state, you may need to restructure your UI

---

## Data Flow Mental Model

⭐⭐ (2 confirmations)

Understanding data flow helps choose the right construct:

```
┌─────────────────────────────────────────────────────────┐
│                      PATTERN                            │
│   (defines the structure, runs at build time)           │
│                                                         │
│   INPUTS (reactive) ──► COMPUTED (transforms) ──► JSX   │
│                                                         │
│                         ▲                               │
│                         │                               │
│   User clicks ──► HANDLER (mutates) ──► Cells update    │
│                                                         │
│   Cells update ──► COMPUTED re-runs ──► JSX re-renders  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**The cycle:**
1. Pattern defines structure and cells
2. Computed transforms data (read-only)
3. JSX renders (automatically reactive)
4. User interactions trigger handlers
5. Handlers mutate cells
6. Computed values re-run automatically
7. UI re-renders automatically

**Guestbook:**
- ✅ 2025-11-26 - Synthesized from docs and code review (jkomoros)
- ✅ 2025-11-26 - Verified against actual pattern behavior (jkomoros)

---
