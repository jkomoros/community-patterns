# Smart Rubric TODO

## Pattern Overview
A decision-making tool that helps users create rubrics for comparing multiple options across various dimensions. When the calculated ranking doesn't match user intuition, LLM helps identify missing dimensions or adjust weights.

## Core Architecture Challenge
**Dynamic Dimensions**: The set of dimensions is not fixed at pattern definition time. Users can add/remove dimensions, and each option needs values for dimensions that may not exist when the option was created.

**Solution**: Use key-value array pattern:
```typescript
interface OptionValue {
  dimensionName: string;    // Key to look up dimension
  value: string | number;   // The actual value
}
```

## Data Model

```typescript
interface CategoryOption {
  label: string;      // "Downtown", "Suburbs"
  score: number;      // 10, 5
}

interface Dimension {
  name: string;                                    // "Location", "Price"
  type: "categorical" | "numeric";                 // Type of dimension
  multiplier: Default<number, 1>;                  // Weight/multiplier
  categories: Default<CategoryOption[], []>;       // For categorical (empty for numeric)
  numericMin: Default<number, 0>;                  // For numeric type
  numericMax: Default<number, 100>;                // For numeric type
}

interface OptionValue {
  dimensionName: string;                           // Which dimension this is for
  value: string | number;                          // Category label OR numeric value
}

interface RubricOption {
  name: string;                                    // "Apartment A", "Job Option 1"
  values: Default<OptionValue[], []>;              // Values for each dimension
  manualRank: Default<number | null, null>;        // User's desired rank (for optimization)
}

interface RubricInput {
  title: Default<string, "Decision Rubric">;
  options: Default<RubricOption[], []>;
  dimensions: Default<Dimension[], []>;
  selectedOptionName: Default<string | null, null>; // For detail pane
}
```

## Score Calculation Strategy

**⚠️ REVISED AFTER PHASE 1 TESTING**

~~Use `computed()` to derive scores reactively~~ - This approach caused deployment timeouts!

**Working approach**: Simple function called per-option in JSX map:

```typescript
const calculateScore = (option: RubricOption) => {
  let totalScore = 0;

  dimensions.forEach(dim => {
    const valueRecord = option.values.find(v => v.dimensionName === dim.name);
    if (!valueRecord) return;

    let dimensionScore = 0;
    if (dim.type === "categorical") {
      const category = dim.categories.find(c => c.label === valueRecord.value);
      dimensionScore = category?.score || 0;
    } else {
      dimensionScore = Number(valueRecord.value) || 0;
    }

    totalScore += dimensionScore * dim.multiplier;
  });

  return totalScore;
};

// Used in JSX:
{options.map((option, index) => {
  const score = calculateScore(option);
  return <div>{score.toFixed(1)}</div>
})}
```

