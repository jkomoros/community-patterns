/// <cts-enable />
import {
  Writable,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";

/**
 * Context-Aware Note Taker
 *
 * Demonstrates wish() for contextual actions.
 * When you're looking at something (a recipe, article, task),
 * this pattern uses wish() to create notes that are contextually
 * linked to what you're viewing.
 */

interface ContextItem {
  type: "recipe" | "article" | "task" | "idea" | "custom";
  title: string;
  content: string;
}

interface Note {
  id: string;
  contextType: string;
  contextTitle: string;
  noteContent: string;
  createdAt: string;
}

interface ContextNoterInput {
  currentContext: Default<ContextItem, {
    type: "recipe";
    title: "Margherita Pizza";
    content: "A classic Italian pizza with tomatoes, mozzarella, and fresh basil";
  }>;
  notes: Default<Note[], []>;
}

const setContextType = handler<
  unknown,
  { currentContext: Writable<ContextItem>; type: ContextItem["type"] }
>((_event, { currentContext, type }) => {
  const current = currentContext.get();
  currentContext.set({ ...current, type });
});

const setContextTitle = handler<
  { detail: { message: string } },
  { currentContext: Writable<ContextItem> }
>((event, { currentContext }) => {
  const newTitle = event.detail?.message?.trim();
  if (newTitle) {
    const current = currentContext.get();
    currentContext.set({ ...current, title: newTitle });
  }
});

const setContextContent = handler<
  { detail: { message: string } },
  { currentContext: Writable<ContextItem> }
>((event, { currentContext }) => {
  const newContent = event.detail?.message?.trim();
  if (newContent) {
    const current = currentContext.get();
    currentContext.set({ ...current, content: newContent });
  }
});

const addNote = handler<
  { detail: { message: string } },
  { notes: Writable<Note[]>; currentContext: Writable<ContextItem> }
>((event, { notes, currentContext }) => {
  const noteContent = event.detail?.message?.trim();
  if (noteContent) {
    const ctx = currentContext.get();
    const newNote: Note = {
      id: `note-${Date.now()}`,
      contextType: ctx.type,
      contextTitle: ctx.title,
      noteContent,
      createdAt: new Date().toISOString(),
    };
    notes.set([newNote, ...notes.get()]);
  }
});

const removeNote = handler<
  unknown,
  { notes: Writable<Note[]>; id: string }
>((_event, { notes, id }) => {
  notes.set(notes.get().filter(n => n.id !== id));
});

// Context type icons
function getContextIcon(type: ContextItem["type"]): string {
  switch (type) {
    case "recipe": return "🍳";
    case "article": return "📰";
    case "task": return "✅";
    case "idea": return "💡";
    case "custom": return "📝";
  }
}

export default pattern<ContextNoterInput>(({ currentContext, notes }) => {
  // Use derive for all reactive transformations (avoids .get() issues)
  const contextType = derive(currentContext, (ctx) => ctx.type);
  const contextTitle = derive(currentContext, (ctx) => ctx.title);
  const contextContent = derive(currentContext, (ctx) => ctx.content);
  const contextIcon = derive(contextType, getContextIcon);

  // Build a wish query for contextual suggestions using derive
  const suggestionQuery = derive(currentContext, (ctx) =>
    `Based on this ${ctx.type} about "${ctx.title}": ${ctx.content}. Suggest something related or helpful.`
  );

  // Wish for contextual suggestions
  const contextualSuggestion = wish<{ cell: Writable<any> }>({
    query: suggestionQuery,
    context: {
      contextType: contextType,
      contextTitle: contextTitle,
      contextContent: contextContent,
    },
  });

  // Filter notes using derive (avoids .get() issues)
  const notesForCurrentContext = derive(
    { notes, currentContext },
    ({ notes: noteList, currentContext: ctx }) =>
      noteList.filter(n => n.contextTitle === ctx.title)
  );

  const otherNotes = derive(
    { notes, currentContext },
    ({ notes: noteList, currentContext: ctx }) =>
      noteList.filter(n => n.contextTitle !== ctx.title)
  );

  const notesCount = derive(notesForCurrentContext, (n) => n.length);
  const otherNotesCount = derive(otherNotes, (n) => n.length);

  return {
    [NAME]: derive(contextTitle, (title) => `Notes: ${title}`),
    [UI]: (
      <div style={{ padding: "1rem", maxWidth: "900px", margin: "0 auto" }}>
        <h2>Context-Aware Note Taker</h2>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          Set your current context, take notes, and get AI-powered suggestions
          based on what you're looking at.
        </p>

        {/* Context Editor */}
        <div style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          border: "1px solid #ddd",
          borderRadius: "8px",
          backgroundColor: "#fafafa",
        }}>
          <h3 style={{ margin: "0 0 1rem 0" }}>
            {contextIcon} Current Context
          </h3>

          {/* Context type selector */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "600" }}>
              Type:
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {(["recipe", "article", "task", "idea", "custom"] as const).map(type => (
                <button
                  onClick={setContextType({ currentContext, type })}
                  style={{
                    padding: "0.5rem 1rem",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    cursor: "pointer",
                    backgroundColor: derive(contextType, (ct) =>
                      ct === type ? "#007bff" : "#fff"
                    ),
                    color: derive(contextType, (ct) =>
                      ct === type ? "#fff" : "#333"
                    ),
                  }}
                >
                  {getContextIcon(type)} {type}
                </button>
              ))}
            </div>
          </div>

          {/* Title display and edit */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "600" }}>
              Title:
            </label>
            <div style={{
              padding: "0.5rem",
              backgroundColor: "#fff",
              border: "1px solid #ddd",
              borderRadius: "4px",
              marginBottom: "0.5rem",
            }}>
              {contextTitle}
            </div>
            <ct-message-input
              placeholder="Type new title and press enter..."
              onct-send={setContextTitle({ currentContext })}
            />
          </div>

          {/* Content display and edit */}
          <div>
            <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "600" }}>
              Content/Description:
            </label>
            <div style={{
              padding: "0.5rem",
              backgroundColor: "#fff",
              border: "1px solid #ddd",
              borderRadius: "4px",
              marginBottom: "0.5rem",
              minHeight: "2rem",
            }}>
              {contextContent}
            </div>
            <ct-message-input
              placeholder="Type new description and press enter..."
              onct-send={setContextContent({ currentContext })}
            />
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {/* Notes section */}
          <div style={{ flex: "1 1 400px" }}>
            {/* Add note */}
            <div style={{
              marginBottom: "1rem",
              padding: "1rem",
              border: "2px solid #28a745",
              borderRadius: "8px",
              backgroundColor: "#f8fff8",
            }}>
              <h3 style={{ margin: "0 0 0.5rem 0", color: "#28a745" }}>
                Add a note about {contextTitle}
              </h3>
              <ct-message-input
                placeholder="Write your note..."
                onct-send={addNote({ notes, currentContext })}
              />
            </div>

            {/* Notes for current context */}
            <div style={{
              marginBottom: "1rem",
              padding: "1rem",
              border: "1px solid #ddd",
              borderRadius: "8px",
            }}>
              <h3 style={{ margin: "0 0 1rem 0" }}>
                Notes for "{contextTitle}" ({notesCount})
              </h3>
              {ifElse(
                derive(notesCount, (c) => c === 0),
                <p style={{ color: "#666", fontStyle: "italic" }}>
                  No notes yet for this context.
                </p>,
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {notesForCurrentContext.map(note => (
                    <div style={{
                      padding: "0.75rem",
                      backgroundColor: "#f5f5f5",
                      borderRadius: "4px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}>
                      <div>
                        <div style={{ marginBottom: "0.25rem" }}>{note.noteContent}</div>
                        <div style={{ fontSize: "0.75rem", color: "#999" }}>
                          {derive(note, (n) => new Date(n.createdAt).toLocaleString())}
                        </div>
                      </div>
                      <button
                        onClick={removeNote({ notes, id: note.id })}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#dc3545",
                          fontSize: "1rem",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Other notes */}
            {ifElse(
              derive(otherNotesCount, (c) => c > 0),
              <details style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
                backgroundColor: "#fafafa",
              }}>
                <summary style={{ cursor: "pointer", fontWeight: "600" }}>
                  Other notes ({otherNotesCount})
                </summary>
                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {otherNotes.map(note => (
                    <div style={{
                      padding: "0.75rem",
                      backgroundColor: "#fff",
                      borderRadius: "4px",
                      border: "1px solid #eee",
                    }}>
                      <div style={{
                        fontSize: "0.8rem",
                        color: "#666",
                        marginBottom: "0.25rem",
                      }}>
                        {derive(note, (n) => getContextIcon(n.contextType as ContextItem["type"]))} {note.contextTitle}
                      </div>
                      <div>{note.noteContent}</div>
                    </div>
                  ))}
                </div>
              </details>,
              null
            )}
          </div>

          {/* AI Suggestion section */}
          <div style={{ flex: "1 1 350px" }}>
            <div style={{
              padding: "1rem",
              border: "2px solid #6f42c1",
              borderRadius: "8px",
              backgroundColor: "#f8f5ff",
            }}>
              <h3 style={{ margin: "0 0 1rem 0", color: "#6f42c1" }}>
                AI Suggestion
              </h3>
              <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "1rem" }}>
                Based on your current context, here's something that might help:
              </p>
              <ct-cell-context $cell={contextualSuggestion} label="AI Suggestion">
                {derive(contextualSuggestion, (r) => {
                  if (!r) {
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#666" }}>
                        <ct-loader size="sm"></ct-loader>
                        <span>Finding suggestions...</span>
                      </div>
                    );
                  }
                  if (r.error) {
                    return <span style={{ color: "#dc3545" }}>Error: {r.error}</span>;
                  }
                  return r.result ?? r;
                })}
              </ct-cell-context>
            </div>
          </div>
        </div>
      </div>
    ),
    currentContext,
    notes,
    contextualSuggestion,
  };
});
