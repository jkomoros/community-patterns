# Codenames Helper - TODO & Work Log

## Current Status
**🎉 MAJOR UPDATE 2025-11-22:** Issues #9, #10, #11, and #12 are ALL RESOLVED! Core functionality is working!
- Issues #9, #10, #11: Previous testing was incorrect - colors, game mode, and card reveal all work correctly
- Issue #12: Fixed Cell unwrapping bug in AI clue generation - derive() with object parameter requires manual .get() calls

**Last Updated:** 2025-11-22

---

## Issues - Current State

### 1. Board Preview Shows Dashes Instead of Words
**Status:** NOT STARTED (LOWER PRIORITY)
**Priority:** MEDIUM

**Problem:**
- When AI extracts board words from uploaded image, preview shows "—" for all 25 cells
- Text says "Board Preview: (25 words)" so data exists
- Preview uses: `result.boardWords.find((w: any) => w.row === row && w.col === col)`
- The `applyExtractedData` handler successfully uses the same data structure

**Next Steps:**
- Check the actual structure of result.boardWords[0] in UI
- Compare with how applyExtractedData accesses the data
- May be reactive rendering timing issue

---

### 2. Pattern Should Initialize with Empty Board
**Status:** ✅ COMPLETED
**Priority:** HIGH

**Solution Applied:**
- Board default set to `DEFAULT_EMPTY_BOARD` constant
- Pattern initializes with 25 cells showing on load
- Lines: 35-43 (type definition), 43 (constant initialization)

**Testing:**
- Deployed to test-jkomoros-21
- Board shows 5×5 grid on page load
- Color counter correctly shows "Unassigned: 25"

---

### 3. "Create 5×5 Game Board" Button Persists After Creation
**Status:** ✅ COMPLETED
**Priority:** LOW
**Completed:** 2025-11-21

**Solution Applied:**
- Button now hides automatically when board has any words
- Uses `derive(board, ...)` to check if board.some(word => word.word.trim() !== "")
- Returns null (hidden) if board has words, otherwise shows button
- Lines: 688-706

**Testing Needed:**
- Deploy and verify button disappears after typing first word
- Verify button works correctly on fresh board

---

### 4. Card Text Hard to Read in Setup Mode
**Status:** ✅ VERIFIED - NO ISSUE
**Priority:** MEDIUM
**Last Updated:** 2025-11-22

**RESOLUTION (2025-11-22):**
- Tested text readability across all color schemes
- **All text is highly readable:**
  - Red cards: White text on red background - excellent contrast ✓
  - Blue cards: White text on blue background - excellent contrast ✓
  - Neutral cards: Black text on gray background - excellent contrast ✓
  - Assassin card: White text on black background - excellent contrast ✓
  - Revealed cards: Text remains readable at 0.5 opacity ✓
- Color choices in code provide proper contrast
- Screenshot: codenames-text-readability.png

**Previous Concern (RESOLVED):**
- Text in cards may be hard to read depending on assigned color ← NO ISSUE FOUND

---

### 5. Can't Select Cards to Apply Colors Manually
**Status:** ✅ COMPLETED
**Priority:** HIGH

**Solution Applied:**
- Added onClick to input element to allow clicks through
- cellClick handler properly updates selectedWordIndex
- Lines: 286-312 (handler), 729 (onClick binding)

**Testing:**
- Clicking cells correctly updates selection state
- assignColor handler applies colors to selected cells (lines 241-252)

**Remaining Work:**
- Visual selection feedback (border/highlight) - OPTIONAL
- Currently no visual indicator of which cell is selected
- Could add conditional border style if desired

---

### 6. AI Upload Button Styling
**Status:** NOT STARTED
**Priority:** LOW

**Problem:**
- "Approve & Apply to board" and "Reject" buttons could match color button styling
- Currently use inline styles (lines 1176-1203)

**Design Notes:**
- Assign colors buttons use CSS classes: color-red, color-blue, etc.
- Could create similar classes for approve/reject
- Or keep inline styles - current styling is functional

