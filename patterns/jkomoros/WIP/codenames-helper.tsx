/// <cts-enable />
import { Cell, Default, derive, handler, ifElse, NAME, pattern, UI } from "commontools";

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

interface CodenamesHelperInput {
  board: Cell<BoardWord[]>;
  myTeam: Cell<Team>;
  setupMode: Cell<boolean>;
  selectedWordIndex: Cell<number>;
}

interface CodenamesHelperOutput {
  board: Cell<BoardWord[]>;
  myTeam: Cell<Team>;
  setupMode: Cell<boolean>;
  selectedWordIndex: Cell<number>;
}

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

// Get background color for word based on owner and state
function getWordBackgroundColor(owner: WordOwner, state: WordState): string {
  if (state === "revealed") {
    return getWordColor(owner);
  }
  return "#f5f5dc"; // Unrevealed = tan/beige
}

// ===== HANDLERS =====

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
    selectedWordIndex.set(-1); // Deselect after assigning
  }
});

// ===== MAIN PATTERN =====

export default pattern<CodenamesHelperInput, CodenamesHelperOutput>(
  ({ board, myTeam, setupMode, selectedWordIndex }) => {
    return {
      [NAME]: "Codenames Helper",
      [UI]: (
        <div style={{
          padding: "1rem",
          fontFamily: "system-ui, sans-serif",
          maxWidth: "800px",
          margin: "0 auto",
        }}>
          {/* Header */}
          <div style={{
            marginBottom: "1.5rem",
            textAlign: "center",
          }}>
            <h1 style={{
              fontSize: "1.5rem",
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
                style={myTeam.get() === "red"
                  ? "padding: 0.5rem 1rem; background-color: #dc2626; color: white; border: 2px solid #dc2626; border-radius: 0.375rem; font-weight: 600;"
                  : "padding: 0.5rem 1rem; background-color: #f3f4f6; color: black; border: 2px solid #dc2626; border-radius: 0.375rem; font-weight: 600;"
                }
              >
                Red Team
              </ct-button>
              <ct-button
                onClick={() => myTeam.set("blue")}
                style={myTeam.get() === "blue"
                  ? "padding: 0.5rem 1rem; background-color: #2563eb; color: white; border: 2px solid #2563eb; border-radius: 0.375rem; font-weight: 600;"
                  : "padding: 0.5rem 1rem; background-color: #f3f4f6; color: black; border: 2px solid #2563eb; border-radius: 0.375rem; font-weight: 600;"
                }
              >
                Blue Team
              </ct-button>
            </div>

            {/* Mode Toggle */}
            <ct-button
              onClick={() => setupMode.set(!setupMode.get())}
              style={setupMode.get()
                ? "padding: 0.5rem 1rem; background-color: #8b5cf6; color: white; border-radius: 0.375rem; font-weight: 600;"
                : "padding: 0.5rem 1rem; background-color: #10b981; color: white; border-radius: 0.375rem; font-weight: 600;"
              }
            >
              {setupMode.get() ? "Setup Mode" : "Play Mode"}
            </ct-button>
          </div>

          {/* Game Board */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "0.5rem",
            marginBottom: "1.5rem",
          }}>
            {board.map((word: BoardWord, index: number) => {
              const bgColor = getWordBackgroundColor(word.owner, word.state);
              const textColor = word.state === "revealed" &&
                (word.owner === "red" || word.owner === "blue" || word.owner === "assassin")
                ? "white" : "black";

              return (
                <div
                  key={index}
                  style={{
                    aspectRatio: "1",
                    border: selectedWordIndex.get() === index ? "3px solid #3b82f6" : "2px solid #000",
                    borderRadius: "0.375rem",
                    padding: "0.5rem",
                    backgroundColor: bgColor,
                    color: textColor,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "relative",
                    cursor: "pointer",
                    boxShadow: selectedWordIndex.get() === index ? "0 0 8px rgba(59, 130, 246, 0.5)" : "none",
                  }}
                  onClick={() => {
                    if (setupMode.get()) {
                      // In setup mode: select this word for color assignment
                      selectedWordIndex.set(index);
                    } else {
                      // In play mode: reveal the word
                      if (word.word && word.state === "unrevealed") {
                        const currentBoard = board.get().slice();
                        currentBoard[index] = { ...currentBoard[index], state: "revealed" };
                        board.set(currentBoard);
                      }
                    }
                  }}
                >
                  {/* Word Display/Input */}
                  {setupMode.get() ? (
                    <input
                      type="text"
                      value={word.word}
                      placeholder={`${word.position.row},${word.position.col}`}
                      onChange={(e: any) => {
                        const currentBoard = board.get().slice();
                        currentBoard[index] = { ...currentBoard[index], word: e.target.value.toUpperCase() };
                        board.set(currentBoard);
                      }}
                      style={{
                        width: "100%",
                        height: "100%",
                        textAlign: "center",
                        fontSize: "0.875rem",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        border: "none",
                        background: "transparent",
                        color: "inherit",
                      }}
                    />
                  ) : (
                    <span style={{
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      textAlign: "center",
                      wordBreak: "break-word",
                    }}>
                      {word.word || "—"}
                    </span>
                  )}

                  {/* Owner Indicator (Setup Mode) */}
                  {setupMode.get() && word.owner !== "unassigned" ? (
                    <div style={{
                      position: "absolute",
                      top: "2px",
                      right: "2px",
                      width: "12px",
                      height: "12px",
                      borderRadius: "50%",
                      backgroundColor: getWordColor(word.owner),
                      border: "1px solid white",
                    }} />
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Initialize Button */}
          <div style={{
            textAlign: "center",
            marginBottom: "1.5rem",
          }}>
            <ct-button
              onClick={() => {
                const newBoard: BoardWord[] = [];
                for (let row = 0; row < 5; row++) {
                  for (let col = 0; col < 5; col++) {
                    newBoard.push({
                      word: "",
                      position: { row, col },
                      owner: "unassigned",
                      state: "unrevealed",
                    });
                  }
                }
                board.set(newBoard);
              }}
              style="padding: 1rem 2rem; background-color: #3b82f6; color: white; border-radius: 0.5rem; font-weight: 600;"
            >
              Initialize Empty Board
            </ct-button>
          </div>

          {/* Setup Controls */}
          {ifElse(
            setupMode,
            <div style={{
              marginBottom: "1.5rem",
              padding: "1rem",
              backgroundColor: "#f9fafb",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
            }}>
              <h3 style={{
                fontSize: "1rem",
                fontWeight: "600",
                marginBottom: "0.75rem",
              }}>
                Assign Colors (click a word, then choose a color)
              </h3>

              <div style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "1rem",
              }}>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "red" })}
                  style={`padding: 0.5rem 1rem; background-color: ${getWordColor("red")}; color: white; border: 2px solid #000; border-radius: 0.375rem; font-weight: 600; text-transform: capitalize;`}
                >
                  red
                </ct-button>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "blue" })}
                  style={`padding: 0.5rem 1rem; background-color: ${getWordColor("blue")}; color: white; border: 2px solid #000; border-radius: 0.375rem; font-weight: 600; text-transform: capitalize;`}
                >
                  blue
                </ct-button>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "neutral" })}
                  style={`padding: 0.5rem 1rem; background-color: ${getWordColor("neutral")}; color: black; border: 2px solid #000; border-radius: 0.375rem; font-weight: 600; text-transform: capitalize;`}
                >
                  neutral
                </ct-button>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "assassin" })}
                  style={`padding: 0.5rem 1rem; background-color: ${getWordColor("assassin")}; color: white; border: 2px solid #000; border-radius: 0.375rem; font-weight: 600; text-transform: capitalize;`}
                >
                  assassin
                </ct-button>
                <ct-button
                  onClick={assignColor({ board, selectedWordIndex, owner: "unassigned" })}
                  style={`padding: 0.5rem 1rem; background-color: ${getWordColor("unassigned")}; color: black; border: 2px solid #000; border-radius: 0.375rem; font-weight: 600; text-transform: capitalize;`}
                >
                  Clear
                </ct-button>
              </div>

              {/* TODO: Reset Board button */}
            </div>,
            <div style={{
              padding: "1rem",
              backgroundColor: "#f9fafb",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
              textAlign: "center",
            }}>
              <p>Click cards to reveal them during play</p>
            </div>
          )}
        </div>
      ),
      board,
      myTeam,
      setupMode,
      selectedWordIndex,
    };
  }
);
