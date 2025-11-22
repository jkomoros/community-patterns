# Codenames Helper - TODO & Work Log

## Current Status
Reactive color display is blocked by framework limitation. Issue documented for framework authors. Most core functionality working.

**Last Updated:** 2024-11-21

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
**Status:** NOT STARTED
**Priority:** LOW

**Problem:**
- After creating a board, the button still shows
- Should probably hide after board exists or change to "Reset Board"

**Questions for User:**
- Should this button hide after board creation?
- Or change to "Reset Board" / "New Board"?
- If reset, should it warn about losing current data?

---

### 4. Card Text Hard to Read in Setup Mode
**Status:** NOT STARTED
**Priority:** MEDIUM

**Problem:**
- Text in cards may be hard to read depending on assigned color
- Color logic: lines 715-721 (backgroundColor ternary)

**Investigation Needed:**
- Verify if this is actually a problem once colors work reactively
- May resolve itself when Issue #9-10 is fixed

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
**Status:** 🔴 BLOCKED - Framework Limitation CONFIRMED
**Priority:** HIGH
**Last Updated:** 2025-11-21

**Problem:**
- applyExtractedData handler correctly sets colors in board data
- Counter updates correctly (uses derive())
- Cell backgrounds remain gray - colors don't update reactively

**Root Cause:**
- Accessing array item properties (`word.owner`) in JSX style attributes within `.map()` doesn't create reactive bindings
- Counter works because it uses `derive(board, ...)` wrapper
- Board rendering uses direct `board.map()` with inline ternaries

**Attempts Made:**
1. derive() for pre-computed styles → not reactive
2. const variables inside .map() → not reactive
3. inline ternaries with board.map() → not reactive (current working code)
4. wrapping entire board in derive() → **Frame mismatch error** (CONFIRMED on 2025-11-21)

**Confirmed on 2025-11-21:**
- Attempted `derive(board, (boardData) => boardData.map(...JSX...))` to render entire cell JSX
- Results in "Frame mismatch" error on both `charm setsrc` and `charm new`
- Error occurs even on fresh test space (test-jkomoros-23)
- This confirms approach #4 is not viable

**Current Code:**
- Lines 774-830: board.map() with inline ternary for backgroundColor
- Line 848: derive() wrapper for counter (WORKS correctly)

**Issue Documented:**
- Full details in `patterns/jkomoros/issues/REACTIVE_ARRAY_STYLING_ISSUE.md`
- Minimal reproduction code provided for framework authors
- Awaiting framework guidance on correct reactive array pattern

**Testing:**
- Deployed to test-jkomoros-22
- Clicked cell 0,0, assigned red color
- Counter updated: "Red: 1, Unassigned: 24" ✓
- Cell background remained gray ✗

**Conclusion:**
All attempted reactive approaches either don't work or cause framework errors. This is a genuine framework limitation requiring upstream fixes.

---

### 10. Game Mode Doesn't Show Colors
**Status:** 🔴 BLOCKED BY ISSUE #9
**Priority:** HIGH

**Problem:**
- Same root cause as Issue #9 - reactive color display
- In game mode, colors should always be visible (spymaster view)
- Logic is correct, but reactivity doesn't work

**Testing Needed:**
- Once Issue #9 is resolved, verify colors show in game mode
- Verify revealed cards show with 0.5 opacity (line 720)

---

### 11. Clicking Cards in Game Mode Doesn't Mark Them Out
**Status:** NOT STARTED (BLOCKED BY ISSUE #9)
**Priority:** HIGH

**Problem:**
- Clicking cards should reveal them (fade opacity)
- Logic exists in cellClick handler (lines 299-311)
- But can't test until colors display correctly

**Investigation Needed:**
- Once Issue #9 is resolved, test game mode reveal
- Verify opacity changes from 1 to 0.5 when revealed

---

### 12. AI Clue Suggestions Don't Appear
**Status:** NOT STARTED (BLOCKED BY ISSUE #9)
**Priority:** MEDIUM

**Problem:**
- In game mode, AI clue suggestions should show
- Likely blocked because board data doesn't have proper color assignments
- derive() condition may not trigger correctly without colors

**Investigation Needed:**
- Check lines 440-514 (clueSuggestions generateObject)
- Check lines 1225-1332 (UI rendering of clue suggestions)
- Only runs when NOT in setupMode AND board has colors assigned

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

### ⏸️ BLOCKED - Awaiting Framework Guidance
1. **Issue #9:** Reactive color display - documented in issues/REACTIVE_ARRAY_STYLING_ISSUE.md
   - Need framework author guidance on correct pattern for reactive array item properties in JSX

### 🚀 CAN WORK ON NOW
2. **Issue #1, #7:** Fix AI extraction preview showing words/colors
3. **Issue #8:** Verify/fix extraction dialog dismissal
4. **Issue #3:** Hide/change "Create Board" button after creation
5. **Issue #4:** Verify text readability in setup mode
6. **Issue #6:** Improve button styling (low priority)

### ⏳ BLOCKED BY ISSUE #9
7. **Issue #10:** Game mode colors (depends on #9)
8. **Issue #11:** Game mode card reveal (depends on #9)
9. **Issue #12:** AI clue suggestions (depends on #9)

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
