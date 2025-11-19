/// <cts-enable />
import { Cell, Default, derive, handler, NAME, pattern, UI } from "commontools";

/**
 * ClusterBoard - Collaborative Brainstorming with AI Clustering
 *
 * Phase 1: Basic board with drag-and-drop positioning
 * - Create/edit/delete post-it notes
 * - Drag-and-drop positioning using ct-canvas and ct-draggable
 * - Real-time collaboration
 */

interface PostIt {
  id: string;
  content: string;
  x: Default<number, 100>;
  y: Default<number, 100>;
  createdAt: number;
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

// Handler for updating post-it position when dragged
const updatePosition = handler<
  { detail: { x: number; y: number } },
  { postIts: Cell<PostIt[]>; index: number }
>((event, { postIts, index }) => {
  postIts.key(index).key("x").set(event.detail.x);
  postIts.key(index).key("y").set(event.detail.y);
});

// Handler for clicking canvas to create new note
const handleCanvasClick = handler<
  { detail: { x: number; y: number } },
  { postIts: Cell<PostIt[]> }
>((event, { postIts }) => {
  const newPostIt: PostIt = {
    id: generateId(),
    content: "New note...",
    x: event.detail.x - 100, // Center note on click
    y: event.detail.y - 75,
    createdAt: Date.now(),
  };
  postIts.push(newPostIt);
});

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
            <span style={{ color: "#666", fontSize: "0.9rem" }}>
              Click canvas to add notes • Drag to move
            </span>
          </div>

          {/* Canvas with draggable post-its */}
          <div style={{ marginTop: "80px" }}>
            <ct-canvas
              width={1200}
              height={800}
              onct-canvas-click={handleCanvasClick({ postIts })}
            >
              {postIts.map((postIt, index) => (
                <ct-draggable
                  key={postIt.id}
                  x={derive(postIt, (note) => note.x)}
                  y={derive(postIt, (note) => note.y)}
                  onpositionchange={updatePosition({ postIts, index })}
                >
                  <div style={{
                    width: "200px",
                    minHeight: "150px",
                    backgroundColor: "#fff59d",
                    border: "1px solid #f9a825",
                    borderRadius: "4px",
                    padding: "0.75rem",
                    boxShadow: "2px 2px 8px rgba(0,0,0,0.1)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    cursor: "move",
                  }}>
                    {/* Content */}
                    <div style={{
                      flex: 1,
                      fontSize: "0.95rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {postIt.content}
                    </div>

                    {/* Footer with delete button */}
                    <div style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      borderTop: "1px solid #f9a825",
                      paddingTop: "0.5rem",
                    }}>
                      <button
                        onClick={() => {
                          const current = postIts.get();
                          const idx = current.findIndex((el) => Cell.equals(postIt, el));
                          if (idx >= 0) {
                            postIts.set(current.toSpliced(idx, 1));
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
                </ct-draggable>
              ))}
            </ct-canvas>
          </div>
        </div>
      ),
      postIts,
    };
  }
);
