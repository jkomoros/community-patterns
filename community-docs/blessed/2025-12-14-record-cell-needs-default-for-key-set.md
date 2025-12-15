# Record Cells Need Default for .key().set() to Work

**Status:** Blessed (framework author confirmed 2025-12-14)
**Source:** Framework author direct guidance

## The Rule

When using `.key(k).set(v)` on a `Cell<Record<string, T>>`, the cell **MUST have a default empty object `{}`**.

Without the default, you'll get: `Error: Value at path value/argument/... is not an object`

## Correct Pattern

```typescript
// In argument types - use Default<> with empty object
type Argument = {
  selections: Default<Record<string, boolean>, {}>;  // <-- Default to {}
};

// Then .key().set() works
selections.key("some-id").set(true);
```

## Wrong Pattern

```typescript
// Without Default, cell may be undefined
type Argument = {
  selections: Cell<Record<string, boolean>>;  // <-- No default!
};

// This will error if cell is undefined or not an object
selections.key("some-id").set(true);  // Error!
```

## Framework Author Quote (2025-12-14)

> "yeah, that should work. it sounds like maybe there was no default empty object value set? (or that the default doesn't yet propagate, which robin's patch will fix)"

## Additional Safety

Until robin's patch lands, you may also want defensive guards:

```typescript
// In computed() that reads from Record cells
const selections = stagedClassSelections?.get() || {};
```

## Related

- Previous superstition `2025-12-08-record-key-set-handler-workaround.md` documented a spread-based workaround. The real fix is ensuring the Default is set.

## Metadata

```yaml
topic: cell, record, default, key-set
status: blessed
source: framework-author
date: 2025-12-14
```
