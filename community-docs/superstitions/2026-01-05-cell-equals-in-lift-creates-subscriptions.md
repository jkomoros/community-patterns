# Cell.equals() Inside lift() Creates Undeclared Reactive Subscriptions

**Date:** 2026-01-05
**Status:** Folk Wisdom (confirmed via code analysis and incident reproduction)

## Symptom

- Infinite loop during reactive evaluation
- 100% CPU usage in runtime
- Stack overflow or "too many iterations" errors
- Pattern hangs on initialization or update
- The loop is triggered by changes to cells that aren't listed in lift() inputs

## The Real Issue: Hidden Reactive Dependencies

Using `Cell.equals()` inside a `lift()` computation creates **undeclared reactive subscriptions** that aren't part of the lift's declared input dependencies. If these subscriptions form a cycle back to the lift's output, an infinite loop occurs.

## Why This Happens

`Cell.equals()` internally:
1. Calls `areLinksSame()` with `resolveBeforeComparing=true`
2. Calls `resolveLink()` to normalize the cell references
3. Calls `tx.readValueOrThrow()` to read cell values
4. **These reads create reactive subscriptions** that trigger the lift to re-run

But these subscriptions are **not declared in the lift inputs**, so the framework can't detect circular dependencies.

### Source Code Evidence

From `/Users/alex/Code/labs-3/packages/runner/src/cell.ts:1785-1795`:
```typescript
equals(a: AnyCell<any> | object, b: AnyCell<any> | object): boolean {
  const frame = getTopFrame();
  return areLinksSame(
    a,
    b,
    undefined,
    !!frame?.tx,     // resolveBeforeComparing=true when in transaction
    frame?.tx,       // Pass transaction for reading
    frame?.runtime,
  );
}
```

From `/Users/alex/Code/labs-3/packages/runner/src/link-utils.ts:159-171`:
```typescript
if (resolveBeforeComparing) {
  const tx = txForResolving;
  if (!tx) throw new Error("Provide tx to resolve before comparing");
  if (!runtime) {
    throw new Error("Provide runtime to resolve before comparing");
  }
  link1 = isNormalizedFullLink(link1)
    ? resolveLink(runtime, tx, link1)  // Reads from transaction
    : link1;
  link2 = isNormalizedFullLink(link2)
    ? resolveLink(runtime, tx, link2)  // Reads from transaction
    : link2;
}
```

From `/Users/alex/Code/labs-3/packages/runner/src/link-resolution.ts:110,143`:
```typescript
const whole = tx.readValueOrThrow({ ...link, path: link.path });
// readValueOrThrow creates a reactive subscription!
```

## Anti-Pattern: Cell.equals() Inside lift()

```typescript
// BROKEN - Creates undeclared subscriptions
const parentRecord = lift(({ mentionable, parentSC }) => {
  const membersEntry = mentionable?.get("members");
  const psc = parentSC?.get();
  const ourMembersEntry = psc?.get("members");

  // DANGER! This creates reactive subscriptions to:
  // - membersEntry.charm (reads its value)
  // - ourMembersEntry.charm (reads its value)
  // These subscriptions are NOT in the lift inputs!
  if (Cell.equals(membersEntry.charm, ourMembersEntry.charm)) {
    return item;
  }

  // If membersEntry.charm or ourMembersEntry.charm changes,
  // this lift re-runs, even though they're not in the inputs.
  // If those cells are affected by this lift's output, infinite loop!
})({ mentionable, parentSC });
```

**Why it loops:**
1. lift() runs, subscribes to `membersEntry.charm` via `Cell.equals()`
2. lift() updates some state that affects `membersEntry.charm`
3. Subscription triggers lift() to re-run
4. Goto step 1 → infinite loop

## Correct Pattern: Use Reference Equality (===)

```typescript
// WORKING - No hidden subscriptions
const parentRecord = lift(({ mentionable, parentSC }) => {
  const membersEntry = mentionable?.get("members");
  const psc = parentSC?.get();
  const ourMembersEntry = psc?.get("members");

  // Safe - compares object references without reading cell values
  if (psc?.charm === membersEntry?.charm) {
    return item;
  }

  // Only the declared inputs (mentionable, parentSC) create subscriptions
})({ mentionable, parentSC });
```

**Why this works:**
- `===` compares object identity without reading cell values
- No hidden reactive subscriptions are created
- Only the declared lift inputs create subscriptions
- Framework can properly track dependencies and detect cycles

## When to Use Each Comparison

