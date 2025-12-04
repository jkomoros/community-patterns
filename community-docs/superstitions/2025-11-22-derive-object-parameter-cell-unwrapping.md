# SUPERSEDED: derive() Object Parameter Behavior

**Date:** 2025-11-22
**Status:** SUPERSEDED (2025-12-04)

## This Superstition Was Wrong

This superstition originally claimed that `derive()` with object parameters required manual `.get()` calls. **This was incorrect.**

The framework author clarified (Dec 2025) that:
1. Values ARE directly usable without `.get()`
2. `derive()` is analogous to React's `useMemo`
3. The `OpaqueRef<T> & T` type means values work as `T`

## Correct Information

See the updated folk wisdom: `community-docs/folk_wisdom/derive-object-parameter-cell-unwrapping.md`

## What Likely Happened

The original observations may have been:
- Misinterpreting runtime behavior
- Confusing different issues (actual Cell vs OpaqueRef)
- An environment-specific problem

## Framework Author Quote

> "We shouldn't even talk about wrapping or unwrapping until we introduce explicit opaqueness markers. It's really a lot more like useMemo in React, so we could try that analogy (and computed is even closer to that FWIW)."
> — seefeldb (2025-12-04)
