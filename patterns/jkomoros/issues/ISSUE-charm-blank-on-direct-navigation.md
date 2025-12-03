# Bug: Charm Shows Blank on Direct Navigation But Works When Embedded

## Problem

The Google Auth charm renders completely blank when navigated to directly, but renders correctly when embedded via `{wishResult.result}` in another pattern.

## Reproduction

1. Deploy google-auth.tsx to a space (e.g., `jkomoros`)
2. Deploy hotel-membership-extractor.tsx to the same space (uses `wish("#googleAuth")`)
3. Navigate to hotel-membership-extractor - Google Auth UI renders correctly inline via `{wishResult.result}`
4. Click "Show All Charms" and click on "Google Auth" link
5. **Result**: Blank page - only header bar shows, no charm content

## Expected Behavior

Google Auth charm should render its UI when accessed directly, just like it does when embedded.

## Observed Behavior

- **Direct navigation**: Only header bar renders, charm content area is empty
- **Embedded via wish**: Full UI renders (permissions checkboxes, user profile, logout button, etc.)
- **No console errors** when loading directly
- Charm cell exists and has data (visible in debugger events)

## Evidence

URL when blank: `http://localhost:8000/jkomoros/baedreiekl6ppdjgmrfxbd3iobbqh6nj2vvznft42vsajbnjcxwzigq7mge`

The same charm cell ID works when embedded in hotel-membership-extractor.

## Investigation Results (2025-12-03)

### Key Finding: Instance-Specific, NOT Pattern-Specific

**Tested:**
1. Created minimal repro patterns (nav-repro-target.tsx, nav-repro-embedder.tsx) - both worked fine
2. The broken charm instance in `jkomoros` space still shows blank
3. **Fresh deployment of google-auth.tsx to a new space WORKS PERFECTLY**

Fresh deployment URL (renders correctly):
`http://localhost:8000/claude-nav-repro-1203-1/baedreifjhh6dpzcp5k4q25yymfovnik2ejforkihjd45aosf54xgua2e5y`

**Conclusion:** The bug is NOT with the google-auth pattern code - it's with the **specific old charm instance** that got corrupted somehow.

### Likely Cause

The old charm instance was probably updated using `charm setsrc`, which is known to have bugs that cause state conflicts. This may have corrupted the charm's internal state, leaving its data intact (so it renders when embedded via wish, which accesses the data directly) but breaking the pattern code execution (so direct navigation fails to render the UI).

## Hypothesis

~~Something about charm instantiation differs between:~~
~~1. Direct navigation (shell loads charm by cell ID)~~
~~2. Embedding via `wish().result` (charm is already "active" from wish lookup)~~

**Updated hypothesis:** The specific charm instance has corrupted state, likely from `charm setsrc` usage. The charm's data is intact (visible in debugger, accessible via wish) but the pattern code fails to execute on direct navigation.

## Context

- Discovered: 2025-12-03
- Pattern: patterns/jkomoros/google-auth.tsx
- Related: Works correctly when embedded via `{wishResult.result}` after PR #2169 changes
- Investigation: 2025-12-03 - confirmed instance-specific issue

## Workaround

**Recommended:** Deploy a fresh charm instance using `charm new` instead of trying to fix the corrupted one:

```bash
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns/claude.key \
  --space YOUR-SPACE \
  ../community-patterns/patterns/jkomoros/google-auth.tsx
```

Then favorite the new charm and update any references to it.

**Alternative:** Users can access the charm's UI through patterns that embed it via wish, rather than navigating directly (the data is still accessible).

## Status

**RESOLVED** (2025-12-03) - Confirmed as instance-specific corruption, not a framework bug.

After deleting sqlite spaces and restarting dev servers, fresh deployments work perfectly on direct navigation. The original charm instance was corrupted, likely from `charm setsrc` usage. This reinforces the community superstition about avoiding `charm setsrc`.

Fresh Google Auth deployed to `jkomoros` space and favorited.
