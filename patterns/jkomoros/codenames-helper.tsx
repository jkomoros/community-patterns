/// <cts-enable />
import { Cell, computed, Default, generateObject, handler, ifElse, ImageData, NAME, pattern, toSchema, UI } from "commontools";

// ===== TYPE DEFINITIONS =====

type Team = "red" | "blue";
type WordOwner = "red" | "blue" | "neutral" | "assassin" | "unassigned";
type WordState = "unrevealed" | "revealed";

interface BoardWord {
  word: string;
  position: { row: number; col: number }; // 0-4 for 5×5 grid
  owner: WordOwner;
  state: WordState;
}

// TypeScript interfaces for AI extraction
interface BoardWordData {
  word: string;
  row: number;
  col: number;
}

interface KeyCardColorData {
  row: number;
  col: number;
  color: "red" | "blue" | "neutral" | "assassin";
}

interface PhotoExtractionResult {
  photoType: "board" | "keycard" | "unknown";
  boardWords?: BoardWordData[];
  keyCardColors?: KeyCardColorData[];
  confidence?: "high" | "medium" | "low";
  notes?: string;
}

// TypeScript interfaces for AI clue suggestions
interface ClueIdea {
  clue: string;
  number: number;
  targetWords: string[];
  reasoning: string;
}

interface ClueSuggestionsResult {
  clues: ClueIdea[];
}

// MANUAL JSON SCHEMAS with $defs - workaround for toSchema<T>() limitation
// toSchema<T>() fails to generate complete schemas with nested arrays
// See: patterns/jkomoros/issues/ISSUE-toSchema-Nested-Type-Arrays.md

const PHOTO_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    photoType: {
      type: "string",
      enum: ["board", "keycard", "unknown"],
      description: "Type of photo: board (game board), keycard (key card), or unknown"
    },
    boardWords: {
      type: "array",
      description: "Array of 25 words from the game board (5×5 grid)",
      items: { $ref: "#/$defs/BoardWordData" }
    },
    keyCardColors: {
      type: "array",
      description: "Array of 25 color assignments from the key card (5×5 grid)",
      items: { $ref: "#/$defs/KeyCardColorData" }
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "Confidence level of the extraction"
    },
    notes: {
      type: "string",
      description: "Additional notes or observations about the extraction"
    }
  },
  required: ["photoType"],
  $defs: {
    BoardWordData: {
      type: "object",
      properties: {
        word: {
          type: "string",
          description: "The word on the card (uppercase)"
        },
        row: {
          type: "number",
          description: "Row position (0-4, top to bottom)"
        },
        col: {
          type: "number",
          description: "Column position (0-4, left to right)"
        }
      },
      required: ["word", "row", "col"]
    },
    KeyCardColorData: {
      type: "object",
      properties: {
        row: {
          type: "number",
          description: "Row position (0-4, top to bottom)"
        },
        col: {
          type: "number",
          description: "Column position (0-4, left to right)"
        },
        color: {
          type: "string",
          enum: ["red", "blue", "neutral", "assassin"],
          description: "Color/team assignment for this position"
        }
      },
      required: ["row", "col", "color"]
    }
  }
} as const;

const CLUE_SUGGESTIONS_SCHEMA = {
  type: "object",
  properties: {
    clues: {
      type: "array",
      description: "Array of 3 clue suggestions for the spymaster",
      items: { $ref: "#/$defs/ClueIdea" }
    }
  },
  required: ["clues"],
  $defs: {
    ClueIdea: {
      type: "object",
      properties: {
        clue: {
          type: "string",
          description: "The one-word clue (no hyphens, spaces, or compound words)"
        },
        number: {
          type: "number",
          description: "Number of words this clue connects (typically 2-4)"
        },
        targetWords: {
          type: "array",
          items: { type: "string" },
          description: "List of target words this clue is meant to connect"
        },
        reasoning: {
          type: "string",
          description: "Explanation of why this clue connects these words"
        }
      },
      required: ["clue", "number", "targetWords", "reasoning"]
    }
  }
} as const;

// ===== HELPER FUNCTIONS =====

// Initialize empty 5×5 board
function initializeEmptyBoard(): BoardWord[] {
  const board: BoardWord[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      board.push({
        word: "",
        position: { row, col },
        owner: "unassigned",
        state: "unrevealed",
      });
    }
  }
  return board;
}

interface CodenamesHelperInput {
  board?: Cell<Default<BoardWord[], typeof DEFAULT_EMPTY_BOARD>>;
  myTeam?: Cell<Default<Team, "red">>;
  setupMode?: Cell<Default<boolean, true>>;
  selectedWordIndex?: Cell<Default<number, 999>>;
}

// Initialize once for default
const DEFAULT_EMPTY_BOARD = initializeEmptyBoard();

interface CodenamesHelperOutput {
  board: Cell<BoardWord[]>;
  myTeam: Cell<Team>;
  setupMode: Cell<boolean>;
  selectedWordIndex: Cell<number>;
}

// Validation result structure
interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

