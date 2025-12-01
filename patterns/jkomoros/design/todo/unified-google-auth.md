# Unified Google Auth Pattern

## Status: Implemented

## Problem

Currently there are separate auth patterns for each Google service:
- `gmail-auth.tsx` - requests `gmail.readonly` scope, tag `#googleAuth`
- `google-calendar-auth.tsx` - requests `calendar.readonly` scope, tag `#googleCalendarAuth`

This causes:
1. **Multiple OAuth flows** - users authenticate separately for each service
2. **Multiple charms to favorite** - need to favorite each auth pattern separately
3. **Different wish tags** - importers can't share auth (`#googleAuth` vs `#googleCalendarAuth`)
4. **Code duplication** - both auth patterns are nearly identical

## Proposed Solution

Create a single `google-auth.tsx` pattern with configurable scopes via checkboxes.

### User Experience

```
┌─────────────────────────────────────────────┐
│ Google Authentication                       │
│                                             │
│ Status: ✅ Authenticated                    │
│ Email: alex@common.tools                    │
│ Name: Alex Komoroske                        │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Permissions                             │ │
│ │                                         │ │
│ │ ☑️ Gmail (read emails)                  │ │
│ │ ☑️ Calendar (read events)               │ │
│ │ ☐ Drive (read files)                    │ │
│ │ ☐ Contacts (read contacts)              │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Sign in with Google]  [Sign Out]           │
│                                             │
│ ⭐ Favorite this charm to share auth        │
│ across all your Google patterns!            │
└─────────────────────────────────────────────┘
```

### Technical Design

**Input Schema:**
```typescript
interface Input {
  selectedScopes: Default<{
    gmail: boolean;
    calendar: boolean;
    drive: boolean;
    contacts: boolean;
  }, {
    gmail: false;
    calendar: false;
    drive: false;
    contacts: false;
  }>;
  auth: Default<Auth, { /* empty defaults */ }>;
}
```

**Scope Mapping:**
```typescript
const SCOPE_MAP = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  drive: "https://www.googleapis.com/auth/drive.readonly",
  contacts: "https://www.googleapis.com/auth/contacts.readonly",
};
```

**Dynamic Scope Construction:**
```typescript
const scopes = derive(selectedScopes, (selected) => {
  const base = ["email", "profile"];
  Object.entries(selected).forEach(([key, enabled]) => {
    if (enabled && SCOPE_MAP[key]) {
      base.push(SCOPE_MAP[key]);
    }
  });
  return base;
});
```

**Single Wish Tag:**
```typescript
/** Google OAuth authentication for Google APIs. #googleAuth */
interface Output {
  auth: Auth;
  scopes: string[];  // Expose granted scopes for importers to check
}
```

### Importer Changes

Importers would check if required scope is present:

```typescript
// In calendar-importer.tsx
const authCharm = wish<GoogleAuthCharm>("#googleAuth");

const hasCalendarScope = derive(authCharm, (charm) =>
  charm?.scopes?.includes("https://www.googleapis.com/auth/calendar.readonly")
);

// Show warning if scope not granted
{!hasCalendarScope && (
  <div style={{ color: "orange" }}>
    Calendar permission not granted. Please enable Calendar in your Google Auth charm.
  </div>
)}
```

## Migration Path

1. **Phase 1: Create unified pattern**
   - Create `google-auth.tsx` with scope checkboxes
   - Keep existing `gmail-auth.tsx` and `google-calendar-auth.tsx` working
   - Both old tags still work

2. **Phase 2: Update importers**
   - Update `gmail-importer.tsx` to wish for `#googleAuth`
   - Update `google-calendar-importer.tsx` to wish for `#googleAuth`
   - Add scope checking/warnings

3. **Phase 3: Deprecate old patterns**
   - Mark `gmail-auth.tsx` and `google-calendar-auth.tsx` as deprecated
   - Add redirect notice pointing to unified pattern
   - Eventually remove

## Open Questions

1. **Re-authentication for new scopes**: If user adds a new scope checkbox, do they need to re-authenticate? (Likely yes - Google requires new consent for additional scopes)

2. **Scope visualization**: Should we show which scopes are actually granted vs requested? (Token may have different scopes than requested if user denied some)

3. **Incremental authorization**: Google supports adding scopes incrementally without revoking existing token. Should we support this? (Would require backend changes)

4. **Drive/Contacts**: Include these now or wait until there are importers that need them?

## Estimated Effort

- **Unified auth pattern**: 1-2 hours
- **Update importers**: 30 min each
- **Testing**: 1 hour
- **Total**: ~4 hours

## Dependencies

- None - uses existing `<ct-google-oauth>` component
- Backend already supports arbitrary scopes

## Success Criteria

- [x] Single auth pattern with scope checkboxes
- [x] Both Gmail and Calendar importers work with single favorited auth
- [x] Clear UI showing which permissions are enabled
- [x] Graceful handling when required scope not granted

## Implementation Notes (2024)

Created `google-auth.tsx` as the unified auth pattern with:
- Checkboxes for Gmail, Calendar, Drive, and Contacts scopes
- Dynamic scope construction based on selections
- Re-auth detection when new scopes are added
- Display of granted scopes after authentication

Updated importers to check for required scopes:
- `gmail-importer.tsx` - checks for Gmail scope, shows warning if missing
- `WIP/google-calendar-importer.tsx` - now uses `#googleAuth`, checks for Calendar scope
- `hotel-membership-extractor.tsx` - checks for Gmail scope

Deprecated old auth patterns:
- `gmail-auth.tsx` - marked deprecated with UI notice
- `WIP/google-calendar-auth.tsx` - marked deprecated with UI notice
