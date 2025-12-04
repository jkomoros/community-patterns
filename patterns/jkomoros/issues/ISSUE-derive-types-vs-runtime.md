# Bug: derive() TypeScript types don't match runtime behavior

## Summary

`derive()` with object parameters has TypeScript types that say `Cell<T>`, but runtime auto-unwraps to `T`. This forces developers to either:
- Use `.get()` (satisfies TS but is unnecessary at runtime)
- Use `// @ts-ignore` (works at runtime but loses type safety)

## Minimal Repro

```tsx
import { Cell, derive, pattern } from "commontools";

interface Input {
  flag: Default<boolean, true>;
  count: Default<number, 42>;
}

export default pattern<Input, ...>(({ flag, count }) => {
  const result = derive({ flag, count }, (values) => {
    // TypeScript thinks: values.flag is Cell<boolean>, values.count is Cell<number>
    // Runtime reality: values.flag is boolean, values.count is number

    // This causes TS error but WORKS at runtime:
    return values.flag ? values.count * 2 : 0;  // Returns 84

    // This satisfies TS but is UNNECESSARY at runtime:
    return values.flag.get() ? values.count.get() * 2 : 0;
  });
});
```

## Test Results

| Test | typeof at runtime | hasGet() method | Direct use works |
|------|-------------------|-----------------|------------------|
| Single Cell `derive(flag, ...)` | boolean | NO | ✅ Yes |
| Object param `values.flag` | boolean | NO | ✅ Yes |
| Object param `values.count` | number | NO | ✅ Yes |

**Expression `flag ? count*2 : 0`:** Returns `84` without `.get()` - values ARE auto-unwrapped!

## Framework Author Response

> "If they are indeed `Cell`, then it's a bug that they get unwrapped. there's a bunch of TS magic going on here, so maybe it's doing the wrong thing, or some crosstalk with the transformer. worth investigating, clearly TS and the runtime shouldn't disagree as documented here."

— seefeldb (2025-12-03)

## Expected Behavior

Either:
1. **Fix types:** `derive({ a, b }, (values) => ...)` should type `values.a` as `T`, not `Cell<T>`
2. **Fix runtime:** Pass actual Cell objects (with `.get()`) to match the types

## Workaround

Use `// @ts-ignore` or type assertions to silence TS errors:

```tsx
const result = derive({ flag, count }, (values) => {
  // @ts-ignore - runtime auto-unwraps despite types saying Cell
  return values.flag ? values.count * 2 : 0;
});
```

## Full Repro Pattern

See: `community-docs/superstitions/repros/2025-12-03-derive-types-vs-runtime-test.tsx`
