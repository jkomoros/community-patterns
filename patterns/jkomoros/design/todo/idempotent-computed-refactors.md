# Idempotent Computed Refactors

Plan to update existing patterns to use the idempotent side effects pattern from `blessed/reactivity.md`.

**Reference Implementation:** `cheeseboard-schedule.tsx` (already updated)

**Key Pattern:**
```typescript
computed(() => {
  const fetched = dataSource.get();
  if (!fetched || fetched.length === 0) return;

  for (const item of fetched) {
    const key = item.id;  // deterministic key
    if (accumulator.key(key).get()) continue;  // idempotency check
    accumulator.key(key).set({ ...item, addedAt: new Date().toISOString() });
  }
});
```

---

## High Priority

### 1. gmail-importer.tsx

**Current State (Analyzed 2024-12-08):**
- Handler `googleUpdater` calls async `process()` function
- `process()` already handles deduplication via `existingEmailIds` Set
- Also handles **deletions** (`result.deletedEmailIds`) and **label updates**
- Uses Gmail History API for incremental sync via `historyId`

**Analysis: Idempotent Computed May Not Fit Well**

The simple idempotent computed pattern (add-only accumulation) doesn't work here because:
1. **Deletions required** - Gmail sync removes deleted emails, not just adds
2. **Label updates** - Existing emails get labels modified in place
3. **Deduplication already works** - `process()` filters via `existingEmailIds`

**Revised Refactor Options:**

**Option A: Record<K,V> data structure only** (simpler)
- Change `emails` from array to `Record<string, Email>`
- Handler updates become: `emails.key(id).set(email)` or `emails.key(id).set(undefined)`
- Naturally idempotent for additions (setting same key twice is fine)
- UI uses `Object.values(emails.get())` with a sort computed
- Keep existing `process()` logic largely intact

