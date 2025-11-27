# Favorites Not Persisting Across Page Navigation

## Summary

Favorites don't persist across page navigations. When you favorite a charm (star turns ⭐), navigate away, and return, the favorite is lost (star shows ☆).

This may be related to recent changes to home space handling, but I wanted to flag it in case it's unintentional.

## What We Observed

1. **The favorite UI appears to work initially**
   - Clicking the star changes it from ☆ to ⭐
   - No errors in the console when favoriting
   - The charm appears to be favorited in that session

2. **Favorites are lost on navigation**
   - Navigate to any other page
   - Return to the charm
   - Star is back to ☆ (empty)

3. **`wish()` can't find favorited charms**
   - `wish("#googleAuth")` returns "No favorite found matching 'googleauth'"
   - This breaks patterns like gmail-importer that depend on finding auth charms
   - The error appears on the first reactive pass, and unlike normal first-pass timing issues, subsequent passes don't resolve it

4. **This worked recently**
   - The same patterns (gmail-importer, hotel-membership-extractor) worked earlier the same day
   - Something changed between working and broken states

## Steps to Reproduce

1. Navigate to any charm (e.g., `/jkomoros-test/baedrei...`)
2. Click the star button to favorite it (☆ → ⭐)
3. Navigate to a different page (e.g., `/jkomoros-test`)
4. Navigate back to the same charm
5. **Expected:** Star should still be filled (⭐)
6. **Actual:** Star is empty (☆) - favorite was lost

## Impact

- `wish("#tag")` can't find favorited charms reliably
- Patterns that depend on discovering auth charms (like gmail-importer finding gmail-auth via `wish("#googleAuth")`) don't work
- Users have to re-favorite and re-authenticate on every page load

## How We Diagnosed This

### Initial confusion
We were working on hotel-membership-extractor and couldn't get `wish("#googleAuth")` to find the favorited gmail-auth charm. Initially we thought:
- Maybe the wish syntax was wrong (`tag` vs `query` parameter)
- Maybe it was a first-reactive-pass timing issue (per our superstitions doc)
- Maybe the pattern code had a bug

### Realizing it was broader
We noticed that even gmail-importer (which previously worked) was also failing to find auth. Both patterns use the same `wish("#googleAuth")` call, suggesting a framework-level issue.

### Bisecting labs
We bisected the labs repo by:
1. Checking out different commits
2. Running `./scripts/restart-local-dev.sh --force` after each checkout
3. Deploying a simple counter charm
4. Testing if favorites persist across navigation

This identified the exact commit where behavior changed.

## Bisect Results

| Commit | Description | Favorites Persist? |
|--------|-------------|-------------------|
| `d3d708b73` | Allow wish to read favorites | ✅ Works |
| `b7f349f99` | Shell view refactor | ✅ Works |
| `62e03294a` | Rename tag to query | ✅ Works |
| **`a83109850`** | **Add home space to shell (#2170)** | ❌ Broken |
| `e018b1adb` | Docs: key learnings | ❌ Broken |
| `03c6e190e` | Fix Cell.push in handler | ❌ Broken |
| `78c2e50b6` | Fix wish object syntax (HEAD) | ❌ Broken |

**First broken commit:** `a83109850` - "feat: Add home space to shell when on the root path (#2170)"

## Possible Cause

Since favorites are stored in the home space (user's DID), I wonder if the refactoring to support builtin "home" views might have inadvertently affected how the home space is initialized or accessed when viewing charms in other spaces.

Looking at the commit, the key changes were:
- Refactored `default-pattern.ts` into `pattern-factory.ts`
- Added support for builtin "home" view type
- Changed view type checking in `runtime.ts` from `typeof view === "string"` to `"builtin" in view`

The PR description says it "Shows the Home space when visiting the root path" - no mention of changing favorites behavior, so this side effect was likely unintentional.

## Test Method

For each commit tested:
1. `git checkout <commit>` in labs
2. `./scripts/restart-local-dev.sh --force`
3. Deploy a counter charm: `deno task ct charm new patterns/examples/counter.tsx --space jkomoros-test`
4. Navigate to the charm in browser
5. Click favorite star (verify it turns ⭐)
6. Navigate to `/jkomoros-test` (space root)
7. Navigate back to the charm
8. Check if star is still filled (⭐) or empty (☆)

## Environment

- Local dev environment (localhost:8000 / localhost:5173)
- Testing with Playwright browser automation
- Identity: claude.key in community-patterns repo
- Date: November 27, 2025
