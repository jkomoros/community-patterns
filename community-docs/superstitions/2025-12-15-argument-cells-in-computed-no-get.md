# Argument Cells in computed() Don't Need .get()

**Status:** Superstition (single observation, needs verification)

## The Pattern

Inside a `computed()`, you can access pattern argument cells directly without calling `.get()`. The framework auto-proxies them:

```typescript
// In pattern Input type
interface MyInput {
  selections: Default<Record<string, boolean>, {}>;
}

// In pattern function
pattern<MyInput, MyOutput>(({ selections }) => {
  // Inside computed() - access directly!
  const count = computed(() => {
    // ✅ Works - selections is auto-proxied
    const sel = selections || {};
    return Object.keys(sel).filter(k => sel[k]).length;
  });

  // But in plain functions, use .get()/.set()
  const toggle = (id: string) => {
    const current = selections.get() || {};  // ✅ .get() works here
    selections.set({ ...current, [id]: !current[id] });
  };
});
```

## Evidence

Looking at other patterns like `store-mapper.tsx`:

```typescript
// Line 687 - direct access in computed without .get()
const entranceCount = computed(() => entrances.length);

// But .set() and .push() also work
aisles.set(newAisles);  // Line 119
aisles.push({ name, description });  // Line 92
```

The framework uses proxies that support BOTH:
- Direct property access (`selections.someKey`, `array.length`, `array.filter()`)
- Cell methods (`.get()`, `.set()`, `.push()`)

## When Each Pattern Works

| Context | Direct Access | .get()/.set() |
|---------|---------------|---------------|
| Inside computed() | ✅ Works | ⚠️ May fail |
| Inside derive() | ✅ Works | ⚠️ Read-only |
| Plain function at pattern level | ✅ Works | ✅ Works |
| Module-level handler | N/A | ✅ Works (if Cell passed correctly) |

## Practical Guidance

```typescript
// In computed() - use direct access
const myComputed = computed(() => {
  return argumentCell || defaultValue;  // ✅ Direct access
});

// In plain functions - use .get()/.set()
const myFunction = () => {
  const value = argumentCell.get();  // ✅ .get() for reading
  argumentCell.set(newValue);  // ✅ .set() for writing
};
```

## Why This Matters

If you use `.get()` inside computed() on an argument cell, you might get:
- `TypeError: argumentCell?.get is not a function`

This is confusing because the same cell works with `.get()` in other contexts.

## Related Docs

- `superstitions/2025-12-15-handler-args-unwrapped-in-ifelse.md` - Cells unwrapped in ifElse
- `folk_wisdom/2025-12-14-opaque-ref-closure-frame-limitation.md` - Frame context issues
- `blessed/computed-over-derive.md` - Prefer computed()

## Metadata

```yaml
topic: computed, argument, cell, get, proxy
discovered: 2025-12-15
status: superstition
pattern: extracurricular-selector, store-mapper
```

## Guestbook

- 2025-12-15 - Discovered while fixing `stagedClassSelections?.get is not a function` error in computed(). Changing to direct access fixed the issue. Verified pattern in store-mapper.tsx uses same direct access style. (extracurricular-selector / jkomoros)
