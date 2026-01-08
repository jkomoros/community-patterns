/// <cts-enable />
/**
 * @title Person Minimal V1
 * @description Stripped down person.tsx - minimal skeleton to find bug trigger
 *
 * This is person.tsx stripped to the absolute minimum while keeping the recipe structure.
 * We'll add complexity back piece by piece to find what triggers the bug.
 *
 * V1: Just recipe + generateObject + simple UI (no ct-autolayout, no ifElse)
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
    console.log("[PERSON-MIN-V1] Starting extraction...");
    extractTrigger.set(`${notes}\n---EXTRACT-${Date.now()}---`);
  },
);

// Input props (matching person.tsx structure - optional with defaults)
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

const PersonMinimalV1 = recipe<Input, Output>(
  "Person Minimal V1",
  ({ displayName, givenName, familyName, notes }) => {
    // Single computed for display name
    const effectiveDisplayName = computed(() => {
      const name = displayName.trim() || `${givenName} ${familyName}`.trim();
      return name || "(Untitled Person)";
    });

    // Extraction trigger cell
    const extractTrigger = Writable.of<string>("");

    // Guarded prompt
    const guardedPrompt = computed(() => {
      const trigger = extractTrigger.get();
      if (trigger && trigger.includes("---EXTRACT-")) {
        return trigger;
      }
      return undefined;
    });

    // generateObject call
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

    // Computed for display in UI
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
        <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
          <h2>Person Minimal V1</h2>
          <div style={{ backgroundColor: "#fef3c7", padding: "0.5rem", marginBottom: "1rem" }}>
            <strong>TEST:</strong> Minimal recipe + generateObject (no ct-autolayout)
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <strong>Notes:</strong>
            <pre style={{ background: "#f5f5f5", padding: "0.5rem", whiteSpace: "pre-wrap" }}>
              {notesDisplay}
            </pre>
          </div>

          <ct-button
            onClick={triggerExtraction({ notes, extractTrigger })}
            disabled={extractionPending}
          >
            {extractionPending ? "Extracting..." : "Extract Data from Notes"}
          </ct-button>

          {resultDisplay && (
            <div style={{ marginTop: "1rem", padding: "0.5rem", backgroundColor: "#d1fae5" }}>
              <strong>Result:</strong>
              <pre>{resultDisplay}</pre>
            </div>
          )}
        </div>
      ),
    };
  },
);

export default PersonMinimalV1;
