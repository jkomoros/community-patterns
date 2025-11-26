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
