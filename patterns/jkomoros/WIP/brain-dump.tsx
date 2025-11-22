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
  recipe,
  UI,
} from "commontools";

// Suggestion integration removed temporarily - will be re-added with proper architecture

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
  description: string;
}

interface ProcessingResult {
  actions: ProcessedAction[];
  error?: string;
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


const dismissEntry = handler<
  unknown,
  { transcriptions: Cell<TranscriptionEntry[]>; entryId: string }
>((_event, { transcriptions, entryId }) => {
  const current = transcriptions.get();
  transcriptions.set(current.filter((e) => e.id !== entryId));
});

const markProcessed = handler<
  unknown,
  { transcriptions: Cell<TranscriptionEntry[]>; entryId: string }
>((_event, { transcriptions, entryId }) => {
  const current = transcriptions.get();
  const index = current.findIndex((e) => e.id === entryId);
  if (index >= 0) {
    const updated = [...current];
    updated[index] = {
      ...updated[index],
      status: "processed",
      processingResult: {
        actions: [{
          type: "created",
          targetPattern: "Manual",
          description: "Marked as processed manually",
        }],
      },
    };
    transcriptions.set(updated);
  }
});

// ============================================================================
// Pattern Definition
// ============================================================================

interface BrainDumpInput {
  title?: Cell<Default<string, "Brain Dump">>;
}

interface BrainDumpOutput {
  transcriptions: Default<TranscriptionEntry[], []>;
}

export default recipe<BrainDumpInput, BrainDumpOutput>(
  "Brain Dump",
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

    // Handler for transcription complete events
    const handleTranscriptionComplete = handler<
      { detail: { transcription: TranscriptionData } },
      { transcriptions: Cell<TranscriptionEntry[]> }
    >((event, { transcriptions }) => {
      console.log("[brain-dump] Handler called with event:", event);

      if (!event?.detail?.transcription) {
        console.error("[brain-dump] No transcription in event detail:", event);
        return;
      }

      const entry: TranscriptionEntry = {
        id: event.detail.transcription.id,
        text: event.detail.transcription.text,
        duration: event.detail.transcription.duration,
        timestamp: event.detail.transcription.timestamp,
        status: "unprocessed", // Start as unprocessed (manual workflow for now)
      };

      console.log("[brain-dump] New transcription:", entry.text);
      transcriptions.push(entry);
    });

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
                  Hold the button to record. Release to transcribe. Mark items as done when processed.
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
                  {derive(unprocessed, (u) => u.map((entry) => (
                    <div
                      style={{
                        padding: "1rem",
                        background: "white",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <p>{entry.text}</p>
                      <small>{entry.duration.toFixed(1)}s</small>
                    </div>
                  )))}
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
                      {derive(processed, (p) => p.map((entry) => (
                        <div
                          style={{
                            padding: "1rem",
                            background: "white",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            marginBottom: "0.75rem",
                          }}
                        >
                          <p>{entry.text}</p>
                          <small>{entry.duration.toFixed(1)}s</small>
                        </div>
                      )))}
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
