# Smart Rubric TODO

## Current Status: Phases 1-5 ✅ COMPLETE

**Completed:**
- ✅ Phase 1: Data Model Validation
- ✅ Phase 2: Core UI (two-pane layout, selection)
- ✅ Phase 3: Dynamic Value Editing (numeric + categorical)
- ✅ Phase 4: Manual Ranking (up/down buttons, boxing pattern)
- ✅ Phase 5: LLM Quick Add (extract dimension values from descriptions)

**Remaining:**
- Phase 6: LLM Optimize Weights
- Phase 7: LLM Suggest Missing Dimensions
- Phase 8: Polish & Testing

---

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

### Session 3 Continuation - Deep Investigation (2025-11-24)
**Found working example**: `todo-list.tsx` in labs/packages/patterns DOES use onClick inside `.map()` and it works!

**Key discovery**: todo-list.tsx uses inline arrow functions that access Cells from closure:
```typescript
{items.map((item) => (
  <ct-button
    onClick={() => {
      const current = items.get();  // Accesses Cell from outer scope
      // ... works!
    }}
  >
    ×
  </ct-button>
))}
```

**Attempted to replicate in smart-rubric**:
1. ❌ Inline arrow accessing `selectedOptionName` directly → `selectedOptionName` is null inside onClick
2. ❌ Saving `selectedOptionName` to local variable `selectedCell` → also becomes null in onClick
3. ❌ Using `handler()` with name parameter → "Cannot create cell link" opaque cell error
4. ❌ Restructuring to use `inputs` object → `inputs.selectedOptionName` still null in onClick
5. ❌ Trying to change interface to use `Cell<>` instead of `Default<>` → won't compile (needs default value)

**Critical finding through debug logging**:
- At pattern init time: `selectedOptionName` is a valid `Proxy(_CellImpl)` ✅
- Inside onClick (within `.map()`): `selectedOptionName` is `null` ❌
- **Even `inputs.selectedOptionName` becomes null inside the onClick**

**The mystery**: Why does `items` work in todo-list but `selectedOptionName` doesn't work in smart-rubric?

**Key difference identified**:
- todo-list Input interface: `items: Cell<TodoItem[]>` (explicit Cell type)
- smart-rubric Input interface: `selectedOptionName: Default<string | null, null>` (Default wrapper)

**Hypothesis**: The `Default<>` wrapper may be getting unwrapped or handled differently in reactive contexts compared to explicit `Cell<>` types. When accessed from inside `.map()`, Default-wrapped Cells become null.

**Status**: Still blocked. Need to either:
1. Find a way to make `Default<>`-wrapped Cells accessible in `.map()` contexts
2. Restructure to avoid the `Default<>` wrapper (but this requires rethinking initialization)
3. Find an alternative UI pattern that doesn't require onClick in `.map()`
4. Ask for help - this may require framework-level understanding

### Session 4 - BREAKTHROUGH: onClick Handler Parameter Pattern (2025-01-24)
**🎉 UNBLOCKED Phase 2!**

After extensive investigation spanning multiple sessions, discovered the solution to accessing Cells inside `.map()` contexts:

**✅ SOLUTION: Pass Cells as handler parameters, not closure variables**

```typescript
// ❌ DON'T: Capture Cell from closure inside .map()
{options.map((option) => (
  <div onClick={() => {
    selection.set({ value: option.name });  // selection is unwrapped to plain object!
  }}>
))}

// ✅ DO: Pass Cell as handler parameter
const selectOption = handler<unknown, { name: string, selectionCell: Cell<SelectionState> }>(
  (_, { name, selectionCell }) => {
    selectionCell.set({ value: name });  // ✅ Works! Cell methods intact
  }
);

{options.map((option) => (
  <div onClick={selectOption({ name: option.name, selectionCell: selection })}>
))}
```

