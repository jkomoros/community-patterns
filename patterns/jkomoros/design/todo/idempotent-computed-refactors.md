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

**Decision: Option B - Keep as-is**
- Current implementation works correctly
- Array + Set deduplication aligns with framework preference for arrays over Records with custom keys
- Idempotent computed pattern doesn't fit (needs deletions/updates, not add-only)

**Status:** ✅ **CLOSED** - no changes needed

---

### 2. google-calendar-importer.tsx

**Current State:**
- Similar architecture to gmail-importer
- Handler fetches and accumulates calendar events
- Likely has similar complexity (deletions, updates, incremental sync)

**Analysis:** Same as gmail-importer - likely needs deletions/updates for calendar sync.

**Decision: Option B - Keep as-is** (same reasoning as gmail-importer)
- Array + framework tracking preferred over Records with custom keys
- Calendar sync likely needs deletions/updates like Gmail
- If it works, don't change it

**Status:** ✅ **CLOSED** - no changes needed

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
- **Root cause:** Unknown - possibly key format (hyphen as path separator?), empty Record, or handler context
- **Workaround:** Use spread: `corrections.set({ ...current, [key]: value })`
- **Separate best practice:** Framework author recommends relying on framework ID tracking (arrays + `.map()`) rather than custom keys, for performance reasons
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

**Current State (Analyzed 2024-12-08):**
- 5-level pipeline: Article → Link Extraction → Fetch Content → Classification → Fetch Original → Summary
- Already uses the "dumb map approach" with `.map()` over cell arrays
- Framework caching via `generateObject` and `fetchData` already handles most deduplication
- Manual URL deduplication via `normalizeURL()` + Set in derives
- Uses fixed slots (3 URLs per article) per superstition

**Original Refactor Plan:**
1. Each pipeline level stores results in `Record<string, Result>` keyed by input hash
2. Use idempotent computed at each level

**Analysis: Original Plan May Not Be Needed**

Given framework author guidance:
1. **Framework prefers arrays over Records with custom keys** - The current `.map()` approach is idiomatic
2. **Framework caching already works** - `generateObject` and `fetchData` cache by inputs automatically
3. **Custom keys have issues** - We hit `.key().set()` problems in assumption-surfacer

**What the pattern already does right:**
- ✅ Uses `.map()` over cell arrays (reactive, framework-tracked)
- ✅ `generateObject` cached by prompt+schema+model
- ✅ `fetchData` cached by URL+method+body
- ✅ Deduplication in derives using Set (pure, no side effects)

**Potential small improvements (if any):**
1. **Remove debug logging cruft** - ~100 lines of DEBUG_LOGGING code could be removed
2. **Simplify `readUrls` tracking** - Currently array with indexOf, could be Set-like

**Question for framework author:**
Is there any benefit to changing this pattern? The current architecture already:
- Uses framework caching at every level
- Uses reactive `.map()` over arrays
- Does deduplication in pure derives

The original plan (Records keyed by hash) seems to go against the "prefer framework ID tracking" guidance.

**Decision: Keep as-is**
- Framework author confirmed current architecture is correct
- Already uses idiomatic patterns (map over arrays, framework caching)
- No refactor needed

**Status:** ✅ **CLOSED** - no changes needed

---

## Summary

| Pattern | Priority | Type | Effort | Status |
|---------|----------|------|--------|--------|
| gmail-importer | High | Auto-accumulation | - | ✅ **CLOSED** - keep as-is |
| google-calendar-importer | High | Auto-accumulation | - | ✅ **CLOSED** - keep as-is |
| meal-orchestrator | High | Auto-initialization | 3-4h | TODO |
| cozy-poll | High | Simplification | 1-2h | **DEFERRED** - cleanup done, voter tracking later |
| assumption-surfacer | High | Data structure | 30m | ✅ **DONE** - Record<K,V> refactor |
| food-recipe-viewer | Medium | Toggle cleanup | 1h | TODO |
| prompt-injection-tracker | Medium | Pipeline cleanup | - | ✅ **CLOSED** - keep as-is |

**Remaining Effort:** ~5-7 hours (meal-orchestrator 3-4h, food-recipe-viewer 1h, cozy-poll voter tracking 1-2h)

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
- 2024-12-08: **gmail-importer and google-calendar-importer CLOSED** - Decision: keep as-is. Framework prefers arrays with native tracking over Records with custom keys. These patterns need deletions/updates which don't fit idempotent computed anyway.
- 2024-12-08: **prompt-injection-tracker CLOSED** - Decision: keep as-is. Already uses idiomatic patterns (map over arrays, framework caching for generateObject/fetchData). Framework author confirmed no refactor needed.
