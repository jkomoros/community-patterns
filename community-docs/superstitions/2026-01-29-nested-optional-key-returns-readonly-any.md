# Nested .key() Through Optional Fields Returns Readonly<any>

**Date:** 2026-01-29 **Status:** confirmed **Confidence:** high **Stars:** 3

## TL;DR - The Rule

**When accessing nested fields through an optional parent via `.key()`, the
return type degrades to `Readonly<any>`.** TypeScript will reject comparisons
and arithmetic with this type. Wrap in `Number()` for numeric fields or use
explicit type assertions.

```tsx
// Given this type:
interface Person {
  birthday?: Default<
    { month: number; day: number; year: number },
    { month: 0; day: 0; year: 0 }
  >;
}

// BROKEN - TypeScript error: can't compare Readonly<any> to number
const month = person.key("birthday").key("month").get();
if (month > 0) { /* ... */ } // Error

// WORKS - Wrap in Number() to coerce type
const month = Number(person.key("birthday").key("month").get()) || 0;
if (month > 0) { /* ... */ } // OK
```

---

## Problem

When a parent field is optional (marked with `?`), `.key("parent")` returns
`Cell<T | undefined>`. Chaining `.key("child")` on that cell produces a value
typed as `Readonly<any>` rather than the expected concrete type (e.g.,
`number`).

TypeScript will not allow you to:

- Compare `Readonly<any>` to `number` in strict mode
- Use it in arithmetic expressions
- Pass it where a concrete `number` is expected

### Why This Happens

1. The parent field is `?` optional, so `.key("birthday")` returns
   `Cell<Birthday | undefined>`
2. Calling `.key("month")` on `Cell<Birthday | undefined>` causes TypeScript to
   resolve the nested key against a union type that includes `undefined`
3. TypeScript degrades the result to `Readonly<any>` because `undefined` has no
   `.month` property

At runtime, the value is always populated (the schema default fills it in), so
this is purely a TypeScript-level issue.

## Solution

For numeric fields, wrap in `Number()` with a fallback:

```typescript
// Coerce to number, fallback to 0 if undefined/NaN
const month = Number(person.key("birthday").key("month").get()) || 0;
const day = Number(person.key("birthday").key("day").get()) || 0;
const year = Number(person.key("birthday").key("year").get()) || 0;
```

For string fields, use `String()` or template literals:

```typescript
const value = String(person.key("address").key("city").get() ?? "");
```

For boolean fields, use `Boolean()` or double-negation:

```typescript
const active = Boolean(person.key("settings").key("active").get());
```

## Context

This issue surfaces when using the architect-approved pattern of optional
`Default<>` fields (see `2026-01-29-writable-of-no-args-breaks-runtime.md`). The
optional annotation enables decoupled partial instantiation, but introduces this
type degradation when accessing nested properties.

The tradeoff is worth it: decoupled instantiation is more valuable than perfect
nested types. The `Number()`/`String()` wrapping is a minor ergonomic cost.

## Related Documentation

- `2026-01-29-writable-of-no-args-breaks-runtime.md` -- The optional `Default<>`
  pattern that causes this
- `docs/common/concepts/types-and-schemas/` -- Type system documentation

---

## Metadata

```yaml
topic: types, optional fields, Default<>, nested key access, type coercion
status: confirmed
confirmed_date: 2026-01-29
sessions:
  - 2026-01-29: Encountered while building birthday display in contacts person pattern
```

## Guestbook

- **2026-01-29** -- Discovered while implementing birthday fields on Person type
  with optional `Default<>` parent. The `.key("birthday").key("month").get()`
  chain returned `Readonly<any>`, preventing numeric comparisons in conditional
  display logic. `Number()` wrapping resolved the TypeScript error with no
  runtime impact.
