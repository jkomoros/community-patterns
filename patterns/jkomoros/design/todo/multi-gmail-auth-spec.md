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
4. Use the existing wish system with tags

## How Wishes Work (Background)

From FAVORITES.md:
```typescript
/** Represents a small #note a user took to remember some text. */
type Output = { ... }

// Later:
const wishResult = wish<{ content: string }>({ query: "#note" });
```

- Tags are embedded in type/schema descriptions
- `wish()` searches for favorited charms matching the tag
- Multiple tags in one description should work: `#googleAuth #googleAuthPersonal`

## Proposed Design

### Approach: Tagged Auth Variants

Create wrapper patterns that compose `google-auth.tsx` and add specific tags.

### Pattern Structure

```
patterns/jkomoros/
├── google-auth.tsx                 # Base - tag: #googleAuth (unchanged)
├── google-auth-personal.tsx        # NEW - tags: #googleAuth #googleAuthPersonal
├── google-auth-work.tsx            # NEW - tags: #googleAuth #googleAuthWork
└── gmail-*.tsx                     # Updated to support account selection
```

### 1. Base google-auth.tsx (UNCHANGED)

The existing pattern stays as-is:
```typescript
/** Google OAuth authentication for Google APIs. #googleAuth */
interface Output {
  auth: Auth;
  scopes: string[];
  selectedScopes: SelectedScopes;
}
```

- Single-account users only need this
- Continue to wish for `#googleAuth`

### 2. google-auth-personal.tsx (NEW)

```typescript
/** Personal Google account authentication. #googleAuth #googleAuthPersonal */
interface Output {
  auth: Auth;
  accountType: "personal";
}

const GoogleAuthPersonal = pattern<Input, Output>(({ auth }) => {
  // Compose base google-auth
  const baseAuth = GoogleAuth({ auth });

  return {
    [NAME]: "Google Auth (Personal)",
    [UI]: (
      <div>
        <div style={{ ... }}>
          <span style={{ color: "#3b82f6" }}>Personal Account</span>
        </div>
        {baseAuth}
      </div>
    ),
    auth: baseAuth.auth,
    accountType: "personal",
  };
});
```

### 3. google-auth-work.tsx (NEW)

```typescript
/** Work Google account authentication. #googleAuth #googleAuthWork */
interface Output {
  auth: Auth;
  accountType: "work";
}

const GoogleAuthWork = pattern<Input, Output>(({ auth }) => {
  const baseAuth = GoogleAuth({ auth });

  return {
    [NAME]: "Google Auth (Work)",
    [UI]: (
      <div>
        <div style={{ ... }}>
          <span style={{ color: "#dc2626" }}>Work Account</span>
        </div>
        {baseAuth}
      </div>
    ),
    auth: baseAuth.auth,
    accountType: "work",
  };
});
```

### 4. Gmail Patterns - Account Selection

Update gmail patterns to accept an `accountType` parameter:

```typescript
interface GmailPatternInput {
  // ... existing inputs
  accountType?: Default<"default" | "personal" | "work", "default">;
}

const GmailPattern = pattern<...>(({ accountType, ... }) => {
  // Determine which tag to wish for
  const wishTag = derive(accountType, (type) => {
    switch (type) {
      case "personal": return "#googleAuthPersonal";
      case "work": return "#googleAuthWork";
      default: return "#googleAuth";
    }
  });

  // Wish for the appropriate auth
  // NOTE: wish() may not support reactive tags - see open questions
  const wishResult = wish<GoogleAuthCharm>({ query: wishTag });

  // ... rest of pattern
});
```

## User Flow

### Single Account User (No Change)
1. User creates `google-auth` charm
2. Authenticates with their one account
3. Favorites it
4. Gmail patterns find it via `#googleAuth`

### Multi-Account User
1. User creates `google-auth-personal` charm → authenticates with personal account → favorites
2. User creates `google-auth-work` charm → authenticates with work account → favorites
3. Gmail patterns can now specify which one they want:
   - Default: finds first `#googleAuth` (either one)
   - Personal: finds `#googleAuthPersonal` specifically
   - Work: finds `#googleAuthWork` specifically

