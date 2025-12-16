---
topic: reactivity
discovered: 2025-12-15
confirmed_count: 1
last_confirmed: 2025-12-15
sessions: [api-migration-2025-12]
related_labs_docs: ~/Code/labs/docs/common/CELLS_AND_REACTIVITY.md
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

# `derive()` and `cell()` Are Deprecated - Use `computed()` and `Cell.of()`

## Summary

As of December 2025, the framework has deprecated:
- `derive()` → use `computed()` instead
- `cell()` → use `Cell.of()` instead

These changes were made in labs commits:
- `f49841c01` - deprecate derive in favor of computed
- `58f86a63a` - deprecate cell in favor of Cell.of

## Migration

### derive() → computed()

```typescript
// Before (deprecated)
import { derive } from "commontools";
const doubled = derive(value, (v) => v * 2);

// After (current)
import { computed } from "commontools";
const doubled = computed(() => value * 2);
```

Key differences:
- `computed()` takes no explicit dependencies - they're tracked automatically
- Pattern inputs and computed values are auto-unwrapped inside `computed()`
- Local `Cell.of()` values need `.get()` to read the typed value

### cell() → Cell.of()

```typescript
// Before (deprecated)
import { cell } from "commontools";
const items = cell<string[]>([]);

// After (current)
import { Cell } from "commontools";
const items = Cell.of<string[]>([]);
```

## Auto-Unwrapping Behavior

Inside `computed()`, these are auto-unwrapped (access directly):
- Pattern inputs (e.g., `token`, `displayName`)
- Other computed values

These need `.get()`:
- Local `Cell.of()` values

```typescript
const selected = Cell.of<string[]>([]);
const displayName = computed(() => {
  // selected needs .get() because it's a local Cell.of()
  const sel = selected.get();
  // patternInput is auto-unwrapped (pattern input)
  return sel.length > 0 ? sel.join(", ") : patternInput;
});
```

## Related Superstitions

Many existing superstitions reference `derive()`. The guidance in them is still valid - just use `computed()` instead:

- `2025-11-22-llm-generateObject-reactive-map-derive.md`
- `2025-11-29-derive-inside-map-causes-thrashing.md`
- `2025-11-30-ifelse-derive-consistent-cell-count.md`
- `2025-12-03-prebind-handlers-outside-derive.md`
- `2025-12-03-derive-creates-readonly-cells-use-property-access.md`
- `2025-12-06-sort-mutates-array-spread-first-in-derive.md`
- `2025-12-08-locally-created-cells-not-unwrapped-in-derive.md`

## Context

Migrated ~30 pattern files in jkomoros/ from derive/cell to computed/Cell.of. All patterns compiled and the guidance about reactive behavior still applies - only the function names changed.

## Next Steps

- [ ] Confirm official docs reflect this change
- [ ] Update other superstitions with deprecation notes
- [ ] Monitor for any behavioral differences

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
