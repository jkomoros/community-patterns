/// <cts-enable />
import { Cell, Default, NAME, pattern, str, UI } from "commontools";

/**
 * ClusterBoard - Collaborative Brainstorming with AI Clustering
 *
 * Phase 1: Basic board with manual positioning
 * - Create/edit/delete post-it notes
 * - Drag and drop positioning
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
          <div style={{
            position: "absolute",
            top: "80px",
            left: 0,
            right: 0,
            bottom: 0,
          }}>
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
                  backgroundColor: "#fff59d",
                  border: "1px solid #f9a825",
                  borderRadius: "4px",
                  padding: "0.75rem",
                  boxShadow: "2px 2px 8px rgba(0,0,0,0.1)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
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