### Pattern-Level Selection
When composing a Gmail pattern:
```typescript
// Use default (any authenticated Google account)
const searcher = GmailAgenticSearch({});

// Use personal account specifically
const searcher = GmailAgenticSearch({ accountType: "personal" });

// Use work account specifically
const searcher = GmailAgenticSearch({ accountType: "work" });
```

## Open Questions

1. **Reactive wish queries?** Can `wish()` take a reactive Cell for the query?
   - If YES: Pattern can switch accounts dynamically
   - If NO: Account type must be static at pattern instantiation
   - Need to test this

2. **Fallback behavior?** If user wishes for `#googleAuthWork` but hasn't set one up:
   - Option A: Fall back to `#googleAuth` (any account)
   - Option B: Show error/prompt to set up work account
   - Option C: Configurable per-pattern
   - **Recommendation:** Option A for simplicity

3. **UI for account selection?** Should gmail patterns expose UI to switch accounts?
   - Option A: Static at charm creation time
   - Option B: Dropdown in settings UI to pick account
   - **Recommendation:** Start with A, add B later if needed

4. **Multiple tags work?** Verify that `#googleAuth #googleAuthPersonal` both match:
   - `wish({ query: "#googleAuth" })` should find it
   - `wish({ query: "#googleAuthPersonal" })` should find it
   - Need to test this

5. **Visual differentiation?** How should users distinguish personal vs work auth charms?
   - Color coding (blue=personal, red=work)?
   - Icon/badge?
   - Account email in title?
   - **Recommendation:** Email in title + color indicator

## Alternative Approaches Considered

### A. Single Auth Pattern with Multiple Accounts
One `google-auth` charm stores multiple accounts internally with a selector UI.
- **Pro:** Single charm to manage
- **Con:** Complex internal state, wish can't distinguish accounts

### B. Account Parameter on Auth Pattern
`google-auth` takes an `accountType` input.
- **Pro:** Reuses single pattern
- **Con:** Each deployed charm is still tied to ONE account; doesn't help wish selection

### C. Completely Separate Patterns
`gmail-auth-personal.tsx` and `gmail-auth-work.tsx` that don't compose.
- **Pro:** Simple
- **Con:** Code duplication, harder to maintain

**Selected Approach:** Tagged Auth Variants (compose base + add tags)
- Minimal code duplication
- Tags work with existing wish system
- Clear separation of concerns

## Implementation Plan

1. **Phase 1: Core Infrastructure**
   - [ ] Create `google-auth-personal.tsx`
   - [ ] Create `google-auth-work.tsx`
   - [ ] Test that multiple tags work with wish
   - [ ] Test composition approach

2. **Phase 2: Gmail Pattern Updates**
   - [ ] Add `accountType` input to `gmail-agentic-search.tsx`
   - [ ] Update wish logic to use appropriate tag
   - [ ] Update other gmail patterns (importer, etc.)

3. **Phase 3: Polish**
   - [ ] Add visual differentiation (color, icons)
   - [ ] Add fallback logic
   - [ ] Update documentation/README

## Testing Strategy

1. **Unit Tests**
   - Create personal auth charm, verify `#googleAuthPersonal` tag works
   - Create work auth charm, verify `#googleAuthWork` tag works
   - Verify both also match `#googleAuth`

2. **Integration Tests**
   - Gmail pattern with `accountType: "personal"` finds personal auth
   - Gmail pattern with `accountType: "work"` finds work auth
   - Gmail pattern with `accountType: "default"` finds any auth

3. **User Flow Tests**
   - Multi-account setup and usage
   - Single-account backward compatibility

## Risk Mitigation

1. **Breaking existing users:** The default behavior (`#googleAuth`) is unchanged
2. **Multiple matches:** First match wins (existing behavior)
3. **Cross-space wish:** CT-1090 workaround still needed (embed in JSX)
4. **Self-referential wish:** Avoided by not wishing for auth in auth patterns
