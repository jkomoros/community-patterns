# Gmail Auth Wish Refactor TODO

Branch: `gmail-auth-wish`

## Goal
Refactor all Gmail-consuming patterns to use the new `wish()` + favorites system for authentication sharing. This enables a single `gmail-auth` charm to be favorited and automatically discovered by any pattern that needs Gmail access, even across spaces.

## Design Decisions
- **Single auth pattern**: One `gmail-auth.tsx` gets favorited and shared everywhere
- **Create on first use**: If no auth is found via wish, patterns create one and prompt user to favorite it
- **Backwards compatible**: Patterns still accept explicit `authCharm` input as override
- **Tag**: Use `#googleAuth` in the Output type JSDoc comment

---

## Phase 1: Minimal Test (Verify wish works)

### 1.1 Create wish-auth-test.tsx
- [ ] Create minimal pattern in WIP/ that:
  - Wishes for `#googleAuth`
  - Shows wish result state (found/not found/error)
  - If not found, shows "Please favorite a Gmail Auth charm"
- [ ] Deploy and test:
  - Without any favorited auth → should show "not found" message
  - After favoriting gmail-auth → should find it

### 1.2 Verify cross-space behavior
- [ ] Deploy test pattern to space A
- [ ] Deploy gmail-auth to space B, favorite it, authenticate
- [ ] Verify test pattern in space A finds the auth from space B

---

## Phase 2: Update gmail-auth.tsx

### 2.1 Add #googleAuth tag
- [ ] Add JSDoc comment with `#googleAuth` tag to Output type:
  ```tsx
  /** Google OAuth authentication for Gmail API access. Tag: #googleAuth */
  interface Output {
    auth: Auth;
  }
  ```
- [ ] Verify tag appears in compiled schema description

### 2.2 Add "Please favorite me" UI
- [ ] Add prominent message/banner when authenticated:
  "⭐ Favorite this charm to share auth across all your Gmail patterns!"
- [ ] Could detect if already favorited? (may not be possible yet)

---

## Phase 3: Create useGoogleAuth helper

### 3.1 Create shared auth hook/pattern
- [ ] Create `utils/use-google-auth.tsx` (or similar) that encapsulates:
  - Wish for `#googleAuth`
  - If not found AND no explicit auth provided, create GmailAuth inline
  - Return { auth, authCharm, needsFavoriting } or similar
  - Handle the "please favorite" UI state

### 3.2 Export Auth type
- [ ] Ensure `Auth` type is exported from gmail-auth.tsx for consumers

---

## Phase 4: Update gmail-importer.tsx

### 4.1 Add wish-based auth discovery
- [ ] Keep `authCharm` as optional input (backwards compat)
- [ ] If no authCharm provided, wish for `#googleAuth`
- [ ] If wish fails, create GmailAuth inline and show favorite prompt
- [ ] Extract auth from either source

### 4.2 Update UI
- [ ] Show auth status indicator (as it does now)
- [ ] If using wished auth, show "Using shared auth from [charm name]"
- [ ] If created new auth, show favorite prompt

### 4.3 Test
- [ ] Test with explicit authCharm (backwards compat)
- [ ] Test with favorited auth (wish finds it)
- [ ] Test with no auth (creates and prompts)

---

## Phase 5: Update dependent patterns

### 5.1 substack-summarizer.tsx
Current: Creates own `GmailAuth()` and `GmailImporter()`
- [ ] Remove explicit GmailAuth creation
- [ ] Pass `authCharm: undefined` to GmailImporter (let it wish)
- [ ] OR: wish for #googleAuth directly and pass to importer
- [ ] Test the "first use creates auth" flow

### 5.2 prompt-injection-tracker.tsx
Current: Creates own `GmailAuth()` and `GmailImporter()`
- [ ] Same refactor as substack-summarizer
- [ ] Test with shared auth

### 5.3 hotel-membership-extractor.tsx
Current: Creates own `GmailAuth()` internally
- [ ] Refactor to use wish-based auth
- [ ] This pattern is complex - may need careful testing

### 5.4 gmail-charm-creator.tsx
Current: Factory for creating auth + importers
- [ ] Consider simplifying or deprecating
- [ ] If kept: should wish for existing auth before creating new one
- [ ] May become unnecessary if other patterns self-manage auth

---

## Phase 6: Testing & Polish

### 6.1 End-to-end testing
- [ ] Fresh user flow: deploy any Gmail pattern → creates auth → prompts favorite → works everywhere
- [ ] Existing user flow: already has favorited auth → new patterns find it automatically
- [ ] Cross-space: auth in space A, pattern in space B

### 6.2 Error handling
- [ ] Graceful handling if wish fails unexpectedly
- [ ] Clear error messages for user
- [ ] Token refresh still works with wished auth

