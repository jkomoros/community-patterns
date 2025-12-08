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

**Current State:**
- Handler `googleUpdater` calls async `process()` function
- Manually pushes new emails with `state.emails.push(...result.newEmails)`
- No built-in deduplication (relies on external logic)
- Mixed fetch + state management in handler

**Refactor Plan:**
1. Change `emails` from array to `Record<string, Email>` keyed by email ID
2. Add idempotent computed that syncs fetched emails:
   ```typescript
   computed(() => {
     const result = fetchResult.get();
     if (!result?.emails) return;
     for (const email of result.emails) {
       if (emails.key(email.id).get()) continue;
       emails.key(email.id).set(email);
     }
   });
   ```
3. Keep handler for manual refresh trigger only
4. Update UI to iterate `Object.values(emails.get())`

**Considerations:**
- Need to handle pagination/incremental fetches
- Preserve sorting (by date) in display computed
- Error handling for failed fetches

**Estimated Effort:** 2-3 hours

---

### 2. google-calendar-importer.tsx

**Current State:**
- Similar to gmail-importer
- Handler fetches and manually accumulates calendar events
- No automatic deduplication

**Refactor Plan:**
1. Change `events` from array to `Record<string, CalendarEvent>` keyed by event ID
2. Add idempotent computed for auto-sync
3. Same pattern as gmail-importer

**Considerations:**
- Calendar events have recurring instances - need to handle event IDs properly
- May need composite key (calendarId + eventId)

**Estimated Effort:** 2 hours

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

**Current State:**
- Uses lift with `isInitialized` flag for voter charm storage
- Complex pattern to ensure voter only added once:
  ```typescript
  const storeVoter = lift(..., ({ charm, voterCharms, isInitialized }) => {
    if (!isInitialized.get()) {
      voterCharms.push({ id: randomId, charm, voterName: "(pending)" });
      isInitialized.set(true);
      return charm;
    }
    return undefined;
  });
  ```

**Refactor Plan:**
1. Change `voterCharms` to `Record<string, VoterCharm>` keyed by charm ID or generated ID
2. Replace lift with idempotent computed:
   ```typescript
   computed(() => {
     const charm = currentVoterCharm.get();
     if (!charm) return;
     const charmId = getCharmId(charm);  // derive stable ID from charm
     if (voterCharms.key(charmId).get()) return;
     voterCharms.key(charmId).set({ id: charmId, charm, voterName: "(pending)" });
   });
   ```
3. Remove `isInitialized` flag entirely

**Considerations:**
- Need stable way to identify charm (may need to derive ID from charm properties)
- Simpler code, easier to understand

**Estimated Effort:** 1-2 hours

---

### 5. assumption-surfacer.tsx

**Current State:**
- Handler manages corrections array with manual existence checks
- Two separate state updates: corrections + userContext
- Manual idempotency logic

**Refactor Plan:**
1. Change `corrections` to `Record<string, Correction>` keyed by `${messageIndex}-${assumptionLabel}`
2. Derive `userContext` from corrections (computed, no side effect needed here)
3. Simplify handler to just set the correction key:
   ```typescript
   const handleCorrection = handler<...>((event, { corrections }) => {
     const key = `${event.messageIndex}-${event.assumptionLabel}`;
     corrections.key(key).set({
       messageIndex: event.messageIndex,
       assumptionLabel: event.assumptionLabel,
       originalIndex: event.originalIndex,
       correctedIndex: event.correctedIndex,
     });
   });
   ```
4. No idempotent computed needed - this is user-initiated, handler is correct

**Wait:** This one may not need idempotent computed - it's user-initiated corrections, not auto-accumulation. The improvement is just using object keys instead of array for cleaner updates.

**Considerations:**
- May be more about data structure cleanup than idempotent computed
- Still benefits from Record<K,V> pattern

**Estimated Effort:** 2 hours

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
| gmail-importer | High | Auto-accumulation | 2-3h | TODO |
| google-calendar-importer | High | Auto-accumulation | 2h | TODO |
| meal-orchestrator | High | Auto-initialization | 3-4h | TODO |
| cozy-poll | High | Simplification | 1-2h | TODO |
| assumption-surfacer | High | Data structure | 2h | TODO |
| food-recipe-viewer | Medium | Toggle cleanup | 1h | TODO |
| prompt-injection-tracker | Medium | Pipeline cleanup | 4-6h | TODO |

**Total Estimated Effort:** 15-20 hours

---

## Notes

- Start with gmail-importer as it's the clearest data accumulation case
- cozy-poll is quickest win for code simplification
- Some patterns (assumption-surfacer, food-recipe-viewer) benefit more from Record<K,V> data structure than idempotent computed specifically
- prompt-injection-tracker is largest and should be done last or incrementally

---

## Progress Log

- 2024-12-08: Created this plan after implementing cheeseboard-schedule.tsx as reference
