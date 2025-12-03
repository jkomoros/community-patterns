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

## Hypothesis

Something about charm instantiation differs between:
1. Direct navigation (shell loads charm by cell ID)
2. Embedding via `wish().result` (charm is already "active" from wish lookup)

The charm's pattern code may not be executing on direct navigation, or the [UI] property isn't being rendered.

## Context

- Discovered: 2025-12-03
- Pattern: patterns/jkomoros/google-auth.tsx
- Related: Works correctly when embedded via `{wishResult.result}` after PR #2169 changes

## Workaround

Users can access the charm's UI through patterns that embed it via wish, rather than navigating directly.