**Root Cause Identified:**
- Inside `.map()` contexts, Cells captured from closure get **unwrapped** to plain values
- This happens to BOTH `Default<object>` and `Default<primitive>` wrapped Cells
- Cell methods (`.set()`, `.get()`, `.key()`) are lost on the unwrapped values
- Even saving a reference before `.map()` doesn't help - it still gets unwrapped in the closure

**Why Handler Parameters Work:**
- Handler parameters are evaluated at invocation time, not definition time
- The framework passes Cells through to handlers WITHOUT unwrapping them
- Cell methods remain intact when passed as parameters

**Key Discovery Process:**
1. Wrapped primitive in object (`SelectionState { value: string | null }`) to avoid null issues
2. Debugged and found Cell still unwrapped in closure (but not null anymore)
3. Tried saving reference before `.map()` - didn't help
4. Discovered handler parameter approach preserves Cell nature

**Testing Confirmation:**
- ✅ onClick selection works: Clicking options updates selection state
- ✅ Detail pane appears reactively when option selected
- ✅ UI shows "Editing: Option 1" correctly
- ✅ Dimensions appear in detail pane
- ✅ State persists across page reloads

**Phase 2 Status**: ✅ **COMPLETE** - Core UI working with selection!

**Documented in Community Docs:**
- Created `/community-docs/superstitions/2025-01-24-pass-cells-as-handler-params-not-closure.md`
- ⭐⭐⭐ 3-star superstition (critical pattern for dynamic UIs)
- Comprehensive examples and workarounds documented

**Next Issue to Solve:**
- Dimension value editing buttons (in detail pane) still have "Cannot create cell link" errors
- These buttons are inside `derive()` block - likely same root cause but different context
- Need to apply handler parameter pattern to dimension editing as well

**Next Steps:**
1. Fix dimension value editing using handler parameter pattern
2. Complete Phase 3: Dynamic Value Editing
3. Test full workflow: add options, dimensions, edit values, see scores update

### Session 5 - Dimension Editing Fixed with Handler Parameters (2025-11-24)
**🎉 Phase 3 COMPLETE: Dynamic Value Editing Working!**

Applied the same "pass Cells as handler parameters" pattern to dimension editing handlers inside `derive()` blocks.

**Problem:**
- Dimension editing buttons (+/-/category selection) inside detail pane `derive()` block gave "Cannot create cell link" errors
- Handlers were trying to access `options.get()` and `options.at(i)` from closure
- Same root cause as Phase 2 onClick issue: Cells accessed from closure in reactive contexts get unwrapped

