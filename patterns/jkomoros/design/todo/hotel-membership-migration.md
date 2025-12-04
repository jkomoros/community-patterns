# Hotel Membership Extractor Migration

Migrate features from the old `hotel-membership-extractor.tsx` to either:
- `gmail-agentic-search.tsx` (base pattern - for general features)
- `hotel-membership-gmail-agent.tsx` (hotel-specific features)

## Features to Migrate

### Base Pattern (gmail-agentic-search.tsx)

- [ ] **1. Direct auth input (CT-1085 workaround)** - Accept auth as direct input for when wish doesn't work
  - Status: Not started
  - Location in old: lines 74-82, 269-326
  - Notes: Allows users to manually link auth when favorites don't persist

- [x] **2. Auth error detection (401)** - Already in base pattern
  - Status: DONE - already exists in base (hasAuthError, authErrorMessage)

- [x] **3. CT-1090 workaround** - Already in base pattern
  - Status: DONE - line 876 embeds wishResult in hidden div

- [x] **4. Detailed progress UI** - Already in base pattern
  - Status: DONE - progressUI shows current query and completed searches

- [ ] **5. "Recent" scan mode (last 7 days)** - Could be useful for base pattern
  - Status: Not started
  - Location in old: lines 506-514, 517-587
  - Notes: Allows quick scans of just recent emails

### Hotel-Specific (hotel-membership-gmail-agent.tsx)

- [ ] **6. Wish import from other charms** - Merge memberships from other extractors
  - Status: Not started
  - Location in old: lines 331-367
  - Notes: Uses `wish("#hotelMemberships")` to get memberships from other charms

- [ ] **7. Multi-account detection** - Warn when same brand has multiple numbers
  - Status: Not started
  - Location in old: lines 852-872, 1159-1196
  - Notes: Nice-to-have UI feature

- [ ] **8. Scan mode selector UI** - Quick/Normal/Full modes
  - Status: Not started
  - Location in old: lines 765-771, 1255-1289
  - Notes: Debug UI feature, lower priority

## Progress Log

- 2025-12-03: Created TODO, analyzed both files
- Features 2, 3, 4 already exist in base pattern

## Next Steps

1. Start with Direct auth input (#1) - most impactful for usability
2. Then Wish import (#6) - hotel-specific
3. Then Multi-account detection (#7) - hotel-specific
4. Consider "Recent" scan mode (#5) for base pattern
5. Scan mode selector (#8) - low priority
