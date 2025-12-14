# computed() Must Be Defined at Statement Level, Not Inline

**Status:** Folk Wisdom (verified through code analysis)

## Summary

`computed()` must be defined at the **statement level** (as a variable declaration), not inline inside function calls like `ifElse()`, `.map()`, or other JSX expressions. Inline `computed()` creates a new reactive node on every render, breaking the reactive dependency chain.

## The Problem

```typescript
// BAD - computed() created inline inside ifElse()
{ifElse(
  computed(() => someResult.pending === true),  // New node every render!
  <div>Loading...</div>,
  <div>Done</div>
)}
```

This silently fails to react to changes. No error is thrown, but updates to `someResult.pending` don't trigger UI updates.

## The Solution

```typescript
// GOOD - computed() defined at statement level
const isPending = computed(() => someResult.pending === true);

// Then use the stable reference in JSX
{ifElse(
  isPending,  // Same node every render - reactive!
  <div>Loading...</div>,
  <div>Done</div>
)}
```

## Why This Happens: Node Identity

The framework uses a **node-based reactive system**:
- Each `computed()` call creates a distinct reactive **node**
- Nodes track their dependencies and propagate changes through edges
- A node only triggers updates when its **upstream dependencies** change

### The Inline Problem

When `computed()` is created inline (inside a function argument):

1. **First render**: A new computed node is created, captures dependencies
2. `ifElse` evaluates this node's current value
3. `someResult.pending` changes...
4. The **old** node (from step 1) detects the change
5. But nothing is listening to the old node anymore!
6. **Next render**: A **brand new** node is created
7. `ifElse` sees the new node, which happens to have the updated value
8. But this new node wasn't subscribed when the change happened

The dependency chain is broken because the node identity isn't stable.

### The Statement-Level Solution

When `computed()` is defined at statement level:

1. The node is created **once** and stored in a variable
2. The same node persists across renders
3. When dependencies change, this **same node** updates
4. `ifElse` always references the same node, so it sees updates

## Technical Details: CTS Transformation

The CTS (Closure Transformation System) transforms `computed()` calls:

```typescript
// What you write
const isPending = computed(() => someResult.pending);

// What CTS transforms it to (simplified)
const isPending = derive(
  { someResult },                              // Extracted captures
  ({ someResult }) => someResult.pending       // Callback with explicit params
);
```

This transformation:
1. Extracts captured variables (`someResult`) into explicit inputs
2. Establishes reactive dependencies at the node level
3. Works correctly because the node has stable identity

When `computed()` is inline, the transformation still happens, but the **node is recreated on every render**, losing the stable identity needed for reactivity.

## This Applies To All Inline Contexts

Not just `ifElse()` - any inline usage has this problem:

```typescript
// BAD - all of these create unstable nodes
{ifElse(computed(() => x.pending), a, b)}
{when(computed(() => x.error), <Error />)}
{items.map(item => computed(() => item.selected))}
{myFunc(computed(() => someValue))}

// GOOD - define at statement level first
const isPending = computed(() => x.pending);
const hasError = computed(() => x.error);
const selectedItems = computed(() => items.filter(i => i.selected));
const derivedValue = computed(() => someValue);

// Then use the stable references
{ifElse(isPending, a, b)}
{when(hasError, <Error />)}
{selectedItems.map(item => <div>{item.name}</div>)}
{myFunc(derivedValue)}
```

## Official Documentation Support

From `/Users/alex/Code/labs/docs/common/CELLS_AND_REACTIVITY.md`:

> ### When to Use computed()
>
> Use `computed()` **outside of JSX** for reactive transformations

And from `DEBUGGING.md`:

> **Mistake 2:** Creating computed() inside JSX
> ```typescript
> // DON'T create computed() in JSX
> {computed(() => items.filter(...)).map(...)}
>
> // DO create outside, use inside
> const filtered = computed(() => items.filter(...));
> {filtered.map(...)}
> ```

## Symptoms

When you have inline `computed()`:
- **Silent failure** - no errors, just doesn't update
- UI shows stale data after changes
- Refreshing the page shows correct data (because a new render creates new nodes)
- Debug logging inside the `computed()` callback doesn't fire on changes

## Related Issues

- **Performance**: Creating `computed()` inside `.map()` can cause infinite loops and CPU spin (see `2025-11-29-no-computed-inside-map.md`)
- **generateObject results**: Often need `computed()` to check `.pending`, `.result`, `.error` - always define these at statement level

## Metadata

```yaml
topic: computed, reactivity, ifElse, inline, node-identity, CTS
discovered: 2025-12-14
verified_by: code-analysis of labs/packages/runner/src/builder/
status: folk_wisdom
pattern: extracurricular-selector
```

## Guestbook

- 2025-12-14 - Discovered when `computed(() => imageOcrResult.pending)` inside `ifElse()` didn't react to OCR completion. Fixed by defining `const isImageOcrPending = computed(...)` at statement level. Verified through deep analysis of CTS transformer and ifElse implementation. (extracurricular-selector / jkomoros)
