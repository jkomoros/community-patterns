# Codenames Helper - TODO & Design Notes

**NOTE: DO NOT COMMIT THIS FILE**

## Current Status
Working on fixing multiple UX and functionality issues in the Codenames Helper pattern.

---

## Issues to Fix

### 1. Board Preview Shows Dashes Instead of Words (ORIGINAL TASK)
**Status:** INVESTIGATING
**Priority:** HIGH

**Problem:**
- When AI extracts board words from uploaded image, preview shows "—" for all 25 cells
- Text says "Board Preview: (25 words)" so data exists
- Preview uses: `result.boardWords.find((w: any) => w.row === row && w.col === col)`
- The `applyExtractedData` handler successfully uses the same data structure

**Things Tried:**
- Added console.log debugging (caused serialization errors)
- Added JSON.stringify to display data structure in UI (in progress)

**Next Steps:**
- Check the actual structure of result.boardWords[0] in UI
- Compare with how applyExtractedData accesses the data

**Design Notes:**
- The find() might be failing due to data structure mismatch
- Or reactive rendering timing issue

---

### 2. Pattern Should Initialize with Empty Board
**Status:** ✅ COMPLETED
**Priority:** MEDIUM

**Problem:**
- When pattern first loads, no board is shown
- User must click "Create 5×5 Game Board" button
- Should show empty board by default

**Failed Attempts:**
1. Using `typeof DEFAULT_EMPTY_BOARD` in Default<> type - doesn't work, typeof gives TYPE not VALUE
2. Using imperative `if (board.get().length === 0)` in pattern body - can't call .get() outside handlers/derive()

**Successful Solution:**
- Created derived cell: `const initializedBoard = derive(board, (boardData: BoardWord[]) => {...})`
- Returns `initializeEmptyBoard()` when board is empty, otherwise returns existing board data
- Use `initializedBoard` for all READ operations (display, color counter)
- Use original `board` for all WRITE operations (handlers)
- Lines changed: 324-329 (derive), 212 (board display), 332 (color counter)

**Testing:**
- Tested with Playwright in test-jkomoros-2 space
- Board shows 5×5 grid on page load without button click
- Color counter correctly shows "Unassigned: 25"
- Screenshot: board-initialization-success.png

---

### 3. "Create 5×5 Game Board" Button Persists After Creation
**Status:** NOT STARTED
**Priority:** LOW

**Problem:**
- After creating a board, the button still shows
- Confusing - user might think they need to click it again
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
- Text in cards is white on light background
- Hard to read

**Investigation Needed:**
- Check what's setting text color in setup mode
- Look at lines 728-748 (cell rendering)

**Questions for User:**
- What color scheme should setup mode use?
- Should it show colors like game mode, or use neutral colors?

---

### 5. Can't Select Cards to Apply Colors Manually
**Status:** NOT STARTED
**Priority:** HIGH

**Problem:**
- Text area takes up entire cell
- Clicking doesn't show selection state
- Can't select cards to color them

**Investigation Needed:**
- Check cellClick handler (lines 283-308)
- setupMode.get() should trigger selection
- selectedWordIndex should update
- Visual feedback for selection missing

**Questions for User:**
- Should selected card have a visible border/highlight?
- What color/style for selection indicator?
- Should clicking a selected card deselect it?

---

### 6. AI Upload Button Styling
**Status:** NOT STARTED
**Priority:** LOW

**Problem:**
- "Approve & Apply to board" and "Reject" buttons need better styling
- Currently just colored borders
- Should look like the assign colors buttons

**Design Notes:**
- Assign colors buttons use CSS classes: color-red, color-blue, etc.
- Could create similar classes for approve/reject
- Or use inline styles matching the pattern

---

### 7. Preview Doesn't Show Words or Colors
**Status:** IN PROGRESS
**Priority:** HIGH

