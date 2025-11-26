# Codenames Helper - TODO

## Overview
Tool to help Codenames spymasters manage the game board, assign colors, and get AI-powered clue suggestions.

## Status: ✅ FULLY FUNCTIONAL

All core issues resolved:

- ✅ Board preview shows words correctly (Cell unwrapping fix)
- ✅ Pattern initializes with empty 5×5 board
- ✅ "Create 5×5 Game Board" button hides after creation
- ✅ Card text readable across all color schemes
- ✅ Card selection for manual color assignment works
- ✅ Photo extraction preview displays correctly
- ✅ Extraction dialog shows compact success after approval
- ✅ Colors display reactively in both Setup and Game modes
- ✅ Card reveal works in Game mode (opacity change)
- ✅ AI clue suggestions generate correctly (Cell unwrapping fix)
- ✅ generateObject() uses correct model name

## Key Technical Fixes

**derive() with object parameters doesn't auto-unwrap Cells:**
```typescript
derive({ board, setupMode, myTeam }, (values) => {
  // Must manually unwrap Cell values
  const setupModeValue = (values.setupMode as any).get ? (values.setupMode as any).get() : values.setupMode;
  // ... use unwrapped values
});
```

**Valid Anthropic model names:**
- `"anthropic:claude-sonnet-4-5"` ✅
- NOT `"claude-3-5-sonnet-20241022"` ❌

## Optional Polish (Low Priority)

- [ ] Issue #6: Improve approve/reject button styling to match color buttons

## File Location
`patterns/jkomoros/WIP/codenames-helper.tsx`