// Validate extracted data for coherence
function validateExtraction(result: any): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!result) {
    return { isValid: false, warnings, errors: ["No extraction result"] };
  }

  // Validate board words
  if (result.photoType === "board" && result.boardWords) {
    const words = result.boardWords;

    // Check count
    if (words.length !== 25) {
      errors.push(`Expected 25 words, found ${words.length}`);
    }

    // Check for duplicates
    const wordTexts = words.map((w: any) => w.word.toUpperCase());
    const duplicates = wordTexts.filter((word: string, idx: number) =>
      wordTexts.indexOf(word) !== idx
    );
    if (duplicates.length > 0) {
      warnings.push(`Duplicate words found: ${[...new Set(duplicates)].join(", ")}`);
    }

    // Check for empty words
    const emptyCount = words.filter((w: any) => !w.word || w.word.trim() === "").length;
    if (emptyCount > 0) {
      warnings.push(`${emptyCount} empty word(s) detected`);
    }
  }

  // Validate key card colors
  if (result.photoType === "keycard" && result.keyCardColors) {
    const colors = result.keyCardColors;

    // Check count
    if (colors.length !== 25) {
      errors.push(`Expected 25 color assignments, found ${colors.length}`);
    }

    // Count by color
    const counts: Record<string, number> = {
      red: 0,
      blue: 0,
      neutral: 0,
      assassin: 0,
    };
    colors.forEach((c: any) => {
      if (counts[c.color] !== undefined) {
        counts[c.color]++;
      }
    });

    // Valid patterns: (9,8,7,1) or (8,9,7,1)
    const validPattern1 = counts.red === 9 && counts.blue === 8 && counts.neutral === 7 && counts.assassin === 1;
    const validPattern2 = counts.red === 8 && counts.blue === 9 && counts.neutral === 7 && counts.assassin === 1;

    if (!validPattern1 && !validPattern2) {
      warnings.push(
        `Unusual color distribution: ${counts.red} red, ${counts.blue} blue, ${counts.neutral} neutral, ${counts.assassin} assassin. ` +
        `Expected: (9 red, 8 blue, 7 neutral, 1 assassin) or (8 red, 9 blue, 7 neutral, 1 assassin)`
      );
    }

    if (counts.assassin !== 1) {
      errors.push(`Expected exactly 1 assassin, found ${counts.assassin}`);
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}


// Get color for word based on owner
function getWordColor(owner: WordOwner): string {
  switch (owner) {
    case "red": return "#dc2626";
    case "blue": return "#2563eb";
    case "neutral": return "#d4d4d8";
    case "assassin": return "#000000";
    case "unassigned": return "#e5e7eb";
  }
}

// Get background color for word based on owner
// Spymaster ALWAYS sees all colors (they have the key card)
function getWordBackgroundColor(owner: WordOwner): string {
  return getWordColor(owner);
}

// ===== HANDLERS =====

// Apply extracted board data from AI (after approval)
const applyExtractedData = handler<
  unknown,
  { board: Cell<BoardWord[]>; extraction: any; approvalState: Cell<Array<{ correctionText: string; applied: boolean }>>; idx: number }
>((_event, { board, extraction, approvalState, idx }) => {
  if (!extraction || !extraction.result) return;

  const result = extraction.result;
  const currentBoard = board.get().slice();

  // Apply board words if available
  if (result.boardWords && result.boardWords.length > 0) {
    result.boardWords.forEach((wordData: any) => {
      const index = currentBoard.findIndex((w: BoardWord) =>
        w.position.row === wordData.row && w.position.col === wordData.col
      );
      if (index >= 0) {
        currentBoard[index] = {
          ...currentBoard[index],
          word: wordData.word.toUpperCase()
        };
      }
    });
  }

  // Apply key card colors if available
  if (result.keyCardColors && result.keyCardColors.length > 0) {
    result.keyCardColors.forEach((colorData: any) => {
      const index = currentBoard.findIndex((w: BoardWord) =>
        w.position.row === colorData.row && w.position.col === colorData.col
      );
      if (index >= 0) {
        currentBoard[index] = {
          ...currentBoard[index],
          owner: colorData.color as WordOwner
        };
      }
    });
  }

  board.set(currentBoard);

  // Mark as approved/applied
  const currentApprovals = approvalState.get().slice();
  // Extend array if needed
  while (currentApprovals.length <= idx) {
    currentApprovals.push({ correctionText: "", applied: false });
  }
  currentApprovals[idx] = { ...currentApprovals[idx], applied: true };
  approvalState.set(currentApprovals);
});

// Reject extraction
const rejectExtraction = handler<
  unknown,
  { uploadedPhotos: Cell<ImageData[]>; idx: number; approvalState: Cell<Array<{ correctionText: string; applied: boolean }>> }
>((_event, { uploadedPhotos, idx, approvalState }) => {
  // Remove from uploaded photos
  const photos = uploadedPhotos.get().slice();
  photos.splice(idx, 1);
  uploadedPhotos.set(photos);

  // Remove from approval state
  const approvals = approvalState.get().slice();
  approvals.splice(idx, 1);
  approvalState.set(approvals);
});

// Update correction text
const updateCorrectionText = handler<
  any,
  { approvalState: Cell<Array<{ correctionText: string; applied: boolean }>>; idx: number }
>((event, { approvalState, idx }) => {
  const text = event.target.value;
  const currentApprovals = approvalState.get().slice();
  // Extend array if needed
  while (currentApprovals.length <= idx) {
    currentApprovals.push({ correctionText: "", applied: false });
  }
  currentApprovals[idx] = { ...currentApprovals[idx], correctionText: text };
  approvalState.set(currentApprovals);
});

// Assign color to selected word
const assignColor = handler<
  unknown,
  { board: Cell<BoardWord[]>; selectedWordIndex: Cell<number>; owner: WordOwner }
>((_event, { board, selectedWordIndex, owner }) => {
  const selIdx = selectedWordIndex.get();
  if (selIdx >= 0 && selIdx < 25) {
    const currentBoard = board.get().slice();
    currentBoard[selIdx] = { ...currentBoard[selIdx], owner };
    board.set(currentBoard);
    selectedWordIndex.set(999); // Deselect after assigning
  }
});

// Reset all word colors to unassigned
const resetAllColors = handler<
  unknown,
  { board: Cell<BoardWord[]>; selectedWordIndex: Cell<number> }
>((_event, { board, selectedWordIndex }) => {
  const currentBoard = board.get().slice();
  for (let i = 0; i < currentBoard.length; i++) {
    currentBoard[i] = { ...currentBoard[i], owner: "unassigned" };
  }
  board.set(currentBoard);
  selectedWordIndex.set(999);
});

// Update word text in a cell
const updateWord = handler<
  any,
  { board: Cell<BoardWord[]>; row: number; col: number }
>((event, { board, row, col }) => {
  const text = event.target.value;
  const currentBoard = board.get().slice();
  // Find index by position (stable identifier)
  const index = currentBoard.findIndex((el: BoardWord) =>
    el.position.row === row && el.position.col === col
  );

  if (index < 0) return; // Safety check

  currentBoard[index] = { ...currentBoard[index], word: text.toUpperCase() };
  board.set(currentBoard);
});

// Handle cell click (setup mode: select, play mode: reveal)
const cellClick = handler<
  unknown,
  { board: Cell<BoardWord[]>; setupMode: Cell<boolean>; selectedWordIndex: Cell<number>; row: number; col: number }
>((_event, { board, setupMode, selectedWordIndex, row, col }) => {
  const currentBoard = board.get();

  // Find index by position (stable identifier)
  const index = currentBoard.findIndex((el: BoardWord) =>
    el.position.row === row && el.position.col === col
  );

  if (index < 0) return; // Safety check

  if (setupMode.get()) {
    // In setup mode: select this word for color assignment
    selectedWordIndex.set(index);
  } else {
    // In play mode: reveal the word
    if (currentBoard[index].state === "unrevealed") {
      // Create new array and update the item
      const updatedBoard = currentBoard.map((word, i) =>
        i === index ? { ...word, state: "revealed" as WordState } : word
      );
      board.set(updatedBoard);
    }
  }
});

// Initialize board with empty cells
const initializeBoardHandler = handler<
  unknown,
  { board: Cell<BoardWord[]>; setupMode: Cell<boolean> }
>((_event, { board, setupMode }) => {
  board.set(initializeEmptyBoard());
  setupMode.set(true);
});

// ===== MAIN PATTERN =====

export default pattern<CodenamesHelperInput, CodenamesHelperOutput>(
  ({ board, myTeam, setupMode, selectedWordIndex }) => {
    // Note: board starts empty, user must click "Create Board" or it initializes on first interaction

    // Image upload for board and key card
    const uploadedPhotos = Cell.of<ImageData[]>([]);

    // Approval state for each photo (tracks corrections, approval status)
    const approvalState = Cell.of<Array<{
      correctionText: string;
      applied: boolean;
    }>>([]);

    // AI extraction for each uploaded photo
    // Note: uploadedPhotos.map() returns reactive values
    // Use computed() to reactively access properties like photo.data
    const photoExtractions = uploadedPhotos.map((photo) => {
      return generateObject({
        model: "anthropic:claude-sonnet-4-5",
        system: `You are an image analysis assistant for a Codenames board game. Your job is to analyze photos and extract information.

You will receive either:
1. A photo of the game board (5×5 grid of 25 word cards)
2. A photo of the key card (showing which words are red, blue, neutral, or assassin)

IMPORTANT: Determine which type of photo this is and extract the appropriate information.

If the user provides a correction, apply it to your previous extraction. The user may describe positions using natural language like:
- "top left" = row 0, col 0
- "top right" = row 0, col 4
- "bottom left" = row 4, col 0
- "bottom right" = row 4, col 4
- "middle" or "center" = row 2, col 2
- "second row, third column" = row 1, col 2
Parse these descriptions and update the extraction accordingly.`,

        // Use computed() to access photo properties reactively
        prompt: computed(() => {
          // Check if data is available
          if (!photo?.data) {
            return "Waiting for image data...";
          }

          // Return the multipart prompt
          return [
            { type: "image" as const, image: photo.data },
            {
              type: "text" as const,
              text: `Analyze this photo and determine if it shows:
A) The game board (25 word cards in a 5×5 grid)
B) The key card (showing color assignments)

If it's a BOARD photo:
- Extract all 25 words in their exact grid positions (row 0-4, col 0-4)
- Start from top-left (0,0) and go row by row
- Keep words in UPPERCASE

If it's a KEY CARD photo:
- The key card shows colored squares representing the word assignments
- Extract the color pattern (red/blue/neutral/assassin) for each position
- Match the grid layout (5×5)
- Red and blue squares indicate team words
- Beige/tan squares indicate neutral words
- Black square indicates the assassin

Provide the extracted information in the appropriate format.`
            }
          ];
        }),
        // Try using toSchema<T>() now that we have model parameter
        schema: toSchema<PhotoExtractionResult>()
      });
    });

    // AI Clue Suggestions - only in Game Mode
    const clueSuggestions = generateObject({
      model: "anthropic:claude-sonnet-4-5",
      system: `You are a Codenames spymaster assistant. Your job is to suggest clever clues that connect multiple words of the same team.

CRITICAL RULES:
1. Clues must be ONE WORD only (no hyphens, spaces, or compound words)
2. Clues should connect 2-4 words of the target team's color
3. AVOID clues that might lead players to opponent words, neutral words, or the assassin
4. Only suggest clues for UNREVEALED words
5. Be creative with connections (synonyms, categories, rhymes, cultural references)`,

      prompt: computed(() => {
        // Pattern inputs auto-unwrap in computed()
        // setupMode, board, myTeam are Cell types - use .get() for local cells, direct access for pattern inputs
        const setupModeValue = setupMode.get();
        const boardData = board.get();
        const myTeamValue = myTeam.get();

        // Only run in Game Mode
        if (setupModeValue) {
          return "Not in game mode yet.";
        }

        // Get unrevealed words by team
        const myWords = boardData.filter((w: BoardWord) => w.owner === myTeamValue && w.state === "unrevealed").map((w: BoardWord) => w.word);
        const opponentTeam = myTeamValue === "red" ? "blue" : "red";
        const opponentWords = boardData.filter((w: BoardWord) => w.owner === opponentTeam && w.state === "unrevealed").map((w: BoardWord) => w.word);
        const neutralWords = boardData.filter((w: BoardWord) => w.owner === "neutral" && w.state === "unrevealed").map((w: BoardWord) => w.word);
        const assassinWords = boardData.filter((w: BoardWord) => w.owner === "assassin" && w.state === "unrevealed").map((w: BoardWord) => w.word);

        if (myWords.length === 0) return "No more words to guess for your team!";

        return `Team: ${myTeamValue.toUpperCase()}

MY TEAM'S UNREVEALED WORDS (try to connect these):
${myWords.join(", ")}

OPPONENT'S WORDS (AVOID these):
${opponentWords.join(", ")}

NEUTRAL WORDS (AVOID these):
${neutralWords.join(", ")}

ASSASSIN WORD (CRITICAL - NEVER hint at this):
${assassinWords.join(", ")}

Suggest 3 creative one-word clues that connect 2-4 of MY team's words while avoiding all other words.`;
      }),
      // Try using toSchema<T>() now that we have model parameter
      schema: toSchema<ClueSuggestionsResult>()
    });

    return {
      [NAME]: "Codenames Helper",
      [UI]: (
        <div style={{
          padding: "1rem",
          fontFamily: "system-ui, sans-serif",
          maxWidth: "600px",
          margin: "0 auto",
        }}>
          <style>{`
            /* Team selection buttons */
            ct-button.team-red-active::part(button) {
              background-color: #dc2626;
              color: white;
              border: 2px solid #dc2626;
              border-radius: 0.375rem;
              font-weight: 600;
              padding: 0.5rem 1rem;
            }
            ct-button.team-red-inactive::part(button) {
              background-color: #f3f4f6;
              color: #000;
              border: 2px solid #dc2626;
              border-radius: 0.375rem;
              font-weight: 600;
              padding: 0.5rem 1rem;
            }
            ct-button.team-blue-active::part(button) {
              background-color: #2563eb;
              color: white;
              border: 2px solid #2563eb;
              border-radius: 0.375rem;
              font-weight: 600;
              padding: 0.5rem 1rem;
            }
            ct-button.team-blue-inactive::part(button) {
              background-color: #f3f4f6;
              color: #000;
              border: 2px solid #2563eb;
              border-radius: 0.375rem;
              font-weight: 600;
              padding: 0.5rem 1rem;
            }

            /* Mode toggle buttons */
            ct-button.mode-setup::part(button) {
              background-color: #8b5cf6;
              color: white;
              border-radius: 0.375rem;
              font-weight: 600;
              padding: 0.5rem 1rem;
            }
            ct-button.mode-game::part(button) {
              background-color: #10b981;
              color: white;
              border-radius: 0.375rem;
              font-weight: 600;
              padding: 0.5rem 1rem;
            }

            /* Color assignment buttons */
            ct-button.color-red::part(button) {
              background-color: #dc2626;
              color: white;
              border: 2px solid #000;
              border-radius: 0.375rem;
              font-weight: 600;
              text-transform: capitalize;
              padding: 0.5rem 1rem;
            }
            ct-button.color-blue::part(button) {
              background-color: #2563eb;
              color: white;
              border: 2px solid #000;
              border-radius: 0.375rem;
              font-weight: 600;
              text-transform: capitalize;
              padding: 0.5rem 1rem;
            }
            ct-button.color-neutral::part(button) {
              background-color: #d4d4d8;
              color: #000;
              border: 2px solid #000;
              border-radius: 0.375rem;
              font-weight: 600;
              text-transform: capitalize;
              padding: 0.5rem 1rem;
            }
            ct-button.color-assassin::part(button) {
              background-color: #000000;
              color: white;
              border: 2px solid #000;
              border-radius: 0.375rem;
              font-weight: 600;
              text-transform: capitalize;
              padding: 0.5rem 1rem;
            }
            ct-button.color-clear::part(button) {
              background-color: #e5e7eb;
              color: #000;
              border: 2px solid #000;
              border-radius: 0.375rem;
              font-weight: 600;
              text-transform: capitalize;
              padding: 0.5rem 1rem;
            }

            /* Initialize button */
            ct-button.btn-initialize::part(button) {
              background-color: #3b82f6;
              color: white;
              border-radius: 0.5rem;
              font-weight: 600;
              padding: 1rem 2rem;
            }

            /* Reset button */
            ct-button.btn-reset::part(button) {
              background-color: #ef4444;
              color: white;
              border-radius: 0.375rem;
              font-weight: 600;
              padding: 0.5rem 1rem;
            }
          `}</style>

          {/* Header */}
          <div style={{
            marginBottom: "1rem",
            textAlign: "center",
          }}>
            <h1 style={{
              fontSize: "1.25rem",
              fontWeight: "bold",
              marginBottom: "0.5rem",
            }}>
              Codenames Spymaster Helper
            </h1>

            {/* Team Selection */}
            <div style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: "1rem",
            }}>
              <span style={{ fontWeight: "500" }}>My Team:</span>
              <ct-button
                onClick={() => myTeam.set("red")}
                className={myTeam.get() === "red" ? "team-red-active" : "team-red-inactive"}
              >
                Red Team
              </ct-button>
              <ct-button
                onClick={() => myTeam.set("blue")}
                className={myTeam.get() === "blue" ? "team-blue-active" : "team-blue-inactive"}
              >
                Blue Team
              </ct-button>
            </div>

            {/* Mode Toggle */}
            <ct-button
              onClick={() => setupMode.set(!setupMode.get())}
              className={setupMode.get() ? "mode-setup" : "mode-game"}
            >
              {setupMode.get() ? "Setup Mode" : "Game Mode"}
            </ct-button>
          </div>

          {/* Initialize Board Button - only show if board is empty */}
          {computed(() => {
            const boardData = board.get();
            // Check if board is initialized and is an array
            if (!boardData || !Array.isArray(boardData) || boardData.length === 0) {
              // Board not initialized or empty, show the button
              return (
                <div style={{
                  marginBottom: "1rem",
                  textAlign: "center",
                }}>
                  <ct-button
                    onClick={initializeBoardHandler({ board, setupMode })}
                    className="btn-initialize"
                  >
                    Create 5×5 Game Board
                  </ct-button>
                </div>
              );
            }

            // Board exists, check if it has content
            const hasContent = boardData.some((word) => word.word.trim() !== "");
            if (hasContent) return null;

            // Board exists but is empty, show the button
            return (
              <div style={{
                marginBottom: "1rem",
                textAlign: "center",
              }}>
                <ct-button
                  onClick={initializeBoardHandler({ board, setupMode })}
                  className="btn-initialize"
                >
                  Create 5×5 Game Board
                </ct-button>
              </div>
            );
          })}

          {/* Board Display */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "0.25rem",
            marginBottom: "1rem",
          }}>
            {board.map((word, index) => {
              return (
                <div
                  key={index}
                  style={
                    word.owner === "red"
                      ? {
                          aspectRatio: "1",
                          border: "2px solid #000",
                          borderRadius: "0.25rem",
                          padding: "0.25rem",
                          backgroundColor: "#dc2626",
                          opacity: word.state === "revealed" ? 0.2 : 1,
                          color: "white",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "center",
                          position: "relative",
                          cursor: "pointer",
                        }
                      : word.owner === "blue"
                      ? {
                          aspectRatio: "1",
                          border: "2px solid #000",
                          borderRadius: "0.25rem",
                          padding: "0.25rem",
                          backgroundColor: "#2563eb",
                          opacity: word.state === "revealed" ? 0.2 : 1,
                          color: "white",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "center",
                          position: "relative",
                          cursor: "pointer",
                        }
                      : word.owner === "neutral"
                      ? {
                          aspectRatio: "1",
                          border: "2px solid #000",
                          borderRadius: "0.25rem",
                          padding: "0.25rem",
                          backgroundColor: "#d4d4d8",
                          opacity: word.state === "revealed" ? 0.2 : 1,
                          color: "black",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "center",
                          position: "relative",
                          cursor: "pointer",
                        }
                      : word.owner === "assassin"
                      ? {
                          aspectRatio: "1",
                          border: "2px solid #000",
                          borderRadius: "0.25rem",
                          padding: "0.25rem",
                          backgroundColor: "#000000",
                          opacity: word.state === "revealed" ? 0.2 : 1,
                          color: "white",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "center",
                          position: "relative",
                          cursor: "pointer",
                        }
                      : {
                          aspectRatio: "1",
                          border: "2px solid #000",
                          borderRadius: "0.25rem",
                          padding: "0.25rem",
                          backgroundColor: "#e5e7eb",
                          opacity: word.state === "revealed" ? 0.2 : 1,
                          color: "black",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "center",
                          position: "relative",
                          cursor: "pointer",
                        }
                  }
                  onClick={cellClick({ board, setupMode, selectedWordIndex, row: word.position.row, col: word.position.col })}
                >
                {/* Word Display/Input */}
                {ifElse(
                  setupMode,
                  <input
                    type="text"
                    value={word.word}
                    placeholder={`${word.position.row},${word.position.col}`}
                    onChange={updateWord({ board, row: word.position.row, col: word.position.col })}
                    onClick={cellClick({ board, setupMode, selectedWordIndex, row: word.position.row, col: word.position.col })}
                    style={{
                      width: "90%",
                      height: "80%",
                      textAlign: "center",
                      fontSize: "0.7rem",
                      fontWeight: "600",
                      textTransform: "uppercase",
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      pointerEvents: "auto",
                    }}
                  />,
                  <span style={{
                    fontSize: "0.7rem",
                    fontWeight: "600",
                    textAlign: "center",
                    wordBreak: "break-word",
                  }}>
                    {word.word || "—"}
                  </span>
                )}
                </div>
              );
            })}
          </div>

          {/* Setup Controls */}
          {ifElse(
            setupMode,
            <div style={{
              marginBottom: "1rem",
              padding: "1rem",
              backgroundColor: "#f9fafb",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
            }}>
              <h3 style={{
                fontSize: "0.9rem",
                fontWeight: "600",
                marginBottom: "0.75rem",
              }}>
                Assign Colors (click a word, then choose a color)
              </h3>

              {/* Color Counts */}
              <div style={{
                display: "flex",
                gap: "0.5rem",
                marginBottom: "0.75rem",
                padding: "0.5rem",
                backgroundColor: "#ffffff",
                borderRadius: "0.375rem",
                border: "1px solid #e5e7eb",
                fontSize: "0.75rem",
                flexWrap: "wrap",
              }}>
                {computed(() => {
                  const boardData = board.get();
                  const counts: Record<WordOwner, number> = {
                    red: 0,
                    blue: 0,
                    neutral: 0,
                    assassin: 0,
                    unassigned: 0,
                  };
                  boardData.forEach((word: BoardWord) => {
                    counts[word.owner]++;
                  });
                  return (
                    <>
                      <span style={{ fontWeight: "600", color: "#dc2626" }}>
                        Red: {counts.red}
                      </span>
                      <span style={{ fontWeight: "600", color: "#2563eb" }}>
                        Blue: {counts.blue}
                      </span>
                      <span style={{ fontWeight: "600", color: "#71717a" }}>
                        Neutral: {counts.neutral}
                      </span>
                      <span style={{ fontWeight: "600", color: "#000000" }}>
                        Assassin: {counts.assassin}
                      </span>
                      <span style={{ fontWeight: "600", color: "#9ca3af" }}>
                        Unassigned: {counts.unassigned}
                      </span>
                    </>
                  );
                })}
              </div>

              <div style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "1rem",
              }}>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "red" })}
                  className="color-red"
                >
                  red
                </ct-button>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "blue" })}
                  className="color-blue"
                >
                  blue
                </ct-button>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "neutral" })}
                  className="color-neutral"
                >
                  neutral
                </ct-button>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "assassin" })}
                  className="color-assassin"
                >
                  assassin
                </ct-button>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "unassigned" })}
                  className="color-clear"
                >
                  Clear
                </ct-button>
              </div>

              {/* Reset Board Colors button */}
              <div style={{
                marginTop: "0.5rem",
                textAlign: "center",
              }}>
                <ct-button
                  onClick={resetAllColors({ board, selectedWordIndex })}
                  className="btn-reset"
                >
                  Reset All Colors
                </ct-button>
              </div>

              {/* AI Image Upload */}
              <div style={{
                marginTop: "1.5rem",
                padding: "1rem",
                backgroundColor: "#ffffff",
                borderRadius: "0.375rem",
                border: "2px solid #8b5cf6",
              }}>
                <h4 style={{
                  fontSize: "0.9rem",
                  fontWeight: "600",
                  marginBottom: "0.75rem",
                  color: "#6b21a8",
                }}>
                  📷 AI-Powered Board Setup
                </h4>
                <p style={{
                  fontSize: "0.75rem",
                  color: "#71717a",
                  marginBottom: "0.75rem",
                }}>
                  Upload photos of your board and key card to automatically extract words and colors.
                </p>
                <ct-image-input
                  multiple
                  maxImages={5}
                  maxSizeBytes={4000000}
                  showPreview={false}
                  buttonText="📷 Upload Board & Key Card Photos"
                  variant="secondary"
                  $images={uploadedPhotos}
                />

                {/* Display extraction results with confirmation dialog */}
                {photoExtractions.map((extraction, photoIdx) => {
                  // Use photoIdx directly from .map() parameter

                  return computed(() => {
                      // In computed(), access Cell values using .get() for local cells
                      const pending = extraction.pending;
                      const result = extraction.result;
                      const approvalStateValue = approvalState.get();

                      const approval = approvalStateValue[photoIdx] || { correctionText: "", applied: false };

                      if (pending) {
                        return (
                          <div
                            key={photoIdx}
                            style={{
                              marginTop: "0.75rem",
                              padding: "0.75rem",
                              backgroundColor: "#fef3c7",
                              borderRadius: "0.375rem",
                              border: "1px solid #f59e0b",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "#92400e" }}>
                              <ct-loader size="sm" show-elapsed></ct-loader>
                              Photo {photoIdx + 1}: Analyzing...
                            </div>
                          </div>
                        );
                      }

                      if (!result) return null;

                      const photoType = result.photoType || "unknown";
                      const confidence = result.confidence || "unknown";
                      const notes = result.notes || "";
                      const validation = validateExtraction(result);

                      // If already applied, show compact success message
                      if (approval.applied) {
                        return (
                          <div
                            key={photoIdx}
                            style={{
                              marginTop: "0.75rem",
                              padding: "0.5rem",
                              backgroundColor: "#d1fae5",
                              borderRadius: "0.375rem",
                              border: "1px solid #10b981",
                              fontSize: "0.7rem",
                              color: "#065f46",
                            }}
                          >
                            ✓ Photo {photoIdx + 1} applied to board
                          </div>
                        );
                      }

                      return (
                        <div
                          key={photoIdx}
                          style={{
                            marginTop: "0.75rem",
                            padding: "0.75rem",
                            backgroundColor: validation.isValid ? "#f0fdf4" : "#fef2f2",
                            borderRadius: "0.375rem",
                            border: validation.isValid ? "2px solid #22c55e" : "2px solid #f59e0b",
                          }}
                        >
                          {/* Header with photo type and confidence */}
                          <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.75rem",
                          }}>
                            <p style={{ fontSize: "0.8rem", fontWeight: "600", color: "#166534" }}>
                              📸 Photo {photoIdx + 1}: {photoType === "board" ? "Game Board" : photoType === "keycard" ? "Key Card" : "Unknown"}
                            </p>
                            <span style={{
                              fontSize: "0.65rem",
                              padding: "0.125rem 0.375rem",
                              backgroundColor: confidence === "high" ? "#22c55e" : confidence === "medium" ? "#f59e0b" : "#ef4444",
                              color: "white",
                              borderRadius: "0.25rem",
                              fontWeight: "600",
                            }}>
                              {confidence} confidence
                            </span>
                          </div>

                          {/* Validation errors */}
                          {validation.errors.length > 0 && (
                            <div style={{
                              marginBottom: "0.75rem",
                              padding: "0.5rem",
                              backgroundColor: "#fee2e2",
                              borderRadius: "0.25rem",
                              border: "1px solid #ef4444",
                            }}>
                              <p style={{ fontSize: "0.7rem", fontWeight: "600", color: "#991b1b", marginBottom: "0.25rem" }}>
                                ⚠️ Errors:
                              </p>
                              {validation.errors.map((err, i) => (
                                <p key={i} style={{ fontSize: "0.65rem", color: "#991b1b", margin: "0.125rem 0" }}>
                                  • {err}
                                </p>
                              ))}
                            </div>
                          )}

                          {/* Validation warnings */}
                          {validation.warnings.length > 0 && (
                            <div style={{
                              marginBottom: "0.75rem",
                              padding: "0.5rem",
                              backgroundColor: "#fef3c7",
                              borderRadius: "0.25rem",
                              border: "1px solid #f59e0b",
                            }}>
                              <p style={{ fontSize: "0.7rem", fontWeight: "600", color: "#92400e", marginBottom: "0.25rem" }}>
                                ⚠️ Warnings:
                              </p>
                              {validation.warnings.map((warn, i) => (
                                <p key={i} style={{ fontSize: "0.65rem", color: "#92400e", margin: "0.125rem 0" }}>
                                  • {warn}
                                </p>
                              ))}
                            </div>
                          )}

                          {/* Visual preview for key card */}
                          {photoType === "keycard" && result.keyCardColors && (
                            <div style={{ marginBottom: "0.75rem" }}>
                              <p style={{ fontSize: "0.7rem", fontWeight: "600", color: "#166534", marginBottom: "0.5rem" }}>
                                Key Card Preview:
                              </p>
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(5, 1fr)",
                                gap: "2px",
                                maxWidth: "150px",
                              }}>
                                {Array.from({ length: 25 }).map((_, cellIdx) => {
                                  const row = Math.floor(cellIdx / 5);
                                  const col = cellIdx % 5;
                                  const colorData = result.keyCardColors.find((c: any) => c.row === row && c.col === col);
                                  const color = colorData ? colorData.color : "unassigned";
                                  return (
                                    <div
                                      key={cellIdx}
                                      style={{
                                        aspectRatio: "1",
                                        backgroundColor: color === "red" ? "#dc2626"
                                          : color === "blue" ? "#2563eb"
                                          : color === "neutral" ? "#d4d4d8"
                                          : color === "assassin" ? "#000000"
                                          : "#e5e7eb",
                                        borderRadius: "2px",
                                      }}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Visual preview for board words */}
                          {photoType === "board" && result.boardWords && (
                            <div style={{ marginBottom: "0.75rem" }}>
                              <p style={{ fontSize: "0.7rem", fontWeight: "600", color: "#166534", marginBottom: "0.5rem" }}>
                                Board Preview: ({result.boardWords.length} words)
                              </p>
                              {/* Debug info */}
                              <div style={{ fontSize: "0.5rem", color: "#666", marginBottom: "0.5rem", backgroundColor: "#f0f0f0", padding: "0.25rem" }}>
                                First word structure: {JSON.stringify(result.boardWords[0])}
                              </div>
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(5, 1fr)",
                                gap: "2px",
                                fontSize: "0.45rem",
                                maxWidth: "250px",
                              }}>
                                {Array.from({ length: 25 }).map((_, cellIdx) => {
                                  const row = Math.floor(cellIdx / 5);
                                  const col = cellIdx % 5;
                                  const wordData = result.boardWords.find((w: any) => w.row === row && w.col === col);
                                  return (
                                    <div
                                      key={cellIdx}
                                      style={{
                                        aspectRatio: "1",
                                        backgroundColor: "#f3f4f6",
                                        border: "1px solid #d1d5db",
                                        borderRadius: "2px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        padding: "1px",
                                        textAlign: "center",
                                        wordBreak: "break-word",
                                        lineHeight: "1",
                                      }}
                                    >
                                      {wordData && wordData.word ? wordData.word.substring(0, 8) : "—"}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Notes from AI */}
                          {notes && (
                            <div style={{
                              fontSize: "0.65rem",
                              color: "#78716c",
                              fontStyle: "italic",
                              marginBottom: "0.75rem",
                              padding: "0.5rem",
                              backgroundColor: "#fafaf9",
                              borderRadius: "0.25rem",
                            }}>
                              Note: {notes}
                            </div>
                          )}

                          {/* Correction text box */}
                          <div style={{ marginBottom: "0.75rem" }}>
                            <label style={{
                              display: "block",
                              fontSize: "0.7rem",
                              fontWeight: "600",
                              color: "#374151",
                              marginBottom: "0.25rem",
                            }}>
                              Corrections (optional):
                            </label>
                            <input
                              type="text"
                              placeholder="e.g., 'top right should be blue not red'"
                              value={approval.correctionText}
                              onChange={updateCorrectionText({ approvalState, idx: photoIdx })}
                              style={{
                                width: "100%",
                                padding: "0.375rem",
                                fontSize: "0.7rem",
                                border: "1px solid #d1d5db",
                                borderRadius: "0.25rem",
                                fontFamily: "system-ui, sans-serif",
                              }}
                            />
                          </div>

                          {/* Action buttons */}
                          <div style={{
                            display: "flex",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                          }}>
                            <ct-button
                              onClick={applyExtractedData({ board, extraction, approvalState, idx: photoIdx })}
                              disabled={!validation.isValid}
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.5rem 0.75rem",
                                backgroundColor: validation.isValid ? "#22c55e" : "#9ca3af",
                                color: "white",
                                borderRadius: "0.25rem",
                                fontWeight: "600",
                                cursor: validation.isValid ? "pointer" : "not-allowed",
                              }}
                            >
                              ✓ Approve & Apply to Board
                            </ct-button>
                            <ct-button
                              onClick={rejectExtraction({ uploadedPhotos, idx: photoIdx, approvalState })}
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.5rem 0.75rem",
                                backgroundColor: "#ef4444",
                                color: "white",
                                borderRadius: "0.25rem",
                                fontWeight: "600",
                              }}
                            >
                              ✗ Reject
                            </ct-button>
                          </div>
                        </div>
                      );
                  });
                })}
              </div>
            </div>,
            <div style={{
              padding: "1rem",
              backgroundColor: "#f9fafb",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
              textAlign: "center",
              marginBottom: "1rem",
            }}>
              <p style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Game Mode</p>
              <p style={{ fontSize: "0.875rem" }}>Click cards to mark them as guessed (faded = out of play)</p>
            </div>
          )}

          {/* AI Clue Suggestions - Only in Game Mode */}
          {ifElse(
            setupMode,
            null,
            <div style={{
              marginBottom: "1rem",
              padding: "1rem",
              backgroundColor: "#fef3c7",
              borderRadius: "0.5rem",
              border: "2px solid #f59e0b",
            }}>
              <h3 style={{
                fontSize: "1rem",
                fontWeight: "bold",
                marginBottom: "0.75rem",
                color: "#92400e",
              }}>
                🤖 AI Clue Suggestions
              </h3>

              {computed(() => {
                const pending = clueSuggestions.pending;
                const result = clueSuggestions.result;

                if (pending) {
                  return (
                    <div style={{
                      padding: "1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.75rem",
                      color: "#92400e",
                      fontSize: "0.875rem",
                    }}>
                      <ct-loader show-elapsed></ct-loader>
                      Analyzing board and generating clues...
                    </div>
                  );
                }

                if (!result || !result.clues || result.clues.length === 0) {
                  return (
                    <div style={{
                      padding: "1rem",
                      textAlign: "center",
                      color: "#92400e",
                      fontSize: "0.875rem",
                    }}>
                      No clues available yet. Make sure the board is set up!
                    </div>
                  );
                }

                return (
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}>
                    {result.clues.map((clue: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: "0.75rem",
                          backgroundColor: "#ffffff",
                          borderRadius: "0.375rem",
                          border: "1px solid #f59e0b",
                        }}
                      >
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          marginBottom: "0.5rem",
                        }}>
                          <span style={{
                            fontSize: "1.25rem",
                            fontWeight: "bold",
                            color: "#92400e",
                            textTransform: "uppercase",
                          }}>
                            {clue.clue}
                          </span>
                          <span style={{
                            fontSize: "1rem",
                            fontWeight: "600",
                            color: "#d97706",
                          }}>
                            ({clue.number})
                          </span>
                        </div>

                        <div style={{
                          fontSize: "0.75rem",
                          color: "#78716c",
                          marginBottom: "0.25rem",
                        }}>
                          <strong>Connects:</strong> {clue.targetWords.join(", ")}
                        </div>

                        <div style={{
                          fontSize: "0.75rem",
                          color: "#78716c",
                          fontStyle: "italic",
                        }}>
                          {clue.reasoning}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Reset Board Button - always visible at bottom */}
          <div style={{
            marginTop: "1.5rem",
            textAlign: "center",
            paddingTop: "1rem",
            borderTop: "2px solid #e5e7eb",
          }}>
            <ct-button
              onClick={initializeBoardHandler({ board, setupMode })}
              className="btn-reset"
            >
              Reset Board
            </ct-button>
          </div>
        </div>
      ),
      board,
      myTeam,
      setupMode,
      selectedWordIndex,
    };
  }
);