**Option B: Keep as-is** (if it ain't broke...)
- Current architecture handles all edge cases correctly
- Array with Set-based deduplication works fine
- Only change if we need key-based access elsewhere

**Considerations:**
- Option A gives cleaner key-based updates but requires UI changes
- Gmail-specific: historyId sync, deletions, label changes add complexity
- The async `process()` function does most of the heavy lifting

**Status:** Needs decision - simpler than originally thought, but also less clear benefit
**Estimated Effort:** 1-2 hours (Option A) or skip (Option B)

---

### 2. google-calendar-importer.tsx

**Current State:**
- Similar architecture to gmail-importer
- Handler fetches and accumulates calendar events
- Likely has similar complexity (deletions, updates, incremental sync)

**Analysis:** Same as gmail-importer - needs investigation to see if it handles deletions/updates.

**Refactor Options:** Same as gmail-importer
- Option A: Record<K,V> data structure for cleaner key-based access
- Option B: Keep as-is if working correctly

**Considerations:**
- Calendar events have recurring instances - need to handle event IDs properly
- May need composite key (calendarId + eventId)
- Check if calendar API has history/sync features like Gmail

**Status:** Needs investigation (likely same conclusion as gmail-importer)
**Estimated Effort:** 1-2 hours if Option A, skip if Option B

---

### 3. meal-orchestrator.tsx

**Current State:**
- Multiple "add" handlers: `addOven`, `addDietaryProfile`, `addPreparedFood`, etc.
- Each handler does `array.push({ ...defaults })`
- User must click buttons to initialize

**Refactor Plan:**
1. Add idempotent computed to auto-initialize from inputs:
   ```typescript
   computed(() => {
     const count = guestCount.get();
     // Ensure we have at least one oven
     if (Object.keys(ovens.get()).length === 0) {
       ovens.key('default').set({ rackPositions: 5, physicalRacks: 2 });
     }
     // Auto-create dietary profiles for guest count
     // ... etc
   });
   ```
2. Keep handlers for user-initiated additions (not auto-initialization)
3. Consider: Should arrays become objects with generated keys?

**Considerations:**
- More complex because it's initialization logic, not data accumulation
- May want to keep arrays for ordered collections (recipes in order matter)
- Balance between auto-init and user control

**Estimated Effort:** 3-4 hours

---

### 4. cozy-poll.tsx

**Current State (Updated 2024-12-08):**
- ✅ **CLEANED UP**: Removed deprecated `storeVoter` lift and `createVoter` handler
- The `voterCharms` array still exists but is **largely vestigial**:
  - Passed from cozy-poll → cozy-poll-lobby → cozy-poll-ballot
  - But `cozy-poll-ballot` receives it without using it
  - The Lobby's `createBallot` handler creates ballots but doesn't store them in `voterCharms`

**Refactor Options:**

**Option A: Remove voterCharms entirely** (simpler)
- Since voterCharms isn't being used for anything, just remove it
- Clean up the types and remove passing it through the component chain
- Estimated effort: 30 minutes

**Option B: Implement proper voter tracking** (if feature is wanted)
1. Change `voterCharms` to `Record<string, VoterCharm>` keyed by charm ID
2. In Lobby's `createBallot`, store the ballot reference:
   ```typescript
   // Generate a stable ID for this ballot
   const ballotId = Math.random().toString(36).substring(2, 10);
   voterCharms.key(ballotId).set({
     id: ballotId,
     charm: voterInstance,
     voterName: "(pending)",
   });
   ```
3. Optionally sync voter name from ballot back to voterCharms (would need additional wiring)

**Considerations:**
- Option A is cleaner if voter tracking isn't needed
- Option B would enable features like "see who's participating" in admin view
- Currently the pattern works fine without either

**Decision:** Option B (implement proper voter tracking) - deferred for later.

**Status:** Deprecated code removed. Voter tracking deferred.
**Estimated Effort:** 1-2 hours remaining

---

### 5. assumption-surfacer.tsx

**Current State (Refactored 2024-12-08):**
- ✅ Changed `corrections` from `Correction[]` to `Record<string, Correction>`
- ✅ Updated handlers to use `corrections.key(key).set()` - much simpler!
- ✅ Updated reading code to use direct key lookup instead of `.find()`

**What Changed:**

Before (array with manual manipulation):
```typescript
const existingIdx = currentCorrections.findIndex(
  c => c.messageIndex === messageIndex && c.assumptionLabel === assumptionLabel
);
if (existingIdx >= 0) {
  const updated = [...currentCorrections];
  updated[existingIdx] = { ... };
  corrections.set(updated);
} else {
  corrections.set([...currentCorrections, { ... }]);
}
```

After (key-based access):
```typescript
const key = `${messageIndex}-${assumptionLabel}`;
corrections.key(key).set({ messageIndex, assumptionLabel, originalIndex, correctedIndex: newIndex });
```

**Note:** This pattern doesn't use idempotent computed - it's user-initiated corrections via handlers. The improvement is purely data structure (Record<K,V> vs array).

**Framework Workaround Required:**
- `.key(key).set()` threw errors when creating new keys on Record in handler context
- Error: `Value at path value/argument/corrections/0-Technical_Expertise is not an object`
- **Root cause (per framework author):** Framework expects to manage its own key/ID space. Custom composite keys like `"0-Technical_Expertise"` conflict with path resolution (hyphen interpreted as path separator).
- **Workaround:** Use spread: `corrections.set({ ...current, [key]: value })`
- **Better approach:** Use arrays with framework tracking, or keys from data itself (like `pizza.date`)
- **Superstition filed:** `community-docs/superstitions/2025-12-08-record-key-set-handler-workaround.md`

**Status:** ✅ **DONE** (tested with Playwright)
**Estimated Effort:** Was 2 hours, took ~30 minutes (including testing/debugging)

---

## Medium Priority

### 6. food-recipe-viewer.tsx

**Current State:**
- Toggle handlers with manual existence checks
- Two code paths for add vs remove

**Refactor Plan:**
1. Change `completedSteps` to `Record<string, CompletedStep>` keyed by `${groupId}-${stepIndex}`
2. Simplify toggle handler:
   ```typescript
   const toggleStep = handler<...>((_, { completedSteps, groupId, stepIndex }) => {
     const key = `${groupId}-${stepIndex}`;
     if (completedSteps.key(key).get()) {
       completedSteps.key(key).set(undefined);  // remove
     } else {
       completedSteps.key(key).set({ groupId, stepIndex, completed: true });
     }
   });
   ```

**Considerations:**
- This is user-initiated toggle, not auto-accumulation
- Improvement is cleaner toggle logic with object keys

**Estimated Effort:** 1 hour

---

### 7. prompt-injection-tracker.tsx

**Current State:**
- Multi-level pipeline with manual caching awareness
- Deduplication logic spread across pipeline

**Refactor Plan:**
1. Each pipeline level stores results in `Record<string, Result>` keyed by input hash
2. Use idempotent computed at each level:
   - URL extraction results keyed by URL
   - Fetch results keyed by URL
   - Classification results keyed by content hash
3. Framework handles caching, we handle deduplication

**Considerations:**
- Most complex refactor
- Need to carefully preserve pipeline semantics
- May benefit from incremental approach (one level at a time)

**Estimated Effort:** 4-6 hours

---

## Summary

| Pattern | Priority | Type | Effort | Status |
|---------|----------|------|--------|--------|
| gmail-importer | High | Auto-accumulation | 1-2h | **ANALYZED** - idempotent computed doesn't fit |
| google-calendar-importer | High | Auto-accumulation | 1-2h | Needs investigation (likely same as gmail) |
| meal-orchestrator | High | Auto-initialization | 3-4h | TODO |
| cozy-poll | High | Simplification | 1-2h | **DEFERRED** - cleanup done, voter tracking later |
| assumption-surfacer | High | Data structure | 15m | ✅ **DONE** - Record<K,V> refactor |
| food-recipe-viewer | Medium | Toggle cleanup | 1h | TODO |
| prompt-injection-tracker | Medium | Pipeline cleanup | 4-6h | TODO |

**Total Estimated Effort:** 15-20 hours

---

## Notes

- Start with gmail-importer as it's the clearest data accumulation case
- ~~cozy-poll is quickest win for code simplification~~ **DONE (partial)** - deprecated code removed
- Some patterns (assumption-surfacer, food-recipe-viewer) benefit more from Record<K,V> data structure than idempotent computed specifically
- prompt-injection-tracker is largest and should be done last or incrementally

---

## Progress Log

- 2024-12-08: Created this plan after implementing cheeseboard-schedule.tsx as reference
- 2024-12-08: **cozy-poll.tsx cleanup** - Removed deprecated `storeVoter` lift and `createVoter` handler. These were unused since the Lobby pattern handles ballot creation. The `voterCharms` array is now identified as vestigial (passed but unused). Updated plan with Option A (remove) vs Option B (implement properly).
- 2024-12-08: **gmail-importer.tsx analysis** - The simple idempotent computed pattern doesn't fit because Gmail sync needs to handle deletions, label updates, and incremental historyId sync. Deduplication already works via Set. Options: (A) change to Record<K,V> for cleaner updates, or (B) keep as-is.
- 2024-12-08: **assumption-surfacer.tsx refactored** - Changed `corrections` from array to `Record<string, Correction>`. Simplified handlers from 15+ lines of findIndex/push logic to single `corrections.key(key).set()` calls. Direct key lookup in reading code.
