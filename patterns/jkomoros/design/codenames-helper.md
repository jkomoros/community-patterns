# Codenames Clue Helper - Design Doc

## Overview

A Codenames spymaster assistant that helps generate optimal clues for your team while avoiding conflicts with opponent's words and the assassin card.

## Background: Codenames Game Rules

**Game Setup:**
- 5×5 grid of 25 word cards
- Two teams: Red and Blue
- Each team has a Spymaster who sees the key card
- Key card shows which words belong to: Red team (8-9 words), Blue team (8-9 words), Neutral (7 words), Assassin (1 word)
- One team has 9 words (goes first), other has 8

**Gameplay:**
- Spymaster gives a one-word clue + number (e.g., "ANIMAL 3")
- The number indicates how many words on the board relate to that clue
- Operatives try to guess those words
- Turn ends when: wrong word guessed, passed, or all clues found
- Win: Reveal all your team's words first
- Lose: Reveal the assassin word

## User Story

As a Codenames spymaster, I want to:
1. Input the board state (5×5 word grid) via photo or manual entry
2. Input the key card showing which words are mine/theirs/neutral/assassin
3. Select my team (red or blue)
4. See which words have been revealed (by both teams)
5. Get AI-generated clue suggestions with explanations
6. Understand potential conflicts or risks with each clue
7. Track the game state as guesses are made

## Core Features

### 1. Board Input
**Options:**
- **Manual Entry**: Text input for 25 words in 5×5 grid
- **Image Input**: Use `ct-image-input` to photograph the board
  - Vision model extracts words and positions
  - User can correct any OCR errors

### 2. Key Card Input
**Options:**
- **Manual Assignment**: Click/tap each word to assign team (red/blue/neutral/assassin)
- **Image Input**: Photograph the key card
  - Vision model interprets the color pattern
  - Map pattern to word positions
  - User confirms/corrects mapping

### 3. Team Selection
- Toggle between Red Team and Blue Team
- Clear visual indicator of current team

### 4. Game State Tracking
**Board State:**
- Unrevealed words (default state)
- Revealed by my team (success)
- Revealed by opponent (their words or mistakes)
- Assassin status (game over if revealed)

**Turn Tracking:**
- Which team's turn is it
- Previous clues given (optional history)

### 5. Clue Generation
**Input:**
- Current board state
- My team's unrevealed words
- Opponent's unrevealed words
- Neutral words
- Assassin word

**Output:**
- Suggested clue word + number
- Which of my words it targets
- Explanation of connection
- Risk analysis (words to avoid, potential confusion)
- Multiple options ranked by quality

**Example Output:**
```
Clue: "SPACE 3"
Targets: ROCKET, STAR, MOON
Reasoning: All relate to outer space/astronomy
Risks:
  ⚠️ PLANET is neutral (might be guessed)
  ✓ No opponent words strongly associated
  ✓ Assassin word (WATER) not related
```

### 6. Conflict Analysis
For each potential clue, show:
- ✅ Strong match: My team's words that fit
- ⚠️ Weak match: Words that might confuse
- ❌ Danger: Opponent words or assassin that relate

## Technical Architecture

### Data Model

```typescript
type Team = "red" | "blue";
type WordState = "unrevealed" | "revealed";
type WordOwner = "red" | "blue" | "neutral" | "assassin";

interface BoardWord {
  word: string;
  position: { row: number; col: number }; // 0-4 for 5×5
  owner: WordOwner;
  state: WordState;
}

interface GameState {
  board: BoardWord[]; // 25 words
  myTeam: Team;
  currentTurn: Team;
  gameOver: boolean;
  winner?: Team;
}

interface ClueRecommendation {
  clue: string;
  number: number;
  targetWords: string[];
  reasoning: string;
  risks: {
    opponent: string[];  // Opponent words that might fit
    neutral: string[];   // Neutral words that might fit
    assassin: boolean;   // Does assassin word fit?
  };
  confidence: number; // 0-1 score
}
```

### UI Components

**1. Board View**
- 5×5 grid of word cards
- Color coding: Red, Blue, Neutral, Unknown (before reveal)
- Revealed/unrevealed state
- Tap to toggle revealed state

**2. Setup Panel**
- Team selector (Red/Blue toggle)
- Input mode selector (Manual/Camera)
- "Start Game" button

**3. Input Modes**

**Manual Input:**
- 25 text fields in 5×5 grid
- Color assignment interface (tap word → select color)
- Or: bulk text input (25 words, one per line)

**Camera Input:**
- ct-image-input for board photo
- ct-image-input for key card photo
- Confirmation/correction UI

**4. Clue Assistant Panel**
- "Generate Clues" button
- List of clue recommendations
- Expandable details for each clue
- Risk indicators (color-coded)

**5. Game Controls**
- "Reveal Word" action
- "Mark as Opponent's Guess" action
- "Undo Last Reveal"
- "Reset Game"

### LLM Integration

Use `generateObject` to:
1. **Extract Board from Image**: Parse words from photo
2. **Extract Key from Image**: Interpret color pattern
3. **Generate Clues**: Suggest optimal clues given game state

