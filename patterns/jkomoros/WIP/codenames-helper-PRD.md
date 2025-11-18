# Codenames Spymaster Helper - Product Requirements Document

## Overview
A digital helper tool for the Spymaster (clue-giver) in Codenames to track the game board and mark guessed cards.

## User Persona
**The Spymaster**: The player who has the key card and gives one-word clues to help their team guess the right words. They can see all card assignments but cannot speak except to give clues.

## Core Requirements

### 1. Setup Phase
**User Story**: As a Spymaster, I need to set up the game board to match the physical game.

**Features**:
- 5×5 grid of text input fields for entering the 25 words from the physical game
- Color assignment buttons (Red, Blue, Neutral, Assassin, Clear)
- Click a card, then click a color to assign it
- Color count display showing: Red: X, Blue: Y, Neutral: Z, Assassin: 1, Unassigned: W
- "Reset All Colors" button to start over if needed
- **Visual**: Assigned cards show their color as background with white text

**Typical Setup Flow**:
1. Click "Initialize Empty Board" to start fresh
2. Type each word from the physical game into the grid
3. Look at the key card
4. For each word, click the card then click the matching color button
5. Verify the color counts match the key card (typically 9-8-7-1 for Red-Blue-Neutral-Assassin)

### 2. Game Phase
**User Story**: As a Spymaster, I need to track which cards have been guessed while always seeing all colors.

**Critical Insight**: **The Spymaster ALWAYS sees the key card during the game.** Colors must remain visible at all times.

**Features**:
- Switch from "Setup Mode" to "Game Mode"
- **All card colors remain fully visible** (spymaster has the key card)
- Click cards to mark them as "guessed/revealed" (out of play)
- Guessed cards are visually distinct BUT still show their color:
  - Semi-transparent/faded appearance (opacity: 0.5)
  - This shows "this card is out of play" while keeping color visible
- Clicking an already-guessed card does nothing (can't un-guess)
- Hide the color assignment UI in Game Mode (not needed during play)

**Why This Matters**:
- Spymasters need to see ALL colors to plan clues
- Marking cards as guessed helps track which words are still "in play"
- Knowing what's been guessed affects which clues are viable

### 3. Team Selection
**User Story**: As a Spymaster, I need to identify which team I'm playing for.

**Features**:
- "Red Team" / "Blue Team" toggle buttons
- Visual indication of selected team
- Helps spymaster remember which color they need 9 of vs 8 of

## Visual Design

### Setup Mode
```
[Bright colored backgrounds]
Red card: #dc2626 background, white text
Blue card: #2563eb background, white text
Neutral card: #d4d4d8 background, black text
Assassin card: #000000 background, white text
Unassigned: #e5e7eb background, black text
Selected card: Blue border with glow effect
```

### Game Mode
```
[Same colors but with opacity for guessed cards]
Unrevealed card: Full opacity, same colors as Setup Mode
Revealed/Guessed card: 50% opacity, same colors (faded appearance)
```

## Non-Requirements
- **No hiding of colors** - Spymaster always sees everything
- No score tracking - physical game handles this
- No timer - external timer can be used
- No clue validation - Spymaster's responsibility
- No enforcement of game rules - trust the players

## Success Criteria
1. Can set up a complete board in < 2 minutes
2. Color assignments are clearly visible at all times
3. Easy to distinguish guessed vs unguessed cards
4. No confusion about what mode you're in
5. Helps Spymaster give better clues by tracking game state

## Future Enhancements (Out of Scope for V1)
- Export/import board state
- Multiple board layouts (5×4, 4×4, etc.)
- Clue history tracking
- Suggest possible clues based on remaining words
- Multi-language support
