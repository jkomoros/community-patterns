# QA Bug Report: Google Auth Ecosystem (2025-12-19)

## Test Environment
- Branch: `google-auth-component`
- Space: `claude-qa-test-1219-1`
- Patterns tested: google-auth.tsx, gmail-importer.tsx, google-calendar-importer.tsx

---

## Summary

**Working Well:**
- OAuth flow completes successfully
- Auth data populates correctly (email, name, scopes)
- wish() discovery works - gmail-importer and calendar-importer find favorited auth
- Gmail API works (fetched 33 emails)
- Calendar API works (fetched 239 events from 6 calendars)
- Star persistence works across in-session navigation
- Star loads correctly after page refresh (with async delay)

**Bugs Found: 4 confirmed issues**

---

## Bug #1: Granted Scopes Shows $alias JSON on First Render (Transient)

**Severity**: Medium (UI Glitch)

**Steps to Reproduce**:
1. Complete OAuth flow in google-auth.tsx
2. Observe "Granted Scopes" section immediately after auth

**Expected**: List of scope names like "Gmail (read emails)", "Calendar (read events)"

**Actual**: Raw JSON displayed:
```
{"$alias":{"path":["internal","__#17"],"cell":{"/":"baedreig..."}}}
```

**Console Warning**: `unexpected object when value was expected {$alias: Object}`

**Workaround**: Navigate away and back - scopes display correctly on second render

**Root Cause Hypothesis**: The `auth.scope` array is being accessed before the reactive cell has resolved. The first render sees the OpaqueRef/$alias, not the unwrapped value.

---

## Bug #2: Debug JSON Blob Displayed After OAuth (Transient)

**Severity**: High (Security Concern - Exposes Tokens)

**Steps to Reproduce**:
1. Complete OAuth flow in google-auth.tsx
2. Observe "Authentication Result" section

**Expected**: No debug output visible to users

**Actual**: Massive JSON blob displayed including:
- OAuth access token in plain text
- Refresh token
- Full user info
- State parameters

**Workaround**: Navigate away and back - debug output disappears

**Root Cause Hypothesis**: The `ct-google-oauth` component is rendering a result object that should be hidden or only shown in debug mode. After OAuth callback, the component shows the raw response.

**Location**: Likely in the `<ct-google-oauth>` web component implementation

---

## Bug #3: "Favorite this charm" Reminder Shows When Already Favorited

**Severity**: Low (UX Polish)

**Steps to Reproduce**:
1. Authenticate in google-auth.tsx
2. Click star button (changes to ⭐)
3. Observe the green reminder box

**Expected**: Green box should hide when charm is already favorited

**Actual**: Green box "Favorite this charm to share your Google auth..." remains visible

**Location**: `google-auth.tsx` around line 441-456

**Suggested Fix**:
```tsx
{/* Only show reminder if NOT already favorited */}
{auth?.user?.email && !isFavorited && (
  <div style={{ ... }}>
    <strong>Favorite this charm</strong>...
  </div>
)}
```

**Note**: This requires accessing the favorited state, which may need framework support or a workaround.

---

## Bug #4: "Switch" Button Creates Blank Charm

**Severity**: High (Broken Feature)

**Steps to Reproduce**:
1. Open gmail-importer.tsx
2. See auth status showing user with "Switch" and "+ Add" buttons
3. Click "Switch" button

**Expected**: Account picker UI appears allowing user to select different Google account

**Actual**:
- Navigates to new charm ID
- Charm title shows just space name (not a meaningful title)
- Main content area is completely blank
- No UI renders

**Workaround**: None - feature is broken

**Root Cause Hypothesis**: The account picker pattern referenced by `navigateTo()` is not rendering its UI. Possible issues:
1. Pattern compilation error
2. Pattern not returning valid UI
3. Cross-charm render issue

**Location**: Check `google-auth-manager.tsx` `handleSwitch` handler and the picker pattern it creates

---

## Minor Observations

### Transient Loading States
- Star button shows ☆ briefly on page load before favorites sync completes (CT-1126 related)
- This is expected async behavior but may confuse users

### Console Noise
- Many `Cross-Origin-Opener-Policy policy would block the window.closed call` errors during OAuth
- `Unexpected token '<'` errors (likely SSR/hydration related)
- These don't affect functionality

---

## Recommendations

### Immediate Fixes (Pattern-Level)
1. **Bug #3**: Add favorited state check to hide reminder when starred
2. **Bug #4**: Debug the Switch button picker pattern - check if it compiles and renders

### Framework-Level (CT-1126 Related)
1. **Bug #1 & #2**: These transient render bugs are likely related to OpaqueRef unwrapping timing
2. Consider adding a "loading" state for scopes array until resolved

### Testing Note
The core functionality (OAuth, wish() discovery, Gmail/Calendar APIs) all work correctly. The bugs found are primarily UI/UX polish issues and one broken button feature.

---

## Test Commands Used

```bash
# Deploy patterns
./scripts/ct charm new --api-url http://localhost:8000 --identity ./claude.key \
  --space claude-qa-test-1219-1 patterns/jkomoros/google-auth.tsx

./scripts/ct charm new --api-url http://localhost:8000 --identity ./claude.key \
  --space claude-qa-test-1219-1 patterns/jkomoros/gmail-importer.tsx

./scripts/ct charm new --api-url http://localhost:8000 --identity ./claude.key \
  --space claude-qa-test-1219-1 patterns/jkomoros/google-calendar-importer.tsx
```
