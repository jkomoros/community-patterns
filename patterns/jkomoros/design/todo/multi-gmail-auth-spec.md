# Multi-Account Gmail Auth Spec

## Problem Statement

Users may have multiple Google accounts (personal, work, possibly multiple of each). Currently:
- Single `google-auth.tsx` pattern with tag `#googleAuth`
- Gmail patterns wish for `#googleAuth` and get whatever is favorited
- No way to specify "I want my work Gmail for this pattern"
- No way for a composing pattern to select which account to use

## Goals

1. Support multiple Gmail accounts (personal, work, etc.)
2. Work seamlessly for single-account users (no extra complexity)
3. Allow patterns to specify which account type they want
4. Support both pre-hoc (choose type before login) and post-hoc (classify after login) flows
5. Use the existing wish system with tags

## Test Results (2025-12-04)

### Multiple Tags: ✅ CONFIRMED WORKING

Tested with `wish-tag-test.tsx` and `multi-tag-source.tsx`:
- Pattern with `/** ... #testTag1 #testTag2 */` in Output description
- Favorited the charm
- Both `wish({ query: "#testTag1" })` and `wish({ query: "#testTag2" })` found it

### Reactive Wish Queries: ✅ CONFIRMED WORKING

Tested with `reactive-wish-test.tsx`:
- Passed a Cell<string> to `wish({ query: selectedTag })`
- Changing the cell value re-evaluates the wish dynamically
- Patterns CAN switch accounts on-the-fly with a dropdown

### Hashtag Character Limitations: ⚠️ IMPORTANT

**From framework source (`wish.ts` line 245):**
```typescript
entry.tag?.toLowerCase().matchAll(/#([a-z0-9-]+)/g)
```

**Only these characters are allowed in hashtags:**
- Lowercase letters: `a-z`
- Numbers: `0-9`
- Hyphens: `-`

**NOT allowed:** `+`, `_`, spaces, uppercase (converted to lowercase)

**Implications for scope tags:**
- ❌ `#googleAuth+Gmail` - won't work
- ❌ `#googleAuth_Gmail` - won't work
- ✅ `#googleAuthGmail` - works (camelCase lowercased)
- ✅ `#googleauth-gmail` - works (hyphens)

## Design: Two Classification Flows

### Pre-hoc Classification (User Knows Beforehand)

User creates a typed auth pattern directly:

```
User creates "Google Auth (Work)"
    → Logs in with work account
    → Favorites it
    → Tagged with #googleAuth #googleAuthWork
```

### Post-hoc Classification (Classify After Login)

User logs in first, then classifies:

```
User creates "Google Auth Switcher"
    → Logs in with any account
    → Sees: "alex@gmail.com - What type is this?"
    → Clicks [Personal] or [Work]
    → Switcher creates wrapper pattern
    → Navigates to wrapper for favoriting
```

**Why post-hoc is better UX:**
- User sees actual email before classifying
- Prevents "oops, logged into wrong account" mistakes
- More natural flow

## Architecture

### Pattern Structure

```
patterns/jkomoros/
├── google-auth.tsx              # Base OAuth (unchanged) - #googleAuth
├── google-auth-personal.tsx     # Wrapper - #googleAuth #googleAuthPersonal
├── google-auth-work.tsx         # Wrapper - #googleAuth #googleAuthWork
├── google-auth-switcher.tsx     # Post-hoc classifier (creates wrappers)
└── gmail-*.tsx                  # Accept accountType, use reactive wish
```

### 1. Base `google-auth.tsx` (UNCHANGED)

```typescript
/** Google OAuth authentication for Google APIs. #googleAuth */
interface Output {
  auth: Auth;
  scopes: string[];
  selectedScopes: SelectedScopes;
}
```

### 2. Wrapper Pattern: `google-auth-personal.tsx`

```typescript
/** Personal Google account. #googleAuth #googleAuthPersonal */
interface Output {
  auth: Auth;
  accountType: "personal";
}

const GoogleAuthPersonal = pattern<Input, Output>(({ auth }) => {
  // Compose OR link to base google-auth
  const baseAuth = GoogleAuth({ auth });

  return {
    [NAME]: derive(baseAuth.auth, (a) =>
      `Google Auth (Personal) - ${a?.user?.email || "Not logged in"}`
    ),
    [UI]: (
      <div>
        <div style={{
          padding: "8px 12px",
          background: "#dbeafe",
          borderRadius: "6px",
          marginBottom: "12px",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <span style={{
            background: "#3b82f6",
            color: "white",
            padding: "2px 8px",
            borderRadius: "4px",
            fontSize: "12px",
            fontWeight: "600"
          }}>PERSONAL</span>
          <span>{derive(baseAuth.auth, (a) => a?.user?.email || "")}</span>
        </div>
        {baseAuth}
      </div>
    ),
    auth: baseAuth.auth,
    accountType: "personal",
  };
});
```

### 3. Wrapper Pattern: `google-auth-work.tsx`

Same as personal, but with:
- Tag: `#googleAuth #googleAuthWork`
- Badge: Red background, "WORK" label
- `accountType: "work"`

### 4. Switcher Pattern: `google-auth-switcher.tsx`