| Context | Use | Why |
|---------|-----|-----|
| Inside `lift()`, `derive()`, `computed()` | `===` | Avoid undeclared subscriptions |
| Inside event handlers | `Cell.equals()` | No reactive context, safe to read |
| Outside reactive computations | `Cell.equals()` | No reactive context, safe to read |
| Comparing primitive values | `===` or `Cell.equals()` | Either works, `===` is simpler |
| Comparing Cell references (need semantic equality) | Outside reactive: `Cell.equals()` | Handles aliases/redirects |
| Comparing Cell references (identity is enough) | `===` | Faster, no subscriptions |

## Real Example (Members Module)

### Before (Infinite Loop)

From members module development session (2026-01-05):
```typescript
const parentRecord = lift(({ mentionable, parentSC }) => {
  if (!mentionable) return null;

  const membersEntry = mentionable.get("members");
  if (!membersEntry) return null;

  const psc = parentSC?.get();
  const ourMembersEntry = psc?.get("members");
  if (!ourMembersEntry) return null;

  const items = ourMembersEntry.items?.get();
  if (!items) return null;

  for (const item of items) {
    // INFINITE LOOP HERE - Cell.equals creates subscription
    if (Cell.equals(membersEntry.charm, ourMembersEntry.charm)) {
      return item;
    }
  }

  return null;
})({ mentionable, parentSC });
```

**Result:** Infinite reactive loop, 100% CPU, pattern hung.

### After (Fixed)

```typescript
const parentRecord = lift(({ mentionable, parentSC }) => {
  if (!mentionable) return null;

  const membersEntry = mentionable.get("members");
  if (!membersEntry) return null;

  const psc = parentSC?.get();
  const ourMembersEntry = psc?.get("members");
  if (!ourMembersEntry) return null;

  const items = ourMembersEntry.items?.get();
  if (!items) return null;

  for (const item of items) {
    // FIXED - Reference equality, no subscriptions
    if (psc?.charm === membersEntry?.charm) {
      return item;
    }
  }

  return null;
})({ mentionable, parentSC });
```

**Result:** Pattern worked correctly, no infinite loop.

## Detection

If you encounter:
- Infinite loops in lift/derive/computed
- CPU spikes during reactive evaluation
- Loops triggered by cells not in the declared inputs

Search your code for:
```bash
grep -n "Cell.equals.*lift\|lift.*Cell.equals" your-pattern.tsx
```

Look for:
- `Cell.equals()` inside `lift(() => { ... })` callbacks
- `Cell.equals()` inside `derive(() => { ... })` callbacks
- `Cell.equals()` inside `computed(() => { ... })` callbacks

## Key Rule

**Use `===` for reference comparisons inside reactive computations (`lift`, `derive`, `computed`).**

**Use `Cell.equals()` only in event handlers or outside reactive contexts.**

This ensures all reactive dependencies are explicit and prevents hidden subscription cycles.

## Related

- **Superstition: 2025-12-14-computed-read-write-infinite-loop.md** - General infinite loop in computed
- **Superstition: 2025-12-20-reactivity-cell-equals-for-charm-comparison.md** - When to use Cell.equals (handlers, not computeds)
- **Official docs:** `~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md` - Cell.equals documentation
- **Source code:** `packages/runner/src/cell.ts:1785-1795` - Cell.equals implementation
- **Source code:** `packages/runner/src/link-utils.ts:138-175` - areLinksSame implementation

## Context

- **Session:** Members module development (2026-01-05)
- **Pattern:** Record pattern with bidirectional Members module
- **Use case:** Finding parent record by comparing charm references in members list
- **Symptom:** Infinite reactive loop, 100% CPU
- **Fix:** Changed from `Cell.equals()` to `===` for reference comparison inside lift()

## Metadata

```yaml
topic: reactivity, Cell.equals, lift, infinite-loop, subscriptions
discovered: 2026-01-05
confirmed_count: 1
last_confirmed: 2026-01-05
sessions: [members-module-development]
related_functions: Cell.equals, lift, areLinksSame, resolveLink
status: folk-wisdom
stars: ⭐⭐⭐⭐
```

## Guestbook

- 2026-01-05 - Members module. Used `Cell.equals(membersEntry.charm, ourMembersEntry.charm)` inside a lift() to check if charm references matched. This created undeclared reactive subscriptions via tx.readValueOrThrow() inside resolveLink(). When the subscribed cells formed a cycle back to the lift's output, got infinite reactive loop with 100% CPU. Fix: changed to reference equality `psc?.charm === membersEntry?.charm` which doesn't create subscriptions. Pattern worked immediately. (members-module-development)

---

**Status: Folk Wisdom** - Confirmed via code analysis and incident reproduction. The reactive subscription mechanism is well-documented in the codebase, and the infinite loop behavior has been observed and resolved.