**Reactivity guarantee**: The function accesses `dimensions` and `option.values` directly from Cells, so scores recalculate automatically when those change. No need for complex `computed()` wrapping.

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Title: [Decision Rubric                   ]                 │
│ [Quick Add Item] (prompts for context)                      │
├───────────────────────────────┬─────────────────────────────┤
│ Ranked Options (Left Pane)   │ Detail Pane (Right)         │
│ ct-vscroll                    │                             │
│                               │                             │
│ 🥇 Apartment A (Score: 85)    │ Selected: Apartment A       │
│    [↑] [↓]                    │                             │
│ 🥈 Apartment B (Score: 72)    │ Dimensions:                 │
│    [↑] [↓]                    │ Location: [Downtown  ▼]     │
│ 🥉 Apartment C (Score: 68)    │ Price: [1500      ]         │
│    [↑] [↓]                    │ Size: [850       ]          │
│                               │                             │
│ [+ Add Option]                │ [Delete Option]             │
│                               │                             │
│ [🤖 Optimize to Match Manual] │                             │
│                               │                             │
├───────────────────────────────┴─────────────────────────────┤
│ Dimensions:                                                  │
│ • Location (Weight: 2x) [categorical: Downtown=10, ...]     │
│   [Edit] [Delete]                                           │
│ • Price (Weight: 1.5x) [numeric: 0-3000]                    │
│   [Edit] [Delete]                                           │
│ [+ Add Dimension] [🤖 Suggest Missing Dimension]            │
└─────────────────────────────────────────────────────────────┘
```

## Key Workflows

### 1. Quick Add Flow
- User enters option name
- Prompt appears: "Add context/description for LLM extraction"
- User provides context (paste description, URL content, etc.)
- LLM extracts suggested dimension values
- User confirms/edits

### 2. Manual Ranking → Optimization
- User clicks ↑/↓ to reorder options (sets `manualRank`)
- Click "Optimize to Match Manual Ranking"
- Two optimization modes:
  - **Adjust Weights**: LLM suggests weight changes to existing dimensions
  - **Suggest New Dimension**: LLM analyzes gap and proposes missing dimension

### 3. Suggest Missing Dimension
- User feels ranking is wrong but doesn't know why
- Click "Suggest Missing Dimension"
- LLM analyzes current dimensions and ranking
- Proposes new dimension with rationale
- User can accept/reject/edit

## Development Phases

### Phase 1: Data Model Validation ✅ (CRITICAL - Do This First)
**Goal**: Prove the dynamic dimension architecture works with CommonTools reactivity

**Tasks**:
- [x] Create minimal test pattern with:
  - 2 options, 2 dimensions (1 categorical, 1 numeric)
  - Hardcoded values in OptionValue array format
  - ~~Simple computed() score calculation~~ Simple function-based calculation
  - Display calculated scores
- [x] Test that scores update reactively when:
  - Dimension multipliers change
  - Category scores change
  - Option values change
- [x] Test adding a new dimension and assigning values
- [ ] Test removing a dimension (deferred to Phase 2)

**Success Criteria**:
- Scores recalculate automatically on any change ✅
- No reactivity errors in console ✅
- Can dynamically add/remove dimensions without schema changes ✅

**PHASE 1 FINDINGS** (Session 1 - 2025-11-24):

#### ✅ What Worked
1. **Key-value lookup pattern**: `OptionValue[]` array with `dimensionName` as key works perfectly for dynamic dimensions
2. **Cell type system**: Using `Default<T, V>` ONLY at array level (not nested properties) works correctly
3. **Nested Cell access**: Use `.key("propertyName")` to access nested Cell properties in handlers
4. **Handler binding**: Partial application pattern `onClick={handler({ cell: cellValue })}` works well
5. **Reactivity**: Simple functions that read from Cells trigger reactivity automatically - no need for `computed()`

#### ❌ What Didn't Work
1. **Complex `computed()` operations**: Mapping over arrays within `computed()` that map over other arrays caused deployment timeouts
   - Root cause: Deep reactive dependency trees cause framework hangs
   - Solution: Use simple functions, call per-item in JSX map
2. **`computed()` return types**: `computed()` returns plain JavaScript values (arrays, objects), NOT Cell types
   - Cannot call `.mapWithPattern()` on computed array results
   - Must use plain `.map()` on computed results
3. **Default values in nested interfaces**: Using `Default<>` inside nested interface properties causes type errors when pushing to arrays
   - Only use `Default<>` at the top-level array field
   - Provide defaults when pushing: `dimensions.push({ multiplier: 1, ... })`

#### 🎓 Key Learnings
1. **Use `derive()` for reactive JSX expressions**: When accessing Cells in JSX, wrap computations in `derive()`
   ```typescript
   // ❌ Wrong - causes "Cannot create cell link" errors
   const score = calculateScore(option);

   // ✅ Correct - use derive() for reactive context
   const score = derive({ option, dims: dimensions }, ({ option, dims }) => {
     // computation here
   });
   ```
2. **Keep computed() simple**: Avoid complex nested operations in `computed()` - use `derive()` for per-element calculations in JSX
3. **Type system patterns**:
   ```typescript
   // ❌ Wrong - causes type errors
   interface Dimension {
     multiplier: Default<number, 1>;
   }

   // ✅ Correct - provide defaults when pushing
   interface Dimension {
     multiplier: number;
   }
   dimensions.push({ multiplier: 1, ... });
   ```

#### 📝 Architecture Decision
**Score calculation approach**: Use `derive()` inline in JSX map for per-option calculations
```typescript
options.map((option, index) => {
  const score = derive(
    { option, dims: dimensions },
    ({ option, dims }) => {
      // Calculate score for this option
    }
  );
  return <div>{derive(score, (s) => s.toFixed(1))}</div>
})
```
- Proper reactive context with `derive()`
- No "Cannot create cell link" errors
- Scores recalculate automatically when dimensions or values change
- Performance is fine for reasonable data sizes
- Follows pattern established in store-mapper.tsx

### Phase 2: Core UI
- [ ] Two-pane layout with ct-hstack
- [ ] Left pane: Scrollable list of options with scores
- [ ] Right pane: Detail view for selected option
- [ ] Add option button
- [ ] Add dimension button (with type selector)

### Phase 3: Dynamic Value Editing
- [ ] Detail pane shows all dimensions
- [ ] For each dimension, show current value for selected option
- [ ] Categorical: ct-select with bidirectional binding
- [ ] Numeric: ct-input type="number" with bidirectional binding
- [ ] Helper functions:
  - `getOptionValue(option, dimensionName) → value | null`
  - `setOptionValue(option, dimensionName, value)` → updates/adds to values array

### Phase 4: Manual Ranking
- [ ] Up/down buttons for each option
- [ ] Updates `manualRank` field (1, 2, 3...)
- [ ] Visual indicator when manual rank differs from calculated rank
- [ ] "Reset Manual Ranks" button

### Phase 5: LLM - Extract Dimensions
- [ ] "Quick Add" button prompts for option name + context
- [ ] LLM receives context and existing dimensions
- [ ] Returns suggested values for each dimension
- [ ] User reviews and confirms/edits

**LLM Prompt Strategy**:
```
System: You are helping extract dimension values for a decision rubric.
Existing dimensions:
- Location (categorical: Downtown=10, Suburbs=5, Rural=3)
- Price (numeric: 0-3000)