**Problem:**
- Board preview: words show as dashes (see Issue #1)
- Key card preview: should show colors in 5×5 grid but may not be working

**Investigation Needed:**
- Board preview: see Issue #1
- Key card preview: Check lines 1073-1107

---

### 8. Extraction Dialog Doesn't Dismiss After Approval
**Status:** NOT STARTED
**Priority:** MEDIUM

**Problem:**
- When clicking "Approve & Apply to board", data is applied
- But the extraction dialog stays visible
- Should either disappear or show "Applied" status

**Investigation Needed:**
- Check applyExtractedData handler (lines 155-204)
- Sets approval.applied = true
- UI should check this and hide/change display

**Questions for User:**
- Should dialog disappear completely?
- Or show compact "Applied" confirmation?
- Current code shows compact message if applied (lines 981-997)

---

### 9. Colors Not Applied from AI Extraction
**Status:** NOT STARTED
**Priority:** HIGH

**Problem:**
- When accepting AI extraction, words appear but colors don't
- Color counter shows they weren't set

**Investigation Needed:**
- Check applyExtractedData handler lines 179-192
- Should apply keyCardColors if present
- Check if result has keyCardColors
- Check if board cells are updating correctly

**Questions for User:**
- When you upload a keycard photo, does it show up in a separate extraction result?
- Or are you uploading both board and keycard photos together?
- Should one extraction result contain both boardWords AND keyCardColors?

---

### 10. Game Mode Doesn't Show Colors
**Status:** NOT STARTED
**Priority:** HIGH

**Problem:**
- In game mode, can't see card colors
- Should show team colors (red/blue/neutral/assassin)

**Investigation Needed:**
- Check lines 728-748 (cell rendering)
- bgColor calculation seems correct
- Uses word.owner to determine color
- Check if setupMode affects color display

**Questions for User:**
- In game mode, should ALL cards show their colors?
- Or only revealed cards?
- Should unrevealed cards be neutral until clicked?

---

### 11. Clicking Cards in Game Mode Doesn't Mark Them Out
**Status:** NOT STARTED
**Priority:** HIGH

**Problem:**
- Clicking cards should reveal them (fade opacity)
- Not working

**Investigation Needed:**
- Check cellClick handler (lines 283-308)
- Lines 299-306 handle game mode clicks
- Should set state to "revealed"
- cellOpacity calculated at line 736 (0.5 for revealed, 1 for unrevealed)

---

### 12. AI Clue Suggestions Don't Appear
**Status:** NOT STARTED
**Priority:** MEDIUM

**Problem:**
- In game mode, AI clue suggestions should show
- Nothing appears

**Investigation Needed:**
- Check lines 436-510 (clueSuggestions generateObject)
- Check lines 150-256 (UI rendering of clue suggestions)
- Only runs when NOT in setupMode
- Check if derive() is triggering correctly

**Questions for User:**
- After setting up a board with colors, do you switch to Game Mode?
- Does the AI clue section show at all, or is it completely hidden?
- Any console errors related to clue generation?

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

7. **Clue suggestions:** ✅ Section shows but says "No clues available yet. Make sure the board is set up!"
   - Likely the condition for triggering clue generation isn't being met

---

## Work Plan - Priority Order

### Phase 1: Core Functionality (HIGH PRIORITY)
1. ✅ Initialize with empty board visible (Issue #2) - EASY
2. Fix card selection in setup mode (Issue #5) - Make clicking work and show selection state
3. Verify/fix colors showing properly (Issues #9, #10) - Core functionality
4. Fix game mode card reveal (Issue #11) - Click to mark revealed
5. Fix clue generation (Issue #12) - Depends on colors being set

### Phase 2: AI Extraction (HIGH PRIORITY)
6. Fix preview showing words (Issue #1, #7) - Original issue
7. Verify AI handles all three photo cases (board only, keycard only, both)
8. Fix extraction dialog dismissal (Issue #8)

### Phase 3: Polish (MEDIUM/LOW PRIORITY)
9. Fix text readability in setup mode (Issue #4)
10. Hide/change "Create Board" button after creation (Issue #3)
11. Improve button styling for approve/reject (Issue #6)

---

## Architecture Notes

**Key Files:**
- patterns/jkomoros/WIP/codenames-helper.tsx (main file)

**Key Data Structures:**
- BoardWord: { word, position: {row, col}, owner, state }
- owner: "red" | "blue" | "neutral" | "assassin" | "unassigned"
- state: "unrevealed" | "revealed"

**Key Handlers:**
- cellClick: handles both selection (setup) and reveal (game)
- applyExtractedData: applies AI extraction to board
- updateWord: updates cell text
- assignColor: assigns color to selected cell

**Reactive Rendering:**
- board.map() for main grid (lines 703-790)
- derive() for computed values
- ifElse() for conditional rendering
