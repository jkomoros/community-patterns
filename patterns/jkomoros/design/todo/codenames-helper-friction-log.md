# Codenames Helper - UX Friction Log & Improvement Ideas

**Date:** 2025-11-22
**Status:** Pattern fully functional, bugs fixed. This doc contains PM-level UX improvement ideas.

## Core Bug Status: ✅ ALL FIXED

All critical bugs resolved (see codenames-helper.md for details):
- Board renders correctly
- Colors display in Setup and Game modes
- AI clue suggestions work
- Photo extraction works

## Optional UX Improvements (P1-P2)

### Quick Wins (P1)

1. **Add onboarding tooltip or modal**
   - First-time user: 30-second explanation
   - Two workflows: Manual setup or AI photo upload

2. **Improve mode toggle clarity**
   - Add icons: 🔧 Setup Mode | 🎮 Game Mode
   - Subtitle: "Set up board & colors" | "Get AI clue suggestions"

3. **Add contextual help text**
   - Small "?" icons next to terms like "assassin", "neutral"
   - Hover to see explanation

4. **Improve AI upload section**
   - Add "See example" button showing sample photos
   - Clarify: "Upload board photo, keycard photo, or both"

### Strategic Improvements (P2)

5. **Progressive disclosure**
   - Start simple: Just board grid + "enter words" prompt
   - After words entered: Reveal color assignment
   - After colors assigned: Reveal game mode option

6. **Smart defaults and automation**
   - Auto-detect when board fully set up (25 words, valid color distribution)
   - Suggest "Looks like you're ready for Game Mode!"

7. **Validation and error prevention**
   - Warn if color distribution doesn't match Codenames rules (9-8-7-1)
   - Highlight duplicate words as you type

### Future Ideas (P3)

8. Save/load boards
9. AI-powered word suggestions for filling the board
10. Multi-player support (spymaster + players see different views)
11. Post-game analytics

## File Location
`patterns/jkomoros/WIP/codenames-helper.tsx`