```typescript
const GoogleAuthSwitcher = pattern<Input, Output>(({ auth }) => {
  const baseAuth = GoogleAuth({ auth });
  const isLoggedIn = derive(baseAuth.auth, (a) => !!a?.user?.email);

  const createPersonalWrapper = handler<...>((...) => {
    // Create GoogleAuthPersonal with linked auth
    const wrapper = GoogleAuthPersonal({ auth: baseAuth.auth });
    navigateTo(wrapper);
  });

  const createWorkWrapper = handler<...>((...) => {
    // Create GoogleAuthWork with linked auth
    const wrapper = GoogleAuthWork({ auth: baseAuth.auth });
    navigateTo(wrapper);
  });

  return {
    [NAME]: "Google Auth Setup",
    [UI]: (
      <div>
        {baseAuth}

        {/* Show classification buttons after login */}
        {ifElse(isLoggedIn, (
          <div style={{ marginTop: "16px", padding: "16px", background: "#f8fafc" }}>
            <h3>What type of account is this?</h3>
            <p>Logged in as: {derive(baseAuth.auth, a => a?.user?.email)}</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={createPersonalWrapper({})}>
                Personal Account
              </button>
              <button onClick={createWorkWrapper({})}>
                Work Account
              </button>
            </div>
            <p style={{ fontSize: "12px", color: "#666" }}>
              Or favorite this charm directly for generic #googleAuth access
            </p>
          </div>
        ), null)}
      </div>
    ),
    auth: baseAuth.auth,
  };
});
```

### 5. Gmail Patterns - Dynamic Account Selection

```typescript
interface GmailAgenticSearchInput {
  // ... existing inputs
  accountType?: Default<"default" | "personal" | "work", "default">;
}

const GmailAgenticSearch = pattern<...>(({ accountType, ... }) => {
  // Dynamic wish tag based on accountType
  const wishTag = derive(accountType, (type) => {
    switch (type) {
      case "personal": return "#googleAuthPersonal";
      case "work": return "#googleAuthWork";
      default: return "#googleAuth";
    }
  });

  // Reactive wish - re-evaluates when accountType changes!
  const wishResult = wish<GoogleAuthCharm>({ query: wishTag });

  // ... rest of pattern with account selector dropdown
});
```

## Scope Tags (Future Enhancement)

Same tagging system can support OAuth scopes:

```typescript
/** Gmail-only auth. #googleAuth #googleAuthGmail */
/** Calendar auth. #googleAuth #googleAuthCalendar */
/** Gmail+Calendar auth. #googleAuth #googleAuthGmail #googleAuthCalendar */
```

**Tag naming (valid characters: a-z, 0-9, -):**
- `#googleAuthGmail` or `#googleauth-gmail`
- `#googleAuthCalendar` or `#googleauth-calendar`
- `#googleAuthGmailCalendar` or `#googleauth-gmail-calendar`

Patterns could wish for specific scopes:
```typescript
// Gmail pattern needs gmail scope
const auth = wish({ query: "#googleAuthGmail" });

// Calendar pattern needs calendar scope
const auth = wish({ query: "#googleAuthCalendar" });
```

## User Flows

### Single Account User (No Change)
1. Create `google-auth` or `google-auth-switcher`
2. Log in
3. Favorite it (skip classification if desired)
4. Gmail patterns find it via `#googleAuth`

### Multi-Account User (Pre-hoc)
1. Create `google-auth-personal` → log in with personal → favorite
2. Create `google-auth-work` → log in with work → favorite
3. Gmail patterns wish for specific type

### Multi-Account User (Post-hoc)
1. Create `google-auth-switcher` → log in
2. Click "Personal" or "Work"
3. Wrapper created, navigate to it, favorite it
4. Repeat for other account

### Existing Auth Classification
If user has an existing `google-auth` charm and wants to classify it:
1. Create `google-auth-personal` or `google-auth-work`
2. Link its `auth` input to the existing charm's `auth` output
3. Favorite the wrapper
4. Original charm can stay favorited as generic fallback

## Implementation Plan

### Phase 1: Core Infrastructure ✅ COMPLETE
- [x] Create `google-auth-personal.tsx` (wrapper with #googleAuthPersonal)
- [x] Create `google-auth-work.tsx` (wrapper with #googleAuthWork)
- [x] Test wrapper composition with actual google-auth
- [x] Test multiple tags work (CONFIRMED)
- [x] Test reactive wishes work (CONFIRMED)
- [x] Verify hashtag character limitations (a-z, 0-9, - only)
- [x] Create `google-auth-switcher.tsx` (post-hoc classification)

### Phase 2: Gmail Updates (IN PROGRESS)
- [x] Add `accountType` input to `gmail-agentic-search.tsx`
- [x] Add account selector dropdown UI
- [x] Reactive wish based on accountType
- [ ] Fix UI dropdown write (Default cell is read-only - framework limitation)
- [ ] Update hotel-membership-gmail-agent to use accountType
- [ ] Update gmail-importer to use accountType

### Phase 3: Future
- [ ] Scope-based tags (#googleAuthGmail, etc.)
- [ ] Combined account+scope tags
- [ ] Update documentation

## Key Decisions

1. **Classification timing:** Support BOTH pre-hoc and post-hoc
2. **Wrapper vs modify:** Wrappers are cleaner - original stays as fallback
3. **Fallback behavior:** If user explicitly requests work, require setup (no silent fallback)
4. **Visual style:** Color badge (blue=personal, red=work) + email in title
5. **Hashtag format:** Use camelCase or hyphens (no + or _)

## Risk Mitigation

1. **Breaking existing users:** Default `#googleAuth` unchanged
2. **Cross-space wish:** CT-1090 workaround still needed
3. **Character limitations:** Document that + doesn't work in tags
4. **Multiple matches:** First match wins (existing behavior)
