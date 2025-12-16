# Self-Referential Wish Causes Infinite Loop

**SUPERSTITION** - Single observation, unverified. Use with skepticism!

## Topic

Using `wish()` in a pattern that exports data matching the wish query

## Problem

When a pattern uses `wish("#someQuery")` to find other charms with matching data, but the pattern **itself** exports data that would match that query, it creates a **self-referential wish loop** that causes:

- 100% CPU usage (Deno process maxes out)
- Deployment hangs indefinitely
- Browser becomes unresponsive
- No error messages (silent infinite loop)
- Must kill Deno process manually to recover

### What Didn't Work

```typescript
// Pattern exports hotel memberships
export default recipe(HotelMembershipExtractorSchema, ({ memberships }) => {
  // This pattern exports `memberships` which will be tagged with #hotelMemberships

  // ❌ PROBLEM: Wishing for the same type of data this pattern exports!
  const wishedMembershipsCharm = wish<HotelMembershipOutput>({
    query: "#hotelMemberships"  // Will match THIS pattern's output!
  });

  // The wish resolves to THIS charm, which triggers re-evaluation,
  // which wishes again, which resolves to THIS charm... infinite loop

  const wishedMemberships = computed(() => wishedMembershipsCharm);
  const allMemberships = computed(() => [memberships, wishedMemberships]);

  return { memberships, allMemberships, /* ... */ };
});
```

**Symptoms:**
- `charm new` command hangs forever
- Deno process jumps to 100% CPU
- No console errors or warnings
- No telemetry events in debugger
- Browser tab becomes unresponsive
- Other patterns in same space may also be affected

### Why This Happens (Hypothesis) - UNCERTAIN

**Important:** The original `hotel-membership-extractor.tsx` on main has the **exact same self-referential wish** (line 333) and worked fine for months. So self-referential wish alone doesn't explain the infinite loop.

**Possible contributing factors:**

1. **Pattern composition** - The new pattern composes `GmailAgenticSearch`, creating a nested reactive graph that may interact poorly with wish
2. **Existing charms in space** - If there are already charms matching `#hotelMemberships` in the space, the reactive graph may differ
3. **Framework changes** - Something may have changed in the reactive system
4. **Timing/ordering** - The composed pattern's initialization may trigger wish evaluation at a problematic time

**Original hypothesis (may be incomplete):**
1. Pattern A exports `memberships` data
2. Pattern A's `wish("#hotelMemberships")` query matches Pattern A's own export
3. Wish resolves, returning Pattern A's charm
4. This triggers reactive re-evaluation of Pattern A
5. Pattern A wishes again...
6. Infinite loop with no termination condition

**Key mystery:** Why did the standalone pattern work but the composed pattern didn't?

## Solution That Worked

**Option 1: Don't wish for data you export**

The simplest fix is to not use wish for the same data type you're producing:

```typescript
// ✅ Only use local memberships, no wish
export default recipe(HotelMembershipExtractorSchema, ({ memberships }) => {
  // Don't wish for #hotelMemberships since we export memberships

  return { memberships, /* ... */ };
});
```

**Option 2: Use a different query tag**

If you need to aggregate memberships from OTHER patterns:

```typescript
// ✅ Wish for a DIFFERENT tag that won't match this pattern
const otherMemberships = wish<OtherMembershipType>({
  query: "#externalMemberships"  // Different from what we export
});
```

**Option 3: Filter out self in the wish result (untested)**

Hypothetically, you could filter out your own charm from wish results, but this hasn't been tested:

```typescript
// ⚠️ UNTESTED - may not work
const wishedCharms = wish<HotelMembershipOutput>({ query: "#hotelMemberships" });
const otherCharms = computed(() =>
  wishedCharms?.filter(c => c.id !== currentCharmId)  // How to get currentCharmId?
);
```

## Detection

If you encounter these symptoms:
- Deployment hangs with 100% CPU
- No error messages
- Pattern works when wish is removed

Check for self-referential wishes:
1. What does your pattern export? (check schema and return value)
2. What tags does your export match? (usually based on type name)
3. Does any `wish()` query match those tags?

## Context

- **Pattern:** hotel-membership-gmail-agent.tsx
- **Composed pattern:** gmail-agentic-search.tsx
- **Use case:** Wanted to aggregate memberships from multiple sources
- **Exported data:** `memberships` array (matches #hotelMemberships)
- **Wish query:** `wish<HotelMembershipOutput>({ query: "#hotelMemberships" })`
- **Result:** Self-referential loop, 100% CPU, deployment hung

## Related

- **Folk Wisdom: onclick-handlers-conditional-rendering.md** - Other reactive loop issues
- **Superstition: avoid-composed-pattern-cells-in-derives.md** - Pattern composition issues
- **Issue: ISSUE-Self-Referential-Wish-Loop.md** - Filed framework issue

## Metadata

```yaml
topic: wish, infinite-loop, self-reference, deployment, cpu
discovered: 2025-12-04
confirmed_count: 2
last_confirmed: 2025-12-04
sessions: [hotel-membership-migration-check-recent, person-research-gmail-agent]
related_functions: wish
status: superstition
stars: ⭐⭐⭐
```

## Guestbook

- 2025-12-04 - hotel-membership-gmail-agent pattern. Added `wish("#hotelMemberships")` to aggregate memberships from other charms. Pattern exports `memberships` which matches that query. Deployment hung with 100% CPU, no errors. Had to kill Deno process multiple times. Fix: removed all wish-related code. Pattern deployed immediately after. **BUT:** The original standalone hotel-membership-extractor.tsx has the exact same self-referential wish and worked fine! The key difference may be pattern composition - the new pattern composes GmailAgenticSearch. This superstition needs more investigation. (hotel-membership-migration-check-recent)

- 2025-12-04 - person-research-gmail-agent pattern. Used `wish("#person")` to let user select a Person charm to research. Got "Too many iterations: 101" error during deployment. Pattern also composes GmailAgenticSearch. This is NOT a self-referential wish (pattern doesn't export #person data), but the reactive loop still occurred. Fix: removed all wish-related code. Pattern deployed immediately after. This adds evidence that wish + pattern composition may be the issue, not just self-referential wishes. (person-research-gmail-agent)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
