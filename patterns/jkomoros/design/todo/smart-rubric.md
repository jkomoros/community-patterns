# Smart Rubric TODO

## Pattern Overview
A decision-making tool that helps users create rubrics for comparing multiple options across various dimensions. When the calculated ranking doesn't match user intuition, LLM helps identify missing dimensions or adjust weights.

## Current Status: Phase 5 Complete

**Completed Phases:**
- ✅ Phase 1: Data Model Validation - Dynamic dimension architecture works
- ✅ Phase 2: Core UI - Two-pane layout with selection
- ✅ Phase 3: Dynamic Value Editing - Numeric + categorical dimension editing
- ✅ Phase 4: Manual Ranking - Up/down buttons with boxing pattern
- ✅ Phase 5: LLM Quick Add - Extract dimension values from descriptions

## Remaining Work

### Phase 6: LLM - Optimize Weights
- [ ] "Optimize to Match Manual" button
- [ ] Collect current state: dimensions, options, manual ranks, calculated scores
- [ ] LLM suggests weight adjustments
- [ ] Display suggestions with rationale
- [ ] User can accept/reject

**LLM Prompt Strategy:**
```
The user manually ranked options differently than calculated scores suggest.
Manual ranking: A > B > C
Calculated: B > A > C (based on current weights)

Suggest weight adjustments to match manual ranking.
OR suggest a missing dimension if weights alone can't explain the gap.
```

### Phase 7: LLM - Suggest Missing Dimensions
- [ ] "Suggest Missing Dimension" button
- [ ] LLM analyzes all options and current dimensions
- [ ] Identifies potential gaps (e.g., "commute time" if comparing apartments)
- [ ] Proposes dimension with name, type, rationale, and initial values
- [ ] User can accept (adds dimension + values) or reject

### Phase 8: Polish & Testing
- [ ] Mobile-responsive layout
- [ ] Loading states for LLM calls
- [ ] Error handling
- [ ] Empty states (no options, no dimensions)
- [ ] Delete confirmations
- [ ] Visual polish (icons, colors, spacing)

## Key Technical Patterns Discovered

### Handler Parameter Pattern
Pass Cells as handler parameters, not closure variables - Cells captured from closure in `.map()` or `derive()` contexts get unwrapped.

```typescript
// ✅ DO: Pass Cell as handler parameter
const selectOption = handler<unknown, { optionCell: Cell<RubricOption>, selectionCell: Cell<SelectionState> }>(
  (_, { optionCell, selectionCell }) => {
    selectionCell.set({ value: optionCell.get().name });
  }
);

{options.map((option) => (
  <div onClick={selectOption({ optionCell: option, selectionCell: selection })}>
))}
```

### Boxing Pattern with .equals()
Framework auto-boxes array items. Use `.equals()` instance method for Cell comparison:

```typescript
const index = opts.findIndex(opt => opt.equals(optionCell));
```

### Handlers Outside Derive
Buttons with handlers that write to Cells must be OUTSIDE `derive()` blocks to avoid ReadOnlyAddressError.

## File Location
`patterns/jkomoros/WIP/smart-rubric.tsx`
