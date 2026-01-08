/// <cts-enable />
/**
 * @title Person Minimal V2
 * @description V2: Adding ct-autolayout with tabs
 *
 * V1 was fast - no bug. Now adding ct-autolayout to see if that triggers it.
 */
import {
  computed,
  Default,
  generateObject,
  handler,
  NAME,
  recipe,
  str,
  UI,
  Writable,
} from "commontools";

// Minimal extraction result
interface ExtractionResult {
  givenName: string;
  familyName: string;
  email: string;
  remainingNotes: string;
}

// Trigger extraction handler
const triggerExtraction = handler<
  Record<string, never>,
  { notes: string; extractTrigger: Writable<string> }
>(
  (_, { notes, extractTrigger }) => {
    console.log("[PERSON-MIN-V2] Starting extraction...");
    extractTrigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
  },
);

// Input props
interface Input {
  displayName?: Default<string, "">;
  givenName?: Default<string, "">;
  familyName?: Default<string, "">;
  notes?: Default<string, "">;
}

// Output type
interface Output {
  displayName?: string;
  givenName?: string;
  familyName?: string;
  notes?: string;
}

const PersonMinimalV2 = recipe<Input, Output>(
  "Person Minimal V2",
  ({ displayName, givenName, familyName, notes }) => {
    const effectiveDisplayName = computed(() => {
      const name = displayName.trim() || `${givenName} ${familyName}`.trim();
      return name || "(Untitled Person)";
    });

    const extractTrigger = Writable.of<string>("");

    const guardedPrompt = computed(() => {
      const trigger = extractTrigger.get();
      if (trigger && trigger.includes("---EXTRACT-")) {
        return trigger;
      }
      return undefined;
    });

    const { result: extractionResult, pending: extractionPending } = generateObject({
      system: "Extract profile data from the text.",
      prompt: guardedPrompt,
      model: "anthropic:claude-sonnet-4-5",
      schema: {
        type: "object",
        properties: {
          givenName: { type: "string" },
          familyName: { type: "string" },
          email: { type: "string" },
          remainingNotes: { type: "string" },
        },
      },
    });

    const notesDisplay = computed(() => notes || "(empty)");
    const resultDisplay = computed(() =>
      extractionResult ? JSON.stringify(extractionResult, null, 2) : null
    );

    return {
      [NAME]: str`👤 ${effectiveDisplayName}`,
      displayName,
      givenName,
      familyName,
      notes,
      [UI]: (
        <ct-screen>
          <div slot="header">
            <h2>Person Minimal V2</h2>
          </div>

          {/* V2: Adding ct-autolayout with tabs */}
          <ct-autolayout tabNames={["Details", "Notes"]}>
            {/* Tab 1: Details */}
            <div style={{ padding: "1rem" }}>
              <h3>Details Tab</h3>
              <p>Display Name: {effectiveDisplayName}</p>
              {resultDisplay && (
                <div style={{ marginTop: "1rem", padding: "0.5rem", backgroundColor: "#d1fae5" }}>
                  <strong>Extraction Result:</strong>
                  <pre>{resultDisplay}</pre>
                </div>
              )}
            </div>

            {/* Tab 2: Notes */}
            <div style={{ padding: "1rem" }}>
              <h3>Notes Tab</h3>
              <pre style={{ background: "#f5f5f5", padding: "0.5rem", whiteSpace: "pre-wrap" }}>
                {notesDisplay}
              </pre>
              <ct-button
                onClick={triggerExtraction({ notes, extractTrigger })}
                disabled={extractionPending}
              >
                {extractionPending ? "Extracting..." : "Extract Data from Notes"}
              </ct-button>
            </div>
          </ct-autolayout>
        </ct-screen>
      ),
    };
  },
);

export default PersonMinimalV2;
