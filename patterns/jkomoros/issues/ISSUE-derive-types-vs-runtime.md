# RESOLVED: derive() TypeScript types (CT-1097)

## Status: RESOLVED - Not a Bug

The framework author investigated and found the types ARE correct.

## Original Concern

We thought `derive()` with object parameters had TypeScript types that said `Cell<T>`, but runtime auto-unwrapped to `T`.

## Framework Author Response (2025-12-04)

> "Just tried to repro by creating a test.tsx file in packages/patterns on main and IDE shows me [OpaqueRef & T] which is actually OpaqueRef, which because of the & is really basically T."
>
> "Either way, it's not a Cell and there is no TS error when omitting .get(). There is also a unit test that explicitly tests this scenario."
>
> "So might be worth double checking your environment. Or the problem is upstream in the prompt and how we explain derive. We shouldn't even talk about wrapping or unwrapping until we introduce explicit opaqueness markers. It's really a lot more like useMemo in React, so we could try that analogy (and computed is even closer to that FWIW)."

## Resolution

1. **Types are correct**: `OpaqueRef<T> & T` is essentially `T`
2. **No `.get()` needed**: Values are directly usable
3. **Mental model**: Think of `derive()` like React's `useMemo`
4. **Documentation updated**: Folk wisdom now uses correct analogy

## What We Learned

- Don't use "wrapping/unwrapping" language for derive
- `derive()` is like `useMemo` - reactive computation with dependencies
- `computed()` is even closer to `useMemo`
- When in doubt, test in a clean environment

## Related Updates

- Updated: `community-docs/folk_wisdom/derive-object-parameter-cell-unwrapping.md`
- Superseded: `community-docs/superstitions/2025-11-22-derive-object-parameter-cell-unwrapping.md`
