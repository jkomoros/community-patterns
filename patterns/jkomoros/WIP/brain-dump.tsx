/// <cts-enable />
import {
  Cell,
  cell,
  computed,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

// Import Suggestion pattern (copied to WIP for now)
import { Suggestion } from "./suggestion.tsx";

// ============================================================================
// Type Definitions
// ============================================================================

// TranscriptionData comes from ct-voice-input
interface TranscriptionData {
  id: string;
  text: string;
  chunks?: Array<{ timestamp: [number, number]; text: string }>;
  duration: number;
  timestamp: number;
}

type ProcessingStatus =
  | "unprocessed"
  | "processing"
  | "processed"
  | "needs-attention";

interface ProcessedAction {
  type: "added" | "created" | "updated";
  targetPattern: string;
  targetCell?: Cell<any>;
  description: string;
}

interface ProcessingResult {
  actions: ProcessedAction[];
  error?: string;
  suggestionCell?: Cell<any>;
}

interface TranscriptionEntry {
  id: string;
  text: string;
  duration: number;
  timestamp: number;
  status: ProcessingStatus;
  processingResult?: ProcessingResult;
}

// ============================================================================
// Handlers
// ============================================================================

const handleTranscriptionComplete = handler<
  { detail: { transcription: TranscriptionData } },
  { transcriptions: Cell<TranscriptionEntry[]> }
>(({ detail }, { transcriptions }) => {
  const entry: TranscriptionEntry = {
    id: detail.transcription.id,
    text: detail.transcription.text,
    duration: detail.transcription.duration,
    timestamp: detail.transcription.timestamp,
    status: "processing",
  };

  console.log("[brain-dump] New transcription:", entry.text);
  transcriptions.push(entry);
});

const dismissEntry = handler<
  unknown,
  { transcriptions: Cell<TranscriptionEntry[]>; entryId: string }
>((_event, { transcriptions, entryId }) => {
  const current = transcriptions.get();
  transcriptions.set(current.filter((e) => e.id !== entryId));
});

const retryEntry = handler<
  unknown,
  { transcriptions: Cell<TranscriptionEntry[]>; entryId: string }
>((_event, { transcriptions, entryId }) => {
  const current = transcriptions.get();
  const index = current.findIndex((e) => e.id === entryId);
  if (index >= 0) {
    const updated = [...current];
    updated[index] = {
      ...updated[index],
      status: "processing",
      processingResult: undefined,
    };
    transcriptions.set(updated);
  }
});

const navigateToResult = handler<
  unknown,
  { targetCell: Cell<any> }
>((_event, { targetCell }) => {
  return navigateTo(targetCell);
});

// ============================================================================
// Pattern Definition
// ============================================================================

interface BrainDumpInput {
  title?: Cell<Default<string, "Brain Dump">>;
}

export default pattern<BrainDumpInput>(
  ({ title }) => {
    // State
    const transcriptions = cell<TranscriptionEntry[]>([]);
    const currentTranscription = cell<TranscriptionData | null>(null);
    const showProcessed = cell<boolean>(false);

    // Computed filters
    const unprocessed = computed(() =>
      transcriptions.get().filter((t) =>
        t.status === "unprocessed" ||
        t.status === "processing" ||
        t.status === "needs-attention"
      )
    );

    const processed = computed(() =>
      transcriptions.get().filter((t) => t.status === "processed")
    );

    // Process each transcription with Suggestion
    // Note: We need to create suggestions for entries marked as "processing"
    const entriesWithSuggestions = transcriptions.map((entry) => {
      // Only process entries in "processing" status
      if (entry.status !== "processing") {
        return { entry, suggestion: null };
      }

      const situation = `User spoke: "${entry.text}"

Your task: Route this voice input to appropriate patterns in the user's space.

Guidelines:
- If it mentions shopping/groceries: add items to shopping list
- If it's a task/todo: add to todo list
- If it's a note/thought: create a new note
- If it contains multiple intents: split into multiple actions
- If unclear what to do: return error so user can handle manually

Use listPatternIndex to see available patterns.
Use fetchAndRunPattern to instantiate or find patterns.
Use navigateToPattern if you want to show the result.

Return a cell reference to the pattern you created or modified.`;

      const suggestion = Suggestion({
        situation,
        context: {
          transcriptionText: entry.text,
          timestamp: entry.timestamp,
        },
      });

      // Watch for completion and update the transcriptions cell
      derive(suggestion, (result) => {
        if (!result) return; // Still pending

        const current = transcriptions.get();
        const index = current.findIndex((e) => e.id === entry.id);
        if (index < 0) return;

        const updated = [...current];

        if (result.cell) {
          // Success!
          console.log("[brain-dump] Suggestion succeeded for:", entry.text);
          updated[index] = {
            ...updated[index],
            status: "processed",
            processingResult: {
              actions: [
                {
                  type: "created",
                  targetPattern: "Pattern",
                  targetCell: result.cell,
                  description: "Processed successfully",
                },
              ],
            },
          };
        } else if (result.error) {
          // Failed
          console.log("[brain-dump] Suggestion failed:", result.error);
          updated[index] = {
            ...updated[index],
            status: "needs-attention",
            processingResult: {
              actions: [],
              error: result.error,
            },
          };
        } else {
          // Ambiguous or couldn't process
          console.log("[brain-dump] Suggestion ambiguous for:", entry.text);
          updated[index] = {
            ...updated[index],
            status: "needs-attention",
            processingResult: {
              actions: [],
              error: "Could not process automatically",
              suggestionCell: result.cell,
            },
          };
        }

        transcriptions.set(updated);
      });

      return { entry, suggestion };
    });

    // ========================================================================
    // UI Components
    // ========================================================================

    const TranscriptionEntryView = ({ entry }: { entry: TranscriptionEntry }) => {
      const statusIcon = {
        unprocessed: "⏳",
        processing: "🔄",
        processed: "✅",
        "needs-attention": "⚠️",
      }[entry.status];

      const timestamp = new Date(entry.timestamp).toLocaleString();

      return (
        <div
          style={{
            padding: "1rem",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            marginBottom: "0.75rem",
          }}
        >
          {/* Header: timestamp and status */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span style={{ fontSize: "18px" }}>{statusIcon}</span>
              <small style={{ color: "#6b7280", fontSize: "12px" }}>
                {timestamp}
              </small>
            </div>
            <ct-button
              variant="ghost"
              size="sm"
              onClick={dismissEntry({ transcriptions, entryId: entry.id })}
              style={{ color: "#9ca3af" }}
            >
              ×
            </ct-button>
          </div>

          {/* Transcription text */}
          <p style={{ margin: "0.5rem 0", fontSize: "15px", lineHeight: "1.5" }}>
            {entry.text}
          </p>

          {/* Duration */}
          <small style={{ color: "#9ca3af", fontSize: "11px" }}>
            {entry.duration.toFixed(1)}s
          </small>

          {/* Processing indicator */}
          {entry.status === "processing" && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.5rem",
                background: "#eff6ff",
                borderRadius: "6px",
                fontSize: "13px",
                color: "#2563eb",
              }}
            >
              🤖 Processing with AI...
            </div>
          )}

          {/* Processed result */}
          {entry.status === "processed" && entry.processingResult && (
            <div style={{ marginTop: "0.75rem" }}>
              {entry.processingResult.actions.map((action) => (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem",
                    background: "#f0fdf4",
                    borderRadius: "6px",
                    fontSize: "13px",
                    color: "#16a34a",
                  }}
                >
                  <span>{action.description}</span>
                  {action.targetCell && (
                    <ct-button
                      variant="ghost"
                      size="sm"
                      onClick={navigateToResult({ targetCell: action.targetCell })}
                      style={{ fontSize: "12px", color: "#0066cc" }}
                    >
                      View →
                    </ct-button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Needs attention */}
          {entry.status === "needs-attention" && entry.processingResult && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.75rem",
                background: "#fef3c7",
                border: "1px solid #fbbf24",
                borderRadius: "6px",
              }}
            >
              <div style={{ fontSize: "13px", color: "#92400e", marginBottom: "0.5rem" }}>
                {entry.processingResult.error || "Couldn't process automatically"}
              </div>
              <ct-button
                variant="secondary"
                size="sm"
                onClick={retryEntry({ transcriptions, entryId: entry.id })}
              >
                🔄 Retry
              </ct-button>
            </div>
          )}
        </div>
      );
    };

    // ========================================================================
    // Main UI
    // ========================================================================

    return {
      [NAME]: title,
      [UI]: (
        <ct-screen>
          <div slot="header">
            <ct-input $value={title} placeholder="Brain Dump" readonly />
          </div>

          <ct-vstack gap="3" style={{ padding: "1rem", maxWidth: "800px", margin: "0 auto", width: "100%" }}>
            {/* Section 1: Voice Input */}
            <ct-card>
              <div style={{ padding: "1.5rem" }}>
                <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "18px" }}>
                  🎤 Capture Your Thoughts
                </h3>
                <p style={{ color: "#6b7280", fontSize: "14px", marginBottom: "1rem" }}>
                  Hold the button to record. Release to transcribe and process automatically.
                </p>

                <ct-voice-input
                  $transcription={currentTranscription}
                  recordingMode="hold"
                  autoTranscribe={true}
                  maxDuration={120}
                  showWaveform={true}
                  onct-transcription-complete={handleTranscriptionComplete({
                    transcriptions,
                  })}
                />
              </div>
            </ct-card>

            {/* Section 2: To Process */}
            {ifElse(
              derive(unprocessed, (u) => u.length > 0),
              <ct-card>
                <div style={{ padding: "1.5rem" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "1rem", fontSize: "18px" }}>
                    📋 To Process ({derive(unprocessed, (u) => u.length)})
                  </h3>
                  {derive(unprocessed, (u) => u.map((entry) =>
                    <TranscriptionEntryView entry={entry} />
                  ))}
                </div>
              </ct-card>,
              null
            )}

            {/* Section 3: Processed (collapsible) */}
            {ifElse(
              derive(processed, (p) => p.length > 0),
              <ct-card>
                <div style={{ padding: "1.5rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "1rem",
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: "18px" }}>
                      ✅ Processed ({derive(processed, (p) => p.length)})
                    </h3>
                    <ct-button
                      variant="ghost"
                      size="sm"
                      onClick={handler<unknown, { showProcessed: Cell<boolean> }>(
                        (_event, { showProcessed }) => {
                          showProcessed.set(!showProcessed.get());
                        }
                      )({ showProcessed })}
                    >
                      {derive(showProcessed, (show) => show ? "Hide ▲" : "Show ▼")}
                    </ct-button>
                  </div>

                  {ifElse(
                    showProcessed,
                    <div>
                      {derive(processed, (p) => p.map((entry) =>
                        <TranscriptionEntryView entry={entry} />
                      ))}
                    </div>,
                    null
                  )}
                </div>
              </ct-card>,
              null
            )}
          </ct-vstack>
        </ct-screen>
      ),
      transcriptions,
    };
  }
);
