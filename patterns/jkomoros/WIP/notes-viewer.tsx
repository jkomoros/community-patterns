/// <cts-enable />
/**
 * Notes Viewer
 *
 * View your Notes synced via apple-sync CLI.
 * Notes are stored in the `notes` input cell.
 *
 * To sync notes, run:
 *   ./tools/apple-sync.ts notes
 */
import {
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  Writable,
} from "commontools";

type CFC<T, C extends string> = T;
type Confidential<T> = CFC<T, "confidential">;

/**
 * A note item
 */
export type NoteItem = {
  id: string;
  title: string;
  body: string;
  creationDate: string;
  modificationDate: string;
  folderName: string;
};

// Format a date for display
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const noteDay = new Date(date);
    noteDay.setHours(0, 0, 0, 0);

    const diffDays = Math.round(
      (today.getTime() - noteDay.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "long" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  } catch {
    return dateStr;
  }
}

// Get folder color based on name
function getFolderColor(folderName: string): string {
  const colors: Record<string, string> = {
    Notes: "#FFCC00", // Yellow
    Work: "#007AFF", // Blue
    Personal: "#34C759", // Green
    Archive: "#8E8E93", // Gray
    Ideas: "#FF9500", // Orange
    Projects: "#5856D6", // Purple
  };
  return colors[folderName] || "#8E8E93";
}

// Group notes by folder
function groupByFolder(notes: NoteItem[]): Map<string, NoteItem[]> {
  const byFolder = new Map<string, NoteItem[]>();
  for (const n of notes) {
    if (!n || !n.folderName) continue;
    const existing = byFolder.get(n.folderName) || [];
    existing.push(n);
    byFolder.set(n.folderName, existing);
  }
  return byFolder;
}

// Handler to select a note
const selectNote = handler<
  unknown,
  { noteId: string; selectedNoteId: Writable<string | null> }
>((_, { noteId, selectedNoteId }) => {
  selectedNoteId.set(noteId);
});

// Handler to go back to list
const backToList = handler<
  unknown,
  { selectedNoteId: Writable<string | null> }
>((_, { selectedNoteId }) => {
  selectedNoteId.set(null);
});

export default pattern<{
  notes: Default<Confidential<NoteItem[]>, []>;
}>(({ notes }) => {
  const selectedNoteId = Writable.of<string | null>(null);

  const noteCount = derive(
    notes,
    (n: NoteItem[]) => n?.filter((item) => item)?.length ?? 0
  );

  // Get notes grouped by folder
  const notesByFolder = derive(notes, (n: NoteItem[]) => {
    const byFolder = groupByFolder((n || []).filter((item) => item));
    const groups: Array<{ folderName: string; notes: NoteItem[] }> = [];

    for (const [folderName, folderNotes] of byFolder) {
      groups.push({
        folderName,
        notes: folderNotes,
      });
    }

    // Sort groups alphabetically
    groups.sort((a, b) => a.folderName.localeCompare(b.folderName));

    return groups;
  });

  // Get selected note details
  const selectedNote = derive(
    { notes, selectedNoteId },
    ({
      notes,
      selectedNoteId,
    }: {
      notes: NoteItem[];
      selectedNoteId: string | null;
    }) => {
      if (!selectedNoteId || !notes) return null;
      return notes.find((n: NoteItem) => n && n.id === selectedNoteId) || null;
    }
  );

  return {
    [NAME]: derive(noteCount, (count: number) => `Notes (${count})`),
    [UI]: (
      <ct-screen
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f5f5f5",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#fff",
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {ifElse(
            derive(selectedNoteId, (id: string | null) => id !== null),
            <button
              onClick={backToList({ selectedNoteId })}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: "18px",
                padding: "4px 8px",
              }}
            >
              Back
            </button>,
            <span style={{ fontSize: "24px" }}>Notes</span>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {ifElse(
            derive(noteCount, (c: number) => c === 0),
            // Empty state
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#666",
                padding: "20px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>Notes</div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  marginBottom: "8px",
                }}
              >
                No Notes Yet
              </div>
              <div style={{ fontSize: "14px", maxWidth: "300px" }}>
                Run the apple-sync CLI to import your notes:
                <pre
                  style={{
                    backgroundColor: "#e0e0e0",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    marginTop: "12px",
                    fontSize: "12px",
                  }}
                >
                  ./tools/apple-sync.ts notes
                </pre>
              </div>
            </div>,
            // Has notes
            ifElse(
              derive(selectedNoteId, (id: string | null) => id === null),
              // Note list view (grouped by folder)
              <div>
                {derive(notesByFolder, (groups) =>
                  groups.map((group, groupIdx: number) => (
                    <div key={groupIdx}>
                      {/* Folder header */}
                      <div
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#e8e8e8",
                          fontWeight: "600",
                          fontSize: "14px",
                          color: "#666",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "4px",
                            backgroundColor: getFolderColor(group.folderName),
                          }}
                        />
                        {group.folderName} ({group.notes.length})
                      </div>
                      {/* Notes for this folder */}
                      {group.notes.map((n, idx: number) => (
                        <div
                          key={idx}
                          onClick={selectNote({
                            noteId: n.id,
                            selectedNoteId,
                          })}
                          style={{
                            padding: "12px 16px",
                            backgroundColor: "#fff",
                            borderBottom: "1px solid #f0f0f0",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: "500",
                              marginBottom: "4px",
                            }}
                          >
                            {n.title || "Untitled"}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#666",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {n.body && n.body.length > 80
                              ? n.body.substring(0, 80) + "..."
                              : n.body || "No additional text"}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#999",
                              marginTop: "4px",
                            }}
                          >
                            {formatDate(n.modificationDate)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>,
              // Note detail view
              <div style={{ padding: "20px", backgroundColor: "#fff" }}>
                {derive(selectedNote, (n: NoteItem | null) =>
                  n ? (
                    <div>
                      {/* Folder indicator */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "16px",
                        }}
                      >
                        <div
                          style={{
                            width: "12px",
                            height: "12px",
                            borderRadius: "6px",
                            backgroundColor: getFolderColor(n.folderName),
                          }}
                        />
                        <span style={{ color: "#666" }}>{n.folderName}</span>
                      </div>

                      {/* Title */}
                      <div
                        style={{
                          margin: "0 0 16px 0",
                          fontSize: "24px",
                          fontWeight: "bold",
                        }}
                      >
                        {n.title || "Untitled"}
                      </div>

                      {/* Dates */}
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#999",
                          marginBottom: "16px",
                        }}
                      >
                        Modified: {formatDate(n.modificationDate)} | Created:{" "}
                        {formatDate(n.creationDate)}
                      </div>

                      {/* Body */}
                      <div
                        style={{
                          color: "#333",
                          whiteSpace: "pre-wrap",
                          lineHeight: "1.6",
                        }}
                      >
                        {n.body || "No content"}
                      </div>
                    </div>
                  ) : (
                    <div>Note not found</div>
                  )
                )}
              </div>
            )
          )}
        </div>
      </ct-screen>
    ),
    notes,
  };
});