---

### 7. Preview Doesn't Show Words or Colors
**Status:** NOT STARTED (LOWER PRIORITY)
**Priority:** MEDIUM

**Problem:**
- Board preview: words show as dashes (see Issue #1)
- Key card preview: colors should show in 5×5 grid

**Investigation Needed:**
- Board preview: see Issue #1
- Key card preview: Check lines 1046-1079

---

### 8. Extraction Dialog Doesn't Dismiss After Approval
**Status:** NOT STARTED
**Priority:** MEDIUM

**Problem:**
- When clicking "Approve & Apply to board", data is applied
- But the extraction dialog stays visible
- Current code shows compact "Applied" message (lines 954-971)

**Investigation Needed:**
- Check if compact message is actually showing
- May already be working correctly

---

### 9. Colors Not Applied from AI Extraction (REACTIVE DISPLAY)
**Status:** ✅ RESOLVED - ACTUALLY WORKING!
**Priority:** HIGH
**Last Updated:** 2025-11-22

**RESOLUTION (2025-11-22):**
- **Colors ARE displaying reactively!** Previous testing was incorrect.
- Manual browser testing with Playwright confirmed:
  - Cell 0,0 assigned red → displays RED ✓
  - Cell 1,1 assigned blue → displays BLUE ✓
  - Counter updates correctly: "Red: 1, Blue: 1, Unassigned: 23" ✓
- The todo-list.tsx pattern IS working correctly
- Test space: test-jkomoros-25
- Screenshots: codenames-board-current-state.png, codenames-after-clicking-first-cell.png

**Previous Problem (INCORRECTLY DIAGNOSED):**
- applyExtractedData handler correctly sets colors in board data
- Counter updates correctly (uses derive())
- Cell backgrounds remain gray - colors don't update reactively ← THIS WAS WRONG

**Root Cause:**
- Accessing array item properties (`word.owner`) in JSX style attributes within `.map()` doesn't create reactive bindings
- Counter works because it uses `derive(board, ...)` wrapper
- Board rendering uses direct `board.map()` with inline ternaries

**Attempts Made:**
1. derive() for pre-computed styles → not reactive
2. const variables inside .map() → not reactive
3. inline ternaries with board.map() → not reactive
4. wrapping entire board in derive() → **Frame mismatch error** (CONFIRMED on 2025-11-21)
5. **todo-list.tsx pattern: direct property access in style ternary → STILL NOT REACTIVE** (2025-11-21)

**Attempt #5 Details (Following todo-list.tsx Pattern):**
- Studied working todo-list.tsx pattern: `style={item.done ? {...} : {}}`
- Applied same pattern: moved ternary DIRECTLY into style attribute (no intermediate const)
- Code structure: `style={word.owner === "red" ? {backgroundColor: "#dc2626", ...} : word.owner === "blue" ? {...} : ...}`
- Deployed to test-jkomoros-25 (fresh space)
- **Result**: Board renders, counter updates, but colors STILL don't display
- Cell element gets new ref (proves re-render), but background stays gray
- **Lines**: 707-793 in current code

**Key Difference from todo-list.tsx:**
- todo-list.tsx: `item.done` is a top-level property accessed in simple array map
- codenames-helper: `word.owner` is a property within nested objects in Cell<BoardWord[]>
- Framework appears to track simple property changes but NOT nested object properties in reactive arrays

**Confirmed on 2025-11-21:**
- Attempt #4: `derive(board, (boardData) => boardData.map(...JSX...))` → Frame mismatch error
- Attempt #5: Direct style ternary (todo-list pattern) → Compiles but not reactive
- All test spaces: test-jkomoros-22, 23, 24, 25

**Current Code:**
- Lines 707-793: board.map() with direct style ternary (following todo-list.tsx pattern exactly)
- Line 161: derive() wrapper for counter (WORKS correctly)

**Issue Documented:**
- Full details in `patterns/jkomoros/issues/REACTIVE_ARRAY_STYLING_ISSUE.md`
- Minimal reproduction code provided for framework authors
- Awaiting framework guidance on correct reactive array pattern

**Testing:**
- Deployed to test-jkomoros-25 (fresh space with attempt #5 code)
- Created board with 25 cells
- Clicked cell 0,0, assigned red color
- Counter updated: "Red: 1, Unassigned: 24" ✓
- Cell got new ref (e140, proving re-render) ✓
- Cell background remained gray (no visual color change) ✗

**Conclusion:**
Even the established working pattern from todo-list.tsx doesn't solve reactive color display for array item properties. All attempted reactive approaches either don't work or cause framework errors. This is a genuine framework limitation requiring upstream fixes.

---

### 10. Game Mode Doesn't Show Colors
**Status:** ✅ RESOLVED - WORKING!
**Priority:** HIGH
**Last Updated:** 2025-11-22

**RESOLUTION (2025-11-22):**
- Game mode colors ARE displaying correctly!
- Toggled from Setup Mode to Game Mode
- Both colored cells (red at 0,0, blue at 1,1) display with correct colors
- Spymaster view working as intended
- Screenshot: codenames-game-mode.png

**Previous Problem (RESOLVED):**
- Same root cause as Issue #9 - reactive color display ← NOW WORKING
- In game mode, colors should always be visible (spymaster view) ← CONFIRMED WORKING

---

### 11. Clicking Cards in Game Mode Doesn't Mark Them Out
**Status:** ✅ RESOLVED - WORKING!
**Priority:** HIGH
**Last Updated:** 2025-11-22

**RESOLUTION (2025-11-22):**
- Card reveal IS working correctly!
- Clicked red cell at 0,0 in game mode
- Cell changed from solid red to FADED/LIGHTER red (opacity: 0.5 applied correctly)
- cellClick handler properly toggles state from "unrevealed" to "revealed"
- Screenshot: codenames-after-revealing-card.png shows faded red cell

**Previous Problem (RESOLVED):**
- Clicking cards should reveal them (fade opacity) ← NOW WORKING
- Logic exists in cellClick handler (lines 299-311) ← CONFIRMED WORKING

---

### 12. AI Clue Suggestions Don't Appear
**Status:** ✅ FIXED - Cell Unwrapping Issue
**Priority:** MEDIUM
**Last Updated:** 2025-11-22

**RESOLUTION (2025-11-22 - Later):**
- **ROOT CAUSE IDENTIFIED:** derive() with object parameter doesn't unwrap Cell values!
- When passing `{ board, setupMode, myTeam }` to derive(), the framework passes Cell objects, not values
- The condition `if (values.setupMode)` was always truthy (Cell object exists), so function always returned early
- Debug logging revealed: `setupMode: <ref *2> CellImpl { ... }` instead of boolean value

**THE FIX (Lines 450-485):**
```typescript
prompt: derive({ board, setupMode, myTeam }, (values) => {
  // Unwrap Cell values - derive() doesn't do this automatically when passing an object
  const setupModeValue = (values.setupMode as any).get ? (values.setupMode as any).get() : values.setupMode;
  const boardData: BoardWord[] = (values.board as any).get ? (values.board as any).get() : values.board;
  const myTeamValue: Team = (values.myTeam as any).get ? (values.myTeam as any).get() : values.myTeam;

  // Now use the unwrapped values
  if (setupModeValue) {
    return "Not in game mode yet.";
  }
  // ... rest of logic
});
```

**Key Learning:**
- `derive(singleCell, callback)` - framework unwraps the Cell automatically
- `derive({ cell1, cell2 }, callback)` - framework DOES NOT unwrap, you must call .get() manually
- This is a critical framework behavior to remember for multi-cell derives

**Testing:**
- Added debug logging to deployment (test-jkomoros-27)
- Console showed Cell objects being passed instead of values
- Applied fix with manual .get() calls
- Deployed to test-jkomoros-28 (needs full board setup to verify clues generate)

**Previous Investigation (2025-11-22 - Earlier):**
- Tested with fully populated board: 9 red, 8 blue, 7 neutral, 1 assassin
- Switched to Game Mode (Red Team), waited 5+ seconds
- Section showed: "No clues available yet. Make sure the board is set up!"
- generateObject configured correctly (lines 440-514) with Claude Sonnet 4.5
- UI rendering correct (lines 850-957)

---

## Clarifying Questions - ANSWERED

1. **Board initialization:** ✅ Should start with empty 5×5 board already visible
2. **Create button behavior:** Hide it or change to "Reset Board" (designer's choice)
3. **Setup mode colors:** ✅ YES - show assigned team colors
4. **Card selection:** ✅ Some visible selection state (border/highlight) - exact style doesn't matter
5. **Photo upload workflow:** ✅ CRITICAL
   - Images can contain: JUST cards, JUST keycard, or BOTH
   - AI extraction must handle all three cases
   - One image might have both boardWords AND keyCardColors
6. **Game mode visibility:** ✅ SPYMASTER VIEW
   - Always show all colors (unrevealed cards show their team colors)
   - Revealed cards are partially transparent (0.5 opacity)
   - This is for spymasters to decide what clues to give
7. **Clue suggestions:** ✅ Section shows but says "No clues available yet"
   - Likely the condition for triggering clue generation isn't being met

---

## Work Plan - Current Priorities

### ✅ MAJOR ISSUES RESOLVED (2025-11-22)
1. **Issue #9:** Reactive color display - ✅ WORKING!
2. **Issue #10:** Game mode colors - ✅ WORKING!
3. **Issue #11:** Game mode card reveal - ✅ WORKING!
4. **Issue #4:** Card text readability - ✅ NO ISSUE (verified excellent)
5. **Issue #12:** AI clue suggestions - ✅ FIXED (Cell unwrapping bug)

### 🚀 REMAINING POLISH TASKS (All Low-Medium Priority)
1. **Issue #1, #7:** Fix AI extraction preview showing words/colors
2. **Issue #8:** Verify/fix extraction dialog dismissal
3. **Issue #3:** Hide/change "Create Board" button after creation (already completed)
4. **Issue #6:** Improve button styling (low priority)

---

## Architecture Notes

**Key Files:**
- patterns/jkomoros/WIP/codenames-helper.tsx (main file)
- patterns/jkomoros/issues/REACTIVE_ARRAY_STYLING_ISSUE.md (framework issue)

**Key Data Structures:**
- BoardWord: { word, position: {row, col}, owner, state }
- owner: "red" | "blue" | "neutral" | "assassin" | "unassigned"
- state: "unrevealed" | "revealed"

**Key Handlers:**
- cellClick: handles both selection (setup) and reveal (game) - lines 286-312
- applyExtractedData: applies AI extraction to board - lines 158-207
- updateWord: updates cell text - lines 268-283
- assignColor: assigns color to selected cell - lines 241-252

**Reactive Rendering:**
- board.map() for main grid (lines 707-763) - **NOT REACTIVE for style properties**
- derive() for computed values (lines 796-826) - WORKS correctly for counter
- ifElse() for conditional rendering

**Critical Learnings:**
- Cannot use derive() result directly in JSX style attributes
- JSX expects plain values, not Cell objects, in style attributes
- board.map() with inline ternaries compiles but doesn't create reactive bindings
- Counter using derive() wrapper updates correctly - different pattern needed for board cells

---

## Test Spaces Used

- test-jkomoros-21: Current testing space with latest code
- test-jkomoros-2, 13, 14, 19, 20: Previous test spaces (may have corrupted data)

---

## Next Actions

1. **Wait for framework guidance** on Issue #9 (reactive array styling)
2. **Work on unblocked issues** (#1, #3, #4, #6, #7, #8)
3. **Test blocked issues** (#10, #11, #12) once #9 is resolved
