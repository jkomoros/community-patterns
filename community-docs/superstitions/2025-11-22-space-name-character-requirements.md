# Space Name Character Requirements

**Date**: 2025-11-22
**Author**: jkomoros
**Confidence**: High
**Tags**: spaces, deployment, naming

## Observation

Space names have strict character requirements. Only the following characters are allowed:
- Letters: `a-z`, `A-Z`
- Numbers: `0-9`
- Hyphen: `-`
- Underscore: `_`

**Forward slashes `/` are NOT allowed**, even though they might seem natural for hierarchical organization (e.g., `jkomoros/WIP`).

## Context

When attempting to deploy a pattern to space `jkomoros/WIP`, the pattern failed to load correctly in the browser at `http://localhost:8000/jkomoros/WIP/<charm-id>`. The page would not display the pattern.

## Workaround

Use valid space names instead:
- ✅ `jkomoros-WIP`
- ✅ `jkomoros_WIP`
- ✅ `jkomorosWIP`
- ❌ `jkomoros/WIP` (contains illegal `/` character)

## Related Issues

None yet.

## Framework Version

Observed in commontools framework as of 2025-11-22.

## Notes

This is likely a routing or URL parsing issue where the `/` in the space name conflicts with URL path segments. The error is silent - the pattern deploys successfully via `ct charm new` but fails to load in the browser.