**Solution:**
1. Pass `optionsCell` as handler parameter (saved reference before derive block: `const optionsCell = options`)
2. Updated handlers to receive `optionsCell: Cell<RubricOption[]>` parameter
3. Changed handlers to use immutable array updates with `.map()` instead of trying to use `.at()` method (which doesn't exist on Cell arrays)

**Handler Pattern:**
```typescript
const changeNumericValue = handler<
  unknown,
  { optionName: string, dimensionName: string, delta: number, min: number, max: number, optionsCell: Cell<RubricOption[]> }
>(
  (_, { optionName, dimensionName, delta, min, max, optionsCell }) => {
    // Update entire options array immutably
    const opts = optionsCell.get();
    const newOpts = opts.map(opt => {
      if (opt.name !== optionName) return opt;
      
      // Find existing value or create new one
      const existingIndex = opt.values.findIndex(v => v.dimensionName === dimensionName);
      const currentValue = existingIndex >= 0 ? (opt.values[existingIndex].value as number) : min;
      const newValue = Math.max(min, Math.min(max, currentValue + delta));
      
      // Update values array immutably
      let newValues;
      if (existingIndex >= 0) {
        newValues = opt.values.toSpliced(existingIndex, 1, {
          dimensionName,
          value: newValue,
        });
      } else {
        newValues = [...opt.values, { dimensionName, value: newValue }];
      }
      
      return { ...opt, values: newValues };
    });
    
    optionsCell.set(newOpts);
  }
);
```

**Other Fixes:**
- Changed all `<button>` elements to `<ct-button>` components (framework standard)
- Removed debug logging (console.log statements)

**Testing Results:**
- ✅ Numeric dimension +/- buttons work correctly
- ✅ Values increment/decrement by 10 (configurable delta)
- ✅ Categorical dimension selection buttons work correctly
- ✅ Clicking categories updates values
- ✅ **Scores update reactively** when dimension values change!
- ✅ UI shows updated values immediately in detail pane
- ✅ Score calculation works across multiple dimensions (tested with numeric + categorical)

**Key Insight:**
The "pass Cells as handler parameters" pattern applies to **ALL reactive contexts**, not just `.map()`:
- ✅ Inside `.map()` contexts
- ✅ Inside `derive()` blocks
- ✅ Any context where Cells might get unwrapped from closure

**Phase 3 Status**: ✅ **COMPLETE** - Dynamic value editing fully functional!

**Phases Completed:**
- ✅ Phase 1: Data Model Validation
- ✅ Phase 2: Core UI (two-pane layout, selection)
- ✅ Phase 3: Dynamic Value Editing (numeric + categorical)

**Next Steps:**
- Phase 4: Manual Ranking (up/down buttons, visual indicators)
- Phase 5-7: LLM features (extract, optimize, suggest)
- Phase 8: Polish & testing
- Add to page-creator launcher pattern

**Commit:** `bc8f116` - Fix dimension editing handlers in smart-rubric by passing Cells as parameters

### Session 6 - Phase 4: Boxing Pattern Investigation (2025-11-24)
**Goal**: Implement manual ranking with up/down buttons that preserve Cell identities during reordering

**Inspiration**: shopping-list-launcher.tsx uses "Berni's Boxing Approach" - wrapping items in Cells (`Array<Cell<T>>`) to preserve Cell identities through sorting operations.

#### Why Boxing Was Considered
In shopping-list-launcher, items are boxed so they can be sorted without losing Cell identity:
```typescript
// 1. Box items
const boxedItems = itemsWithAisles.map(assignment => ({ assignment }));

// 2. Sort boxed items (creates derived view)
const sortedBoxedItems = derive(boxedItems, (boxed) => {
  return boxed.slice().sort((a, b) => { /* compare */ });
});

// 3. Individual items remain reactive
{group.items.map(({ assignment }) => (
  <ct-checkbox $checked={assignment.item.done} />  // ✅ Still interactive!
))}
```

The hypothesis was that boxing could enable manual ranking by:
- Preserving Cell identities when swapping array elements
- Allowing handlers to mutate individual Cell properties using `.key().set()`
- Avoiding the need to recreate the entire array on each reorder

#### Approach 1: Type Definitions + Basic Boxing ❌
**Changes:**
1. Changed `options: Default<RubricOption[], []>` to `options: Default<Array<Cell<RubricOption>>, []>`
2. Changed `options: Cell<RubricOption[]>` to `options: Cell<Array<Cell<RubricOption>>>`
3. Updated `addTestOption` to wrap new options in `cell()`:
   ```typescript
   options.push(cell({
     name: `Option ${options.get().length + 1}`,
     values: [],
     manualRank: null,
   }));
   ```

**Deployment:** Charm `baedreibvosbcgf3qqojjj2wwhoofw227fqznfvi4eq2becri53uegetoqm`

**Result:** ❌ Error: "Cannot read properties of undefined (reading 'name')" when adding options

**Root Cause:** Parameter shadowing in derive block:
```typescript
// ❌ Problem: 'option' parameter shadowed outer 'option' Cell variable
derive({ option, dims: dimensions }, ({ option, dims }) => {
  // 'option' here is now the unwrapped parameter value, not the outer Cell
});
```

**Fix:** Renamed parameter from `option` to `opt`:
```typescript
derive({ opt: option, dims: dimensions }, ({ opt, dims }: { opt: RubricOption; dims: Dimension[] }) => {
  // Now 'opt' is clearly the unwrapped value
});
```

#### Approach 2: Handler Parameter Refactoring ❌
**Problem:** After fixing parameter shadowing, onClick handlers still broken with "Property 'name' does not exist on type 'Cell<RubricOption>'"

**Attempted:**
```typescript
onClick={moveOptionUp({ optionName: option.name, optionsCell })}
// ERROR: Property 'name' does not exist on type 'Cell<RubricOption>'
```

**Root Cause:** Inside `.map()`, `option` is a Cell object, not a plain RubricOption. Can't access `.name` directly.

**Fix:** Refactored handlers to accept Cells and extract properties inside:
```typescript
// Handler accepts Cell
const selectOption = handler<unknown, { optionCell: Cell<RubricOption>, selectionCell: Cell<SelectionState> }>(
  (_, { optionCell, selectionCell }) => {
    const optionName = optionCell.get().name;  // Extract inside handler
    selectionCell.set({ value: optionName });
  }
);

// onClick passes Cell directly
onClick={selectOption({ optionCell, selectionCell })}
```

Updated all handlers:
- `selectOption` - takes `optionCell` parameter
- `moveOptionUp` - takes `optionCell` and `optionsCell` parameters
- `moveOptionDown` - takes `optionCell` and `optionsCell` parameters

**Deployment:** Not deployed in this state - proceeded to next approach

#### Approach 3: Boxing Wrapper Inside Derive ❌
**Inspiration:** shopping-list-launcher wraps items before sorting:
```typescript
const boxedItems = itemsWithAisles.map(assignment => ({ assignment }));
```

**Attempted:** Wrap Cells in objects inside derive block:
```typescript
{derive(
  { opts: options, sel: selection },
  ({ opts, sel }) => {
    const boxedOptions = opts.map(opt => ({ optionCell: opt }));

    return boxedOptions.map(({ optionCell }, index) => {
      // Render with optionCell
    });
  }
)}
```

**Problem:** Inside derive(), `opts` is already unwrapped to plain objects, not Cells. Creating `{ optionCell: opt }` just wraps plain objects, not Cells.

**Result:** ❌ `optionCell` is a plain object, not a Cell - no Cell methods available

#### Approach 4: Boxing Outside Derive ❌
**Solution:** Move boxing before derive block, when `options` is still a Cell array:
```typescript
// Box BEFORE derive, when options is still a Cell
const boxedOptions = options.map(opt => ({ optionCell: opt }));

{derive(
  { boxed: boxedOptions, sel: selection },
  ({ boxed, sel }) => {
    return boxed.map(({ optionCell }, index) => {
      // Now optionCell should be preserved
    });
  }
)}
```

**Manual Ranking Handlers:**
```typescript
const moveOptionUp = handler<
  unknown,
  { optionCell: Cell<RubricOption>, optionsCell: Cell<Array<Cell<RubricOption>>> }
>(
  (_, { optionCell, optionsCell }) => {
    const opts = optionsCell.get();
    const index = opts.findIndex(opt => opt === optionCell);  // Find by Cell identity

    if (index <= 0) return; // Already at top or not found

    // BOXING: Just swap the Cell references!
    const newOpts = [...opts];
    [newOpts[index - 1], newOpts[index]] = [newOpts[index], newOpts[index - 1]];

    // Update manualRank on the individual Cells
    newOpts[index - 1].key("manualRank").set(index);
    newOpts[index].key("manualRank").set(index + 1);

    optionsCell.set(newOpts);
  }
);
```

**Deployment:** Charm `baedreibe36q5zgzfjink4gbp2g7g6gemxjjkppawkgx4eof5jgnucwvnrm`

**Testing:**
- ✅ Pattern loads
- ✅ Options can be added (1, 2, 3)
- ✅ Up/down buttons render and are clickable
- ❌ **Clicking up/down doesn't reorder options**
- ❌ No JavaScript errors in console

**Problem:** Manual ranking not working - options stay in order 1, 2, 3

#### Approach 5: Direct Cell Array Mapping ❌
**Hypothesis:** Maybe the boxing wrapper `{ optionCell: opt }` is interfering. Try mapping directly over the Cell array.

**Removed boxing wrapper:**
```typescript
// No more boxing wrapper - just use options directly
{derive(
  { opts: options, sel: selection },
  ({ opts, sel }) => {
    if (opts.length === 0) return <div>No options yet</div>;

    return opts.map((opt, index) => {
      // opt should be unwrapped RubricOption here
      // But we still pass the ORIGINAL Cell from options array to handlers
    });
  }
)}
```

**UI code:**
```typescript
{options.length === 0 ? (
  <div>No options yet</div>
) : (
  options.map((optionCell, index) => {
    // optionCell should be a Cell<RubricOption> from the array
    const score = derive(
      { opt: optionCell, dims: dimensions },
      ({ opt, dims }: { opt: RubricOption; dims: Dimension[] }) => {
        // Calculate score
      }
    );

    return (
      <div>
        <ct-button onClick={moveOptionUp({ optionCell, optionsCell })}>▲</ct-button>
        <ct-button onClick={moveOptionDown({ optionCell, optionsCell })}>▼</ct-button>
        <span>{index + 1}. {optionName}</span>
      </div>
    );
  })
)}
```

**Deployment:** Charm `baedreihntnf6xluilixhyoxernm7cg2ohyik5bsylv3oqulme457zv7eqq`

**Testing:**
- ✅ Options added successfully (1, 2, 3)
- ✅ Up/down buttons clickable
- ✅ No JavaScript errors
- ❌ **Clicking up button on Option 3 doesn't move it** - stays at position 3

**Problem:** Cell identity comparison likely failing:
```typescript
const index = opts.findIndex(opt => opt === optionCell);  // Returns -1?
```

When `optionCell` comes from `.map()` iteration, it may not be the same reference as what's stored in the array.

#### Key Technical Issue: Cell Identity Comparison
**The Core Problem:**
```typescript
// Handler receives optionCell from onClick
const index = opts.findIndex(opt => opt === optionCell);
```

This Cell identity check (`opt === optionCell`) doesn't work reliably because:
1. `optionCell` comes from `.map()` iteration: `options.map((optionCell, index) => {...})`
2. Inside the handler, `opts` comes from `optionsCell.get()`
3. The Cell reference from `.map()` may be a different proxy/wrapper than the Cell in the array
4. Result: `findIndex()` returns `-1`, handler exits early, no reordering happens

#### Why Boxing Works in shopping-list-launcher
**Critical Difference:**

**shopping-list-launcher:**
- Original array: `items: Cell<ShoppingItem[]>` (plain objects)
- Boxing: `const boxedItems = itemsWithAisles.map(assignment => ({ assignment }))`
- Sorting: Creates a **derived view** with `derive()` that sorts the boxed array
- **Original array is never modified** - only the displayed order changes
- No need for Cell identity comparison
- Handlers use `.key()` to mutate individual Cells in place

**smart-rubric needs:**
- Original array: `options: Cell<Array<Cell<RubricOption>>>` (boxed)
- User interaction: Click up/down buttons to reorder
- Goal: **Actually reorder the original array** by swapping Cell references
- Requires finding the clicked Cell in the array by identity (`===`)
- **This identity comparison fails**

**Fundamental mismatch:**
- Shopping-list: Sort a derived VIEW (original unchanged)
- Smart-rubric: REORDER the original array (original must change)

#### Console Warnings
**Persistent warning when adding options:**
```
WARN Received unexpected object when value was expected. Attempting to reconcile.
```

This suggests the framework is receiving something unexpected when setting the boxed array.

#### Attempted Solutions Summary

| Approach | Issue | Result |
|----------|-------|--------|
| Basic boxing + type changes | Parameter shadowing in derive | ❌ Compilation error |
| Handler refactoring | Property access on Cell type | ❌ Type error |
| Boxing wrapper in derive | Cells already unwrapped in derive | ❌ Boxing plain objects |
| Boxing wrapper before derive | Cell identity comparison fails | ❌ No reordering |
| Direct Cell array mapping | Cell reference mismatch | ❌ findIndex returns -1 |

#### Key Insights

1. **Boxing pattern is for sorting derived views, not reordering originals**
   - Shopping-list creates sorted view with `derive(boxedItems, items => items.sort())`
   - Smart-rubric needs to actually swap array elements

2. **Cell identity (===) doesn't work reliably**
   - Cells from `.map()` iteration may be different proxies than stored Cells
   - Can't use `findIndex(opt => opt === optionCell)` reliably

3. **"unexpected object when value was expected" warning**
   - Framework may not expect `Array<Cell<T>>` type
   - Might be treating it differently than plain arrays

4. **Handler parameter pattern still essential**
   - Must pass Cells as handler parameters (confirmed working)
   - But Cell identity comparison inside handler fails

#### Recommendations for Phase 4

**Option A: Revert to Plain Array with Index-Based Reordering**
```typescript
// Keep original type
interface RubricInput {
  options: Default<RubricOption[], []>;  // Plain objects
}

// Handlers take index, not Cell reference
const moveOptionUp = handler<unknown, { index: number, optionsCell: Cell<RubricOption[]> }>(
  (_, { index, optionsCell }) => {
    if (index <= 0) return;

    const opts = optionsCell.get();
    const newOpts = [...opts];
    [newOpts[index - 1], newOpts[index]] = [newOpts[index], newOpts[index - 1]];

    // Update manualRank on swapped objects
    newOpts[index - 1].manualRank = index;
    newOpts[index].manualRank = index + 1;

    optionsCell.set(newOpts);
  }
);

// Pass index from map
{options.map((option, index) => (
  <ct-button onClick={moveOptionUp({ index, optionsCell })}>▲</ct-button>
))}
```

**Pros:**
- Simple and straightforward
- No Cell identity issues
- Index is reliable in `.map()` context
- Proven pattern (used extensively in other patterns)

**Cons:**
- Recreates entire array on each reorder
- No per-option Cell preservation

**Option B: Use Name-Based Lookup Instead of Cell Identity**
```typescript
const moveOptionUp = handler<unknown, { optionName: string, optionsCell: Cell<Array<Cell<RubricOption>>> }>(
  (_, { optionName, optionsCell }) => {
    const opts = optionsCell.get();
    const index = opts.findIndex(opt => opt.get().name === optionName);  // Lookup by name

    if (index <= 0) return;

    const newOpts = [...opts];
    [newOpts[index - 1], newOpts[index]] = [newOpts[index], newOpts[index - 1]];

    // Update individual Cells
    newOpts[index - 1].key("manualRank").set(index);
    newOpts[index].key("manualRank").set(index + 1);

    optionsCell.set(newOpts);
  }
);
```

**Pros:**
- Still uses boxing pattern
- Name lookup is more reliable than Cell identity
- Can mutate individual Cells

**Cons:**
- Requires option names to be unique
- Extra `.get().name` overhead

**Option C: Ask Framework Authors**
This use case (manually reordering a boxed Cell array) may require framework-level understanding or may reveal a limitation in the current Cell proxy system.

**Recommendation:** **Try Option A first** - plain array with index-based reordering. It's the simplest, most proven approach. Boxing may not be the right pattern for this use case.

#### Phase 4 Status
🔴 **NOT STARTED** (boxing experiments not committed)

**Next Steps:**
1. Revert smart-rubric.tsx to Phase 3 completed state (plain object arrays)
2. Implement manual ranking with Option A (index-based reordering)
3. Test thoroughly
4. Document findings about when boxing pattern is appropriate vs. not

### Session 7 - Phase 4 SUCCESS: Boxing with .equals() (2025-11-25)
**🎉 PHASE 4 COMPLETE: Manual ranking working with boxing pattern!**

#### The Working Solution

**Key Discovery:** The framework auto-boxes array items! You don't need to explicitly use `cell()` when pushing.

**Pattern from `array-in-cell-with-remove-editable.tsx`:**
```typescript
// Input uses plain array type
interface InputSchema {
  items: Default<Item[], []>;  // Plain array - NOT Array<Cell<Item>>
}

// Handler types it as boxed (framework auto-boxes)
const removeItem = handler<
  unknown,
  { items: Cell<Array<Cell<Item>>>; item: Cell<Item> }
>((_event, { items, item }) => {
  const currentItems = items.get();
  // Use .equals() INSTANCE METHOD for Cell comparison
  const index = currentItems.findIndex((el) => el.equals(item));
  if (index >= 0) {
    items.set(currentItems.toSpliced(index, 1));
  }
});

// In JSX, items are Cells
{items.map((item, index) => (
  <ct-button onClick={removeItem({ items, item })}>Remove</ct-button>
))}
```

#### Implementation Changes

1. **Input type uses plain array:**
   ```typescript
   interface RubricInput {
     options: Default<RubricOption[], []>;  // Plain array!
   }
   ```

2. **Handler type declares boxed Cell array:**
   ```typescript
   const moveOptionUp = handler<
     unknown,
     { optionCell: Cell<RubricOption>, optionsCell: Cell<Array<Cell<RubricOption>>> }
   >(
     (_, { optionCell, optionsCell }) => {
       const opts = optionsCell.get();
       // Use .equals() INSTANCE METHOD (not Cell.equals())
       const index = opts.findIndex(opt => opt.equals(optionCell));
       // ... swap logic
     }
   );
   ```

3. **Push plain objects (auto-boxed):**
   ```typescript
   options.push({
     name: `Option ${options.get().length + 1}`,
     values: [],
     manualRank: null,
   });
   ```

4. **Inside derive(), arrays are unwrapped to plain objects:**
   ```typescript
   derive({ opts: options }, ({ opts }) => {
     // opts is RubricOption[] here, NOT Array<Cell<RubricOption>>
     const found = opts.find(opt => opt.name === "foo");  // Direct property access
   });
   ```

5. **Detail pane handlers use name-based lookup:**
   ```typescript
   const changeNumericValue = handler<
     unknown,
     { optionName: string, optionsCell: Cell<Array<Cell<RubricOption>>>, ... }
   >(
     (_, { optionName, optionsCell, ... }) => {
       const opts = optionsCell.get();
       const optionCell = opts.find(opt => opt.get().name === optionName);
       if (!optionCell) return;
       optionCell.key("values").set(newValues);
     }
   );
   ```

#### Critical Insights

1. **Framework auto-boxes:** `Default<Item[], []>` becomes `Cell<Array<Cell<Item>>>` at runtime
2. **Use `.equals()` instance method:** `opt.equals(otherCell)` works, `Cell.equals()` static may not
3. **Derive unwraps to plain values:** Inside derive callback, arrays contain plain objects
4. **Handlers see Cells:** Inside handlers, `.get()` returns the Cell array with Cell items
5. **Name-based lookup for detail pane:** Since derive unwraps, use name to find options for mutation

#### Testing Results
- ✅ Options can be added
- ✅ Up/down buttons reorder options correctly
- ✅ Manual rank indicator (✋) appears after reordering
- ✅ Reset Manual Ranks clears indicators
- ✅ Selection works (detail pane shows selected option)
- ✅ Dimension value editing works (scores update reactively)

#### Phase 4 Status: ✅ COMPLETE

**Phases Completed:**
- ✅ Phase 1: Data Model Validation
- ✅ Phase 2: Core UI (two-pane layout, selection)
- ✅ Phase 3: Dynamic Value Editing (numeric + categorical)
- ✅ Phase 4: Manual Ranking (up/down buttons, boxing pattern)

**Next Steps:**
- Phase 5-7: LLM features (extract, optimize, suggest)
- Phase 8: Polish & testing

### Session 8 - Phase 5 COMPLETE: LLM Quick Add (2025-11-25)
**🎉 PHASE 5 COMPLETE: LLM Quick Add feature working!**

#### Implementation Summary

Added a "Quick Add" section that uses LLM to extract option names and dimension values from natural language descriptions.

**Features:**
- Input field for describing an option (e.g., "Apartment A: good location, Number 1 is 85")
- "Analyze" button to submit to LLM
- Displays extracted option name, dimension values, confidence levels, and reasoning
- "Accept & Add" button to add the option with extracted values
- "Clear" button to reset the form

**Technical Implementation:**
1. `generateObject()` with schema for extracting option name, values, and confidence
2. System prompt provides dimension definitions (names, types, ranges/categories)
3. LLM returns structured response with extracted values and reasoning
4. Submit button pattern to avoid race conditions (typing doesn't trigger LLM)

#### Critical Bug Fixed: ReadOnlyAddressError

**Problem:** After clicking "Accept & Add", the form wouldn't clear. Error: `ReadOnlyAddressError: Cannot write to read-only address`

**Root Cause:** Buttons were inside a `derive()` block. When handlers are called from inside `derive()` context, Cells become read-only proxies - `.set()` fails.

**Solution:** Move Accept/Clear buttons OUTSIDE the `derive()` block:
```typescript
// Display-only content inside derive
{derive({ result }, ({ result }) => {
  if (!result) return <div>No result</div>;
  return <div>Extracted: {result.optionName}</div>;
})}

// Action buttons OUTSIDE derive - handlers can write
<ct-button onClick={acceptResult({ resultCell, promptCell })}>
  Accept
</ct-button>
```

**Handler reads from result Cell:**
```typescript
const acceptQuickAddFromResult = handler<
  unknown,
  {
    resultCell: Cell<QuickAddResponse | undefined>,
    optionsCell: Cell<Array<Cell<RubricOption>>>,
    promptCell: Cell<string>,
    submittedCell: Cell<string>,
  }
>((_, { resultCell, optionsCell, promptCell, submittedCell }) => {
  const result = resultCell.get();
  if (!result) return;

  // Add option...
  optionsCell.push({ name: result.optionName, values, manualRank: null });

  // Clear form (works because outside derive context)
  promptCell.set("");
  submittedCell.set("");
});
```

#### New Superstitions Created

1. **`2025-11-25-generateObject-race-condition-pass-cell-directly.md`**
   - Pass Cell directly to `prompt:` parameter instead of wrapping in `derive()`
   - Avoids race condition where results get stuck in "pending" state

2. **`2025-11-25-handlers-inside-derive-cause-readonly-error.md`**
   - Handlers called from inside derive() context cannot write to Cells
   - Solution: Move buttons/handlers OUTSIDE derive blocks

#### Testing Results
- ✅ LLM extracts option name correctly
- ✅ Dimension values extracted with confidence levels
- ✅ "Accept & Add" adds option with correct values
- ✅ Score calculates correctly (tested: 92.0 for extracted values)
- ✅ Form clears after accept (no more ReadOnlyAddressError)
- ✅ "Clear" button works correctly

#### Phase 5 Status: ✅ COMPLETE

**Phases Completed:**
- ✅ Phase 1: Data Model Validation
- ✅ Phase 2: Core UI (two-pane layout, selection)
- ✅ Phase 3: Dynamic Value Editing (numeric + categorical)
- ✅ Phase 4: Manual Ranking (up/down buttons, boxing pattern)
- ✅ Phase 5: LLM Quick Add (extract dimension values from descriptions)

**Next Steps:**
- Phase 6: LLM Optimize Weights (suggest weight adjustments to match manual ranking)
- Phase 7: LLM Suggest Missing Dimensions
- Phase 8: Polish & testing