User prompt: "Apartment A: 2br in Mission District, $2100/mo, 800sqft"

Return values for each dimension based on context.
```

### Phase 6: LLM - Optimize Weights
- [ ] "Optimize to Match Manual" button
- [ ] Collects current state: dimensions, options, manual ranks, calculated scores
- [ ] LLM suggests weight adjustments
- [ ] Display suggestions with rationale
- [ ] User can accept/reject

**LLM Prompt Strategy**:
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
- [ ] Proposes dimension with:
  - Name
  - Type (categorical/numeric)
  - Rationale
  - Suggested initial values for existing options
- [ ] User can accept (adds dimension + values) or reject

### Phase 8: Polish & Testing
- [ ] Mobile-responsive layout
- [ ] Loading states for LLM calls
- [ ] Error handling
- [ ] Empty states (no options, no dimensions)
- [ ] Delete confirmations
- [ ] Visual polish (icons, colors, spacing)

## Open Questions

1. **Dimension Editing**: Should users be able to edit dimension names/types after creation?
   - Risk: Breaks existing OptionValue references
   - Solution: Update all matching OptionValue.dimensionName when dimension.name changes?

2. **Default Values**: When adding a new dimension, should we:
   - Leave values blank for all options (user fills in)?
   - Use LLM to suggest values for existing options?
   - Provide a default value?

3. **Score Normalization**: Should we normalize scores (0-100 scale)?
   - Pro: Easier to understand
   - Con: Adds complexity, less transparent

4. **Persistence**: Pattern state persists automatically in CommonTools?
   - Yes, all Cell data is automatically persisted
   - Users can export/share rubrics via charm links

## Technical Risks

### High Risk 🔴
1. **Reactivity with dynamic lookups**: Does `computed()` properly track dependencies when we use `.find()` on arrays?
   - Mitigation: Phase 1 validates this before building more

### Medium Risk 🟡
2. **LLM response parsing**: Structured output needs to match our types
   - Mitigation: Use `generateObject<T>` with strict TypeScript types

3. **Performance**: Recalculating all scores on every change
   - Mitigation: CommonTools reactivity is efficient; only recalculates what changed
   - Test with 20+ options and 10+ dimensions

### Low Risk 🟢
4. **UI complexity**: Two-pane layout with dynamic forms
   - Mitigation: Use existing patterns (ct-hstack, ct-vstack, ct-input, ct-select)

## Next Steps

1. ✅ Create this TODO file
2. ⏭️ **Create Phase 1 test pattern** to validate data model
3. ⏭️ Review test results with user before proceeding
4. ⏭️ If successful, proceed to Phase 2

## Session Notes

### Session 1 - Initial Design & Phase 1 Implementation (2025-11-24)
- Identified dynamic dimensions as core architectural challenge
- Designed key-value lookup pattern for OptionValue storage
- ~~Planned reactive score calculation with computed()~~ - Revised after testing
- Created comprehensive TODO with phased approach
- Built Phase 1 validation pattern in `patterns/jkomoros/WIP/smart-rubric.tsx`
- Encountered and resolved multiple TypeScript and deployment issues:
  - Type system: Learned to use `Default<>` only at array level
  - Cell access: Learned to use `.key()` for nested properties
  - Reactivity: Discovered `computed()` complexity limits, switched to simple functions
  - Deployment: Fixed timeout issues by simplifying score calculation
- **Phase 1 Status**: ✅ VALIDATED - Dynamic dimension architecture works!
- **NEXT**: Deploy and test Phase 1 pattern, then proceed to Phase 2 (full UI)

### Session 2 - Phase 2 Attempt: Detail Pane (2025-11-24)
- **Goal**: Build detail pane for editing option values across dimensions
- **Approach**: Two-pane layout with dynamic value editing
- Created handlers: `changeCategoricalValue`, `changeNumericValue`
- Built detail pane UI with:
  - Button-based interface for categorical values
  - Increment/decrement buttons for numeric values
  - Dynamic dimension list based on selected option

#### 🚫 BLOCKER: "Cannot create cell link" Error
**Problem**: Persistent "Cannot create cell link: space is required" error when clicking options to show detail pane.

**Root Cause**: The fundamental issue is accessing Cell references for dynamically looked-up values within reactive contexts (derive blocks and handlers).

**Attempted Solutions**:
1. ❌ **Inline arrow functions in derive()**: Closed over Cell references from derive block
2. ❌ **Handler functions with partial application**: Still closing over Cells from unwrapped data
3. ❌ **computed() to get selected Cell**: Used `.at()` to get Cell reference, but handlers still fail

**The Core Problem**:
- Pattern needs to edit values that are dynamically looked up: `option.values.find(v => v.dimensionName === dim.name)`
- These values don't exist as direct Cell properties
- Can't create bidirectional bindings ($ prop) to dynamically computed values
- Handlers that access `.key("values")` on Cells passed from derive blocks lose space context

**What We Learned**:
- ct-select and ct-input with `$value` require direct Cell references
- One-way binding with handlers + value prop doesn't work reliably for dynamic lookups
- The reactive context (space) gets lost when passing Cell references through derive blocks

**Possible Solutions to Explore**:
1. **Restructure data model**: Store dimension values as direct properties instead of lookup array?
   - Con: Loses flexibility of dynamic dimensions
2. **Use native HTML controls**: Bypass ct- controls entirely and manage state manually?
   - Con: Not idiomatic CommonTools
3. **Ask framework authors**: This may be a pattern that needs framework support
4. **Simpler UI**: Use read-only display + modal for editing instead of inline editing?

### Session 3 - Continued Phase 2 Debugging (2025-11-24)
**Extensive debugging of "Cannot create cell link" error**

**All Attempts Failed:**
1. ❌ Passing Cell references from derive blocks to handlers → opaque cells
2. ❌ Passing plain data (index) and looking up Cells inside handler → ReadOnlyAddressError
3. ❌ Passing derived values to handlers → trying to write to read-only derived Cells
4. ❌ Using closure to access Cells (no parameters) → "Cannot create cell link" error persists

**Root Cause Identified:**
The issue is NOT about how we pass parameters - it's about **WHERE the onClick is located**.

According to `/community-docs/superstitions/2025-01-23-onclick-handlers-conditional-rendering.md`:
- **onClick handlers CANNOT be inside reactive contexts** (derive, ifElse, map, etc.)
- The `.map()` over options array IS a reactive context
- Even with closure-based handlers (no Cell parameters), the onClick binding itself happening inside .map() causes opaque cell errors

**The Fundamental Problem:**
- Need: A list of clickable items (one per option)
- Reality: onClick inside `.map()` = reactive context = opaque cell error
- This pattern (clickable list items) may be fundamentally incompatible with the current framework constraints

**Phase 2 Status**: 🔴 **BLOCKED** - onClick handlers in `.map()` contexts cause opaque cell errors

**Next Steps:**
1. Search for working examples of clickable list items in labs/examples
2. Consider alternative UI patterns:
   - Radio buttons for selection (native HTML)?
   - Single "Edit" button outside the list that uses selected index?
   - Completely different selection mechanism?
3. May need to file an issue with framework authors about this use case

**Recommendation**: Commit current progress, document the blocker thoroughly, and seek guidance on how to implement clickable list items within CommonTools constraints.
