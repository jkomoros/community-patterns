/// <cts-enable />
import { Cell, Default, NAME, pattern, str, UI } from "commontools";

/**
 * ClusterBoard - Collaborative Brainstorming with AI Clustering
 *
 * Phase 1: Basic board with manual positioning
 * - Create/edit/delete post-it notes
 * - Click-to-place positioning (temporary workaround)
 * - Real-time collaboration
 *
 * NOTE: Drag-and-drop is the ideal UX but not yet supported by the Common Tools
 * framework (requires DOM mouse events: onmousedown, onmousemove, onmouseup).
 * Current implementation uses click-to-place: click "Move" button, then click
 * canvas to place. When framework adds drag support, this should be replaced.
 */

interface PostIt {
  id: string;
  content: string;
  x: Default<number, 100>;
  y: Default<number, 100>;
  createdAt: number;
  isMoving: Default<boolean, false>;  // Track if note is in "move mode"
}

interface ClusterBoardInput {
  postIts: Cell<PostIt[]>;
}

interface ClusterBoardOutput {
  postIts: Cell<PostIt[]>;
}

// Generate unique ID for post-its
function generateId(): string {
  return `postit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default pattern<ClusterBoardInput, ClusterBoardOutput>(
  ({ postIts }) => {
    return {
      [NAME]: "ClusterBoard",
      [UI]: (
        <div style={{
          width: "100vw",
          height: "100vh",
          backgroundColor: "#f5f5f5",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            padding: "1rem",
            backgroundColor: "white",
            borderBottom: "1px solid #ddd",
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            zIndex: 1000,
          }}>
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>ClusterBoard</h1>

            {/* Add Note Button */}
            <button
              onClick={() => {
                const newPostIt: PostIt = {
                  id: generateId(),
                  content: "New note...",
                  x: Math.random() * 400 + 100,
                  y: Math.random() * 400 + 150,
                  createdAt: Date.now(),
                  isMoving: false,
                };
                postIts.push(newPostIt);
              }}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "1rem",
                marginLeft: "auto",
              }}
            >
              + New Note
            </button>
          </div>

          {/* Canvas Area */}
          <div
            onClick={(e: any) => {
              // If a note is in move mode, place it at click location
              const current = postIts.get();
              const movingNote = current.find(note => note.isMoving);

              if (movingNote) {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left - 100; // Center note on click
                const y = e.clientY - rect.top - 75;

                const index = current.findIndex(note => note.id === movingNote.id);
                if (index >= 0) {
                  const updated = [...current];
                  updated[index] = {
                    ...updated[index],
                    x: Math.max(0, x),
                    y: Math.max(0, y),
                    isMoving: false,
                  };
                  postIts.set(updated);
                }
              }
            }}
            style={{
              position: "absolute",
              top: "80px",
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            {/* Render all post-its */}
            {postIts.map((postIt) => (
              <div
                key={postIt.id}
                style={{
                  position: "absolute",
                  left: `${postIt.x}px`,
                  top: `${postIt.y}px`,
                  width: "200px",
                  minHeight: "150px",
                  backgroundColor: postIt.isMoving ? "#ffeb3b" : "#fff59d",
                  border: postIt.isMoving ? "3px solid #ff5722" : "1px solid #f9a825",
                  borderRadius: "4px",
                  padding: "0.75rem",
                  boxShadow: postIt.isMoving
                    ? "4px 4px 16px rgba(255,87,34,0.4)"
                    : "2px 2px 8px rgba(0,0,0,0.1)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  opacity: postIt.isMoving ? 0.8 : 1,
                }}
              >
                {/* Content */}
                <div style={{
                  flex: 1,
                  fontSize: "0.95rem",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {postIt.content}
                </div>

                {/* Footer with action buttons */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  borderTop: "1px solid #f9a825",
                  paddingTop: "0.5rem",
                }}>
                  {postIt.isMoving ? (
                    <button
                      onClick={() => {
                        // Cancel move mode
                        const current = postIts.get();
                        const index = current.findIndex((el) => Cell.equals(postIt, el));
                        if (index >= 0) {
                          const updated = [...current];
                          updated[index] = { ...updated[index], isMoving: false };
                          postIts.set(updated);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "0.25rem 0.5rem",
                        backgroundColor: "#9e9e9e",
                        color: "white",
                        border: "none",
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        // Enter move mode - cancel any other moving notes first
                        const current = postIts.get();
                        const updated = current.map(note => ({
                          ...note,
                          isMoving: note.id === postIt.id,
                        }));
                        postIts.set(updated);
                      }}
                      style={{
                        flex: 1,
                        padding: "0.25rem 0.5rem",
                        backgroundColor: "#2196F3",
                        color: "white",
                        border: "none",
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      Move
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const current = postIts.get();
                      const index = current.findIndex((el) => Cell.equals(postIt, el));
                      if (index >= 0) {
                        postIts.set(current.toSpliced(index, 1));
                      }
                    }}
                    style={{
                      padding: "0.25rem 0.5rem",
                      backgroundColor: "#f44336",
                      color: "white",
                      border: "none",
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
      postIts,
    };
  }
);
