# Superstition: computed() Infinite Loop When Not Idempotent

**Date:** 2025-12-14
**Status:** Folk Wisdom (confirmed via blessed/reactivity.md)

## Symptom

- 100% CPU usage on Chrome tab
- UI becomes unresponsive
- Errors cascade as state becomes inconsistent
- "Wild thrashing" - state keeps changing, never settles

## The Real Issue: Non-Idempotent Side Effects

**Writing in computed() IS allowed** - but it **MUST be idempotent** (running N times produces the same end state as running once).

Per `blessed/reactivity.md`:
> `computed`, `lift`, and `derive` CAN have side effects - but they MUST be idempotent.

## Anti-Pattern: Read Whole Cell, Write Whole Cell

```typescript
// WRONG - NOT IDEMPOTENT
computed(() => {
  const current = myCell.get();  // READ entire cell - creates dependency
  const updated = { ...current };
  // ... modify updated ...
  myCell.set(updated);  // WRITE entire cell - triggers re-run!
});
```

**Why it loops:** Even if the content is "the same", `.set()` replaces the whole object, triggering the dependency from `.get()`. The pattern creates a read→write→read cycle that never settles.

## Real Example (extracurricular-selector.tsx)

```typescript
// BROKEN - lines 1418-1435 (original)
computed(() => {
  const staged = processedStagedClasses;
  const currentSelections = stagedClassSelections.get();  // READ

  const newSelections: Record<string, boolean> = {};
  staged.forEach((cls) => {
    if (currentSelections[cls.id] !== undefined) {
      newSelections[cls.id] = currentSelections[cls.id];
    } else {
      newSelections[cls.id] = cls.triageStatus === "auto_kept";
    }
  });

  stagedClassSelections.set(newSelections);  // WRITE - INFINITE LOOP!
});
```

## Correct Pattern: Check-Before-Write with `.key()`

```typescript
// CORRECT - IDEMPOTENT (per blessed/reactivity.md)
computed(() => {
  for (const cls of processedStagedClasses) {
    // Check if already set - skip to maintain idempotency
    if (stagedClassSelections.key(cls.id).get() !== undefined) continue;

    // Only set on first encounter
    stagedClassSelections.key(cls.id).set(cls.triageStatus === "auto_kept");
  }
});
```

**Why this is idempotent:**
- Run 1: Keys don't exist → write defaults
- Run 2+: All keys exist → all skipped, no writes
- System settles because state stops changing after first run

## Why `.key(k).set()` Instead of `.set({...})`

Per `blessed/reactivity.md`:
> DON'T use `.set({...spread, newKey})` in a loop

`.key(k).set(v)`:
- Preserves key tracking metadata
- Framework can efficiently track which keys changed
- Avoids cascading cache invalidations

`.set({...})`:
- Replaces entire object, losing tracking metadata
- Causes cascading cache invalidations
- Framework can't efficiently track what changed

## Quick Reference

| Pattern | Idempotent? | Why |
|---------|-------------|-----|
| `cell.set({ ...cell.get(), key: val })` | NO | Replaces whole object every run |
| `cell.key(k).set(v)` without check | NO | Sets every run |
| `if (!cell.key(k).get()) cell.key(k).set(v)` | YES | Only sets once per key |
| `if (cell.key(k).get()) return; cell.key(k).set(v)` | YES | Only sets once per key |

## Related

- `blessed/reactivity.md` - Authoritative docs on idempotent side effects
- `folk_wisdom/reactivity.md` - "Side Effects in computed/derive - MUST Be Idempotent"
- `ISSUE-checked-binding-computed-arrays.md` - Why $checked doesn't work on computed arrays