### 6.3 Documentation
- [ ] Update README or design docs about new auth pattern
- [ ] Document the "favorite to share" workflow

---

## Patterns Inventory

| Pattern | Status | Notes |
|---------|--------|-------|
| gmail-auth.tsx | TODO | Add #googleAuth tag, favorite prompt |
| gmail-importer.tsx | TODO | Add wish fallback |
| substack-summarizer.tsx | TODO | Use importer's wish |
| prompt-injection-tracker.tsx | TODO | Use importer's wish |
| hotel-membership-extractor.tsx | TODO | Complex, careful testing |
| gmail-charm-creator.tsx | TODO | May deprecate or simplify |
| WIP/prompt-injection-tracker-WIP.tsx | TODO | Same as main version |

---

## Open Questions

1. **Tag format**: Is `#googleAuth` the right tag, or should it be `#gmail-auth` or `#google-oauth`?

2. **Multiple Google accounts**: If user has auth for multiple Google accounts, how do they choose? (May be future work - for now, first favorite wins)

3. **Revoking/changing auth**: What happens if user unfavorites or deletes their auth charm?

4. **wish() API stability**: This is new - are there known issues or gotchas?

---

## Session Log

### Session 1 (2024-11-25)
- Created branch `gmail-auth-wish`
- Researched FAVORITES.md documentation
- Analyzed wish.ts implementation
- Audited all jkomoros patterns for auth usage
- Created this TODO document
- Next: Start Phase 1 - minimal test pattern

### Session 2 (2024-11-26)
- Created wish-auth-test.tsx in WIP/
- Added `#googleAuth` tag to gmail-auth.tsx Output interface
- Deployed and tested - wish for #googleAuth consistently fails with "No favorite found matching 'googleauth'"

**DISCOVERED FRAMEWORK BUG in wish.ts:**

The `tag` field in favorites entries is a reactive Cell that loads asynchronously. But wish.ts accesses it synchronously:

```typescript
// In wish.ts resolveBase() default case (lines 237-251):
const favoritesCell = homeSpaceCell.key("favorites").asSchema(favoriteListSchema);
const favorites = favoritesCell.get() || [];  // Gets array, but tag fields not yet loaded!

const match = favorites.find((entry) =>
  entry.tag?.toLowerCase().includes(searchTerm)  // entry.tag is undefined at this point!
);
```

**Evidence:**
- Created favorites-debug.tsx that reads the same favorites list
- When accessing `fav.tag` directly in JSX with derive(), tag IS populated (777 chars, contains "googleauth")
- When accessing `f.tag` synchronously inside a derive callback with `.find()`, tag is `undefined`
- This explains why `wish({ tag: "#favorites" })` works (returns raw list) but `wish({ tag: "#googleAuth" })` fails (does synchronous search)

**The bug:** wish.ts needs to await/sync the tag fields before searching, or use a reactive approach.

**Debug patterns created:**
- `WIP/wish-auth-test.tsx` - minimal test for #googleAuth
- `WIP/favorites-debug.tsx` - shows favorites list with tags
- `WIP/wish-debug.tsx` - shows the tag timing issue