**Prompt Strategy for Clue Generation:**
```
You are a Codenames spymaster. Generate clues for [RED/BLUE] team.

Your words (unrevealed): [list]
Opponent words (unrevealed): [list]
Neutral words: [list]
Assassin word: [word]

Generate 3 clue suggestions. Each clue should:
- Connect 2-4 of your team's words
- Avoid association with opponent/neutral/assassin words
- Be a single word (proper noun ok per standard rules)
- Include explanation and risk analysis
```

## Open Questions

Before implementing, I need clarification on:

### 1. Image Input Scope
- **Board Photo**: Should we support taking one photo of the entire 5×5 board, or do you want to photograph individual cards?
- **Key Card**: Is this a separate physical card that shows the color pattern, or something else?
- **OCR Expectations**: How much error correction UI do we need if OCR gets words wrong?

### 2. Game State Management
- **Multiple Games**: Should users be able to save/load multiple game sessions, or is this single-session only?
- **Turn Tracking**: Do we need to track which team's turn it is, or just focus on generating clues for "my team"?
- **History**: Should we show previous clues given this game (for context)?

### 3. User Role
- **Spymaster Only**: Is this only for the spymaster role (who sees the key), or should it also support operative mode (team members guessing)?
- **Both Teams**: Could the same device be used by both spymasters (switching teams between turns), or is this for one spymaster per game?

### 4. Clue Generation Preferences
- **Risk Tolerance**: Should users be able to set preferences (aggressive clues connecting 4 words vs. safe clues connecting 2)?
- **Clue Validation**: Should we validate that clues follow Codenames rules (single word, not on the board, etc.)?
- **Manual Override**: Can users input their own clue and get risk analysis on it?

### 5. UI/UX Priorities
- **Mobile First**: Should this be optimized for phone use (taking photos of physical game)?
- **Desktop Support**: Or is this for online Codenames (screen-based)?
- **Reveal Animation**: Any special UI considerations for revealing words during play?

### 6. Advanced Features (Future)
Are any of these important for v1, or defer to later?
- Word relationship strength visualization (graph/network view)
- Statistical analysis (optimal clue length, risk scores)
- Export game summary/stats
- Multiplayer sync (both spymasters using same charm)
- Support for custom word lists or game variants

## Implementation Plan (Draft)

**Phase 1: Basic Manual Input**
1. Create board state data structure
2. Build 5×5 grid UI with manual word entry
3. Add color assignment interface for key card
4. Team selection toggle
5. Reveal/unrevel word interactions

**Phase 2: Clue Generation**
1. Implement LLM prompt for clue generation
2. Display clue recommendations
3. Add risk analysis visualization
4. Refine prompt based on testing

**Phase 3: Image Input**
1. Add ct-image-input for board
2. Implement vision-based word extraction
3. Add error correction UI
4. Add ct-image-input for key card
5. Implement pattern recognition for key

**Phase 4: Polish**
1. Add game state persistence
2. Improve mobile UX
3. Add game history/previous clues
4. Performance optimization

## Success Criteria

- ✅ Can input a full Codenames game (25 words + key) in under 2 minutes
- ✅ Generates 3+ relevant clue suggestions in under 5 seconds
- ✅ Clue recommendations avoid obvious conflicts (assassin, opponent words)
- ✅ UI clearly shows game state (revealed/unrevealed, team colors)
- ✅ Works smoothly on mobile device for physical gameplay

## Decisions

**Confirmed:**
1. ✅ v1 = Manual entry only; camera input in v2
2. ✅ Physical Codenames on table (not digital)
3. ✅ Phase order: Manual Input → LLM Clues → Camera → Polish
4. ✅ Single game session (no save/load for v1)
5. ✅ Support both AI-generated clues AND manual clue risk analysis
6. ✅ Develop in `patterns/jkomoros/WIP/codenames-helper.tsx`
7. ✅ Standard Codenames rules (not variants for v1)

## Implementation Roadmap

### Phase 1: Manual Input & Board State (Current)
- [x] Design doc
- [ ] Data model and types
- [ ] 5×5 grid UI with word input
- [ ] Team selection toggle
- [ ] Color assignment for each word (red/blue/neutral/assassin)
- [ ] Reveal/unrevealed state tracking
- [ ] Visual board with color coding
- [ ] Basic game controls (reset, reveal word)

### Phase 2: Clue Generation
- [ ] LLM integration for clue suggestions
- [ ] Display 3+ clue recommendations
- [ ] Risk analysis (opponent words, neutral, assassin)
- [ ] Manual clue input + analysis
- [ ] Clue validation (not on board, single word, etc.)

### Phase 3: Camera Input
- [ ] ct-image-input for board photo
- [ ] Vision-based word extraction
- [ ] OCR error correction UI
- [ ] ct-image-input for key card photo
- [ ] Pattern recognition for key card

### Phase 4: Polish
- [ ] Mobile UX optimization
- [ ] Game history (previous clues)
- [ ] Improved risk visualization
- [ ] Performance tuning
- [ ] Help/tutorial overlay

---

**Status**: Approved - Starting Phase 1 implementation
