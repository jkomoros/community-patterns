# DELETE THIS FILE AFTER READING

## Session Context

Working on branch: `cleanup-derive-docs`

Investigating CT-1097 and CT-1098 led to discovering that `createReportTool` in `gmail-agentic-search.tsx` won't work with future sandboxing.

## Key Learnings

### 1. Framework Author Feedback on CT-1097 (derive types)

The derive() "types vs runtime" issue was NOT a bug. Framework author clarified:
- Types show `OpaqueRef<T> & T` which IS basically `T`
- No `.get()` needed - values are directly usable
- Better mental model: `derive()` is like React's `useMemo`
- **Action taken:** Updated folk wisdom and superstitions on branch

### 2. Framework Author Feedback on CT-1098 (self-referential wish)

- Hypothesis: merge produces unstable results (local + wished that includes local)
- The "101 iterations" detection should catch this, but something may bypass it
- Created minimal repro at `patterns/jkomoros/WIP/self-referential-wish-repro.tsx`

### 3. CRITICAL: createReportTool Won't Work with Sandboxing

Framework author said:
> "The createReportTool handler factory won't work as expected once we do proper sandboxing (in particular the passing of functions and then creating handlers by closing over the passed in config)"

The problem is `createReportTool` takes **functions** as config:
```typescript
createReportTool({
  dedupeKey: (input) => `${input.brand}:${input.number}`,  // ❌ Function
  toRecord: (input, id, ts) => ({ ...input, id }),          // ❌ Function
});
```

### 4. The Proper Handler Pattern (from labs tests)

Discovered in `/Users/alex/Code/labs/packages/runner/test/generate-object-tools.test.ts`:

Handler-based tools ARE supported, but with schema-defined signatures:

```typescript
const reportHandler = handler(
  // INPUT SCHEMA - what LLM sends (data, not functions!)
  {
    type: "object",
    properties: {
      hotelBrand: { type: "string" },
      membershipNumber: { type: "string" },
      result: { type: "object", asCell: true },  // For response to LLM
    },
  },
  // STATE SCHEMA - external cells to access
  {
    type: "object",
    properties: {
      memberships: { type: "array", asCell: true },
    },
  },
  // CALLBACK - self-contained, no closures over external functions
  (args, state) => {
    // Mutate external state (incremental - items appear as LLM calls tool)
    const current = state.memberships.get() || [];
    state.memberships.set([...current, {
      id: `membership-${Date.now()}`,
      hotelBrand: args.hotelBrand,
      membershipNumber: args.membershipNumber,
    }]);

    // Return confirmation to LLM
    args.result.set({ success: true });
  },
);

// Bind cell via state parameter, not closure
tools: {
  reportMembership: {
    description: "Report a found membership",
    handler: reportHandler({ memberships }),
  },
}
```

**Key differences from createReportTool:**
- Schemas are DATA (serializable), not functions
- Logic is INLINE in the callback, not passed as config
- Cells bound via STATE PARAMETER, not closure
- Still supports INCREMENTAL results (items appear as LLM calls tool)

## Files That Need Refactoring

1. `patterns/jkomoros/gmail-agentic-search.tsx`
   - Remove `createReportTool` export
   - Document the proper handler pattern for consumers

2. `patterns/jkomoros/hotel-membership-gmail-agent.tsx`
   - Replace `createReportTool` usage with inline handler
   - Move dedup logic into handler callback

3. `patterns/jkomoros/favorite-foods-gmail-agent.tsx`
   - Same refactor as hotel-membership

## Plan

### Phase 1: Document the Pattern (do first)
- Add a superstition or folk wisdom about proper tool handler patterns
- Include the schema-based signature from labs tests
- Warn against factory patterns with function configs

### Phase 2: Refactor hotel-membership-gmail-agent.tsx
1. Remove `createReportTool` import
2. Define `reportMembershipHandler` inline with:
   - Input schema (all membership fields + result cell)
   - State schema (memberships array cell)
   - Inline callback with dedup logic
3. Test deployment

### Phase 3: Refactor favorite-foods-gmail-agent.tsx
- Same pattern as Phase 2

### Phase 4: Update gmail-agentic-search.tsx
- Remove `createReportTool` export
- Add documentation comment about proper handler pattern
- Consider adding a non-function helper if there's a safe abstraction

## Current Branch State

```
cleanup-derive-docs:
  967d023 Add minimal repro for CT-1098 self-referential wish loop
  cd85059 Update derive docs to use useMemo analogy per framework author
```

## Questions to Resolve

1. Should we keep any kind of helper, or just document the pattern?
2. Is there a way to abstract the common parts (id generation, dedup) without functions?
3. Should we file an issue about the undocumented `tools` parameter in LLM.md?

## Files Referenced

- Labs test with proper pattern: `/Users/alex/Code/labs/packages/runner/test/generate-object-tools.test.ts`
- Current problematic code: `patterns/jkomoros/gmail-agentic-search.tsx` (lines 211-253)
- Usage in hotel pattern: `patterns/jkomoros/hotel-membership-gmail-agent.tsx` (lines 147-162)
- Usage in foods pattern: `patterns/jkomoros/favorite-foods-gmail-agent.tsx` (lines 109-123)