**Next steps:**
1. File this as a framework issue in labs
2. Wait for fix, or
3. Find workaround (e.g., use #favorites and search manually in pattern code)

### Session 2 continued - Community Docs Research

Searched community-docs for related issues:

**Found related superstition:** `2025-11-25-opaqueref-properties-not-accessible-in-arrays.md`
- Documents that OpaqueRef properties are not accessible when stored in Cell arrays
- Same root cause: reactive Cell-backed properties load asynchronously
- Synchronous access returns `undefined`, but JSX binding works
- Workaround there: store wrapper objects with duplicated data

**Key insight:** This is a known pattern issue, not just wish.ts. Any code that:
1. Stores objects with Cell-backed properties in arrays
2. Then tries to access those properties synchronously via `.find()`, `.map()`, etc.
Will fail due to the async loading timing.

**Workaround attempts:**
- `wish({ tag: "#favorites" })` + manual derive search - FAILS (derive callbacks also access synchronously)
- Direct JSX binding - WORKS but not useful for programmatic access

**Conclusion:** No pattern-level workaround found. This requires a framework fix in wish.ts to either:
1. Make tag loading synchronous/blocking before search
2. Use truly reactive approach that defers search until tags are loaded
3. Change favorites structure to store tags eagerly

**Status:** BLOCKED - waiting for framework fix (expected today, 2024-11-26)

**Update:** Framework author is aware of the OpaqueRef-in-arrays issue and planning to fix it today. Since wish.ts tag search has the same root cause, this fix should unblock us.

**Debug patterns preserved for reproduction:**
- `WIP/wish-auth-test.tsx` - demonstrates the failure
- `WIP/favorites-debug.tsx` - shows tags ARE present when accessed reactively
- `WIP/wish-debug.tsx` - shows the timing difference

**Additional evidence:** Labs' own `packages/patterns/wish.tsx` also fails with "No favorite found matching 'note'" when deployed and tested, confirming this is a framework bug not specific to my patterns.

### Session 2 continued - Framework Fix Confirmed! ✅

After framework author fixed the issue, re-tested:

1. Deployed fresh gmail-auth.tsx with `#googleAuth` tag
2. Favorited it (star button)
3. Authenticated with Google
4. Deployed wish-auth-test.tsx
5. **SUCCESS!** wish-auth-test shows:
   - Status: ✅ Auth Found!
   - Email: jkomoros@gmail.com
   - Name: Alex Komoroske
   - Has Token: Yes

**Key learnings:**
- The first reactive run returns empty favorites `[]` and throws error
- Subsequent reactive updates populate the data correctly
- Pattern code handles this gracefully - just needs to wait for reactive update
- Console shows: `favorites [] → error` then `favorites [7 objects] → result`

**Phase 1 COMPLETE!** Ready to proceed with Phase 2-6.

### Session 3 (2024-11-26) - Phase 4 Complete

**Completed Phase 2:** Updated gmail-auth.tsx with favorite prompt UI (already had #googleAuth tag).

**Completed Phase 4:** Updated gmail-importer.tsx with wish-based auth discovery:
- Made `authCharm` input optional with `Default<any, null>`
- Added `wish<GoogleAuthCharm>({ tag: "#googleAuth" })` fallback
- Added `hasExplicitAuth`, `effectiveAuthCharm`, `usingWishedAuth` derived values
- Updated UI to show auth source ("Using shared auth from favorited Gmail Auth charm")
- Tested successfully: fetched 26 emails using wished auth

**Investigation: Why did user need to re-authenticate?**

Deployed favorites-debug.tsx to examine the favorites list. Found:

1. **8 duplicate Gmail Auth favorites** - All named "Gmail Auth #qw4zce", all with `#googleAuth` tag
2. **Raw wish result shows**: `{ "result": [ null, {}, {}, {}, {}, {}, {}, {} ] }`
   - First entry is `null`, rest are empty objects `{}`
   - This is despite clicking on Entry 0 which DOES show authenticated data!
3. **Root cause**: The wish for raw `#favorites` returns the list, but individual charm data loads asynchronously
   - `wish({ tag: "#googleAuth" })` DOES work correctly (returns the first match with data)
   - But during async loading, the first match might not be the authenticated one

**Why re-authentication was needed:**
- Previous session likely had the same 8 duplicates
- The `wish()` found one of the unauthenticated charms first
- When we re-authenticated, we authenticated a specific charm (Entry 0)
- Now that charm is the one `wish()` finds

**Recommendation:**
- Clean up duplicate favorites (unfavorite 7 of the 8 Gmail Auth charms)
- Only keep one favorited Gmail Auth charm
- The framework doesn't distinguish between authenticated and unauthenticated - first match wins

**Files modified:**
- `gmail-importer.tsx` - Added wish-based auth discovery

**Next:**
1. Clean up debug console.log statements from gmail-importer.tsx
2. Phase 5: Update dependent patterns (substack-summarizer, prompt-injection-tracker, etc.)

### Session 3 continued - Phase 5 Complete

**Updated patterns to use wish-based auth:**
- `substack-summarizer.tsx` - Removed GmailAuth, passes `authCharm: null`
- `prompt-injection-tracker.tsx` - Same treatment
- `page-creator.tsx` - Removed GmailCharmCreator import and button

**Deleted:**
- `gmail-charm-creator.tsx` - No longer needed (patterns self-discover auth)

**Not updated (per user request):**
- `hotel-membership-extractor.tsx` - Still has its own auth

**Tested in Playwright:**
- substack-summarizer: ✅ Shows "Using shared auth from favorited Gmail Auth charm"
- prompt-injection-tracker: ✅ Shows "Authenticated" with shared auth

**Multiple accounts - TODO (framework limitation):**
The current wish system only returns the first match, and the tag is in the schema description (not instance data), so all gmail-auth charms have the same `#googleAuth` tag. Framework author is planning support for this. Workaround: create separate patterns like `gmail-auth-work.tsx` and `gmail-auth-personal.tsx` with different tags.

---

## Summary

**Completed:**
- Phase 1: Verified wish + favorites system works
- Phase 2: Added #googleAuth tag and favorite prompt to gmail-auth.tsx
- Phase 4: Added wish-based auth discovery to gmail-importer.tsx
- Phase 5: Updated dependent patterns to use wish-based auth

**Key learnings documented:**
- First reactive pass has empty data (superstition)
- Duplicate favorites can cause issues (first match wins)
- Multiple accounts need framework support
