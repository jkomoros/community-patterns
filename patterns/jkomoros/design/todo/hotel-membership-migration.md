# Hotel Membership Extractor Migration

Migrate features from the old `hotel-membership-extractor.tsx` to either:
- `gmail-agentic-search.tsx` (base pattern - for general features)
- `hotel-membership-gmail-agent.tsx` (hotel-specific features)

## Features to Migrate

### Base Pattern (gmail-agentic-search.tsx)

- [x] **1. Direct auth input (CT-1085 workaround)** - Accept auth as direct input for when wish doesn't work
  - Status: DONE (commit b97831e)
  - Notes: Added `auth` input prop, `authSource` output, shows "(linked)" vs "(shared)" in UI

- [x] **2. Auth error detection (401)** - Already in base pattern
  - Status: DONE - already exists in base (hasAuthError, authErrorMessage)

- [x] **3. CT-1090 workaround** - Already in base pattern
  - Status: DONE - line 876 embeds wishResult in hidden div

- [x] **4. Detailed progress UI** - Already in base pattern
  - Status: DONE - progressUI shows current query and completed searches

- [x] **5. "Recent" scan mode (last 7 days)** - Added to hotel pattern
  - Status: DONE (in hotel-membership-gmail-agent.tsx)
  - Notes: "Check Recent" button searches last 7 days, focuses on brands not yet found

### Hotel-Specific (hotel-membership-gmail-agent.tsx)

- [x] **6. Wish import from other charms** - Merge memberships from other extractors
  - Status: DONE (commit 84046e5)
  - Notes: Uses `wish("#hotelMemberships")` to get memberships from other charms

- [x] **7. Multi-account detection** - Warn when same brand has multiple numbers
  - Status: DONE (commit 84046e5)
  - Notes: Shows warning UI with details about multiple accounts

- [ ] **8. Scan mode selector UI** - Quick/Normal/Full modes
  - Status: SKIPPED - Debug feature, lower priority
  - Notes: Already has maxSearches input, users can change it

## Progress Log

- 2025-12-03: Created TODO, analyzed both files
- 2025-12-03: Features 2, 3, 4 already exist in base pattern
- 2025-12-03: Added direct auth input to base pattern (commit b97831e)
- 2025-12-03: Added wish import and multi-account detection to hotel pattern (commit 84046e5)
- 2025-12-03: Fixed authSource type annotation (commit 297ab93)
- 2025-12-03: Tested in Playwright - all features working
- 2025-12-03: Ready to remove old hotel-membership-extractor.tsx
- 2025-12-03: Added "Check Recent" scan mode to hotel pattern

## Migration Complete

All critical features have been migrated. The old `hotel-membership-extractor.tsx` can be deleted.
