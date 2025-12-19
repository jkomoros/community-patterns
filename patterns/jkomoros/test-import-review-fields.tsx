/// <cts-enable />
/**
 * TEST: ImportReview Per-Field Diff Mode with SmartTextInput
 *
 * This pattern demonstrates the fieldMappings feature of ImportReview,
 * combined with SmartTextInput for flexible text/image input.
 *
 * KEY CONCEPTS:
 * - extractionInput: The source text for LLM extraction (paste, type, or upload images)
 * - fieldMappings: Map extracted fields to existing data cells
 * - appendMode: Notes field APPENDS extracted info instead of replacing
 * - appendRemainingTextTo: Any unextracted text also goes to notes
 *
 * WORKFLOW:
 * 1. User pastes text OR uploads images (SmartTextInput handles OCR)
 * 2. User clicks "Extract Fields" to run LLM extraction
 * 3. ImportReview shows diff panel with selectable changes
 * 4. User reviews and clicks "Apply" to commit selected changes
 * 5. Unextracted text goes back into the extraction input for refinement
 */
import {
  cell,
  Cell,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
} from "commontools";
import ImportReview, { buildFieldMappingSchema } from "./lib/import-review.tsx";
import SmartTextInput from "./lib/smart-text-input.tsx";

interface TestInput {
  trigger?: Cell<Default<string, "">>;
}

// Handler to trigger extraction from the extractionInput text
const triggerExtract = handler<
  unknown,
  { trigger: Cell<string>; extractionInput: Cell<string> }
>((_, { trigger, extractionInput }) => {
  if (!trigger || !extractionInput) return;
  const text = extractionInput.get() ?? "";
  if (!text.trim()) return;
  // Add timestamp for cache-busting (forces new extraction even with same text)
  trigger.set(`${text}\n---EXTRACT-${Date.now()}---`);
});

export default pattern<TestInput, {}>((props) => {
  // Create internal trigger cell (don't rely on props for this test pattern)
  const trigger = cell<string>("");

  // Current values (simulating existing person data)
  const displayName = cell<string>("Sarah Chen");
  const email = cell<string>("sarah.chen@acme.io");
  const phone = cell<string>("(415) 555-0142");
  const notes = cell<string>("Product manager at Acme Corp. Met at TechCrunch Disrupt 2024. Interested in AI integrations.");

  // Extraction input - the source text for LLM extraction
  // This is where users paste text or upload images for OCR
  const extractionInput = cell<string>("");

  // SmartTextInput for flexible text/image input
  // Handles: typing, pasting, image upload with OCR
  const smartInput = SmartTextInput({
    $value: extractionInput,
    placeholder: "Paste text, type notes, or upload images (business cards, screenshots, etc.)...",
    ocrPrompt: "Extract all text from this image exactly as written, including any contact information, names, emails, phone numbers, and notes.",
  });

  // Build schema from fieldMappings using helper
  // Enable captureRemainingText to get unextracted text back
  const fieldsSchema = Cell.of(buildFieldMappingSchema([
    { key: "displayName", label: "Display Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "notes", label: "Notes" },
  ], { captureRemainingText: true }));

  const fieldsSystemPrompt = Cell.of(
    "Extract person contact information from the text. " +
    "Only include fields that are explicitly mentioned or can be clearly inferred. " +
    "Omit any fields not found in the input - do NOT use placeholders like 'unknown' or 'N/A'."
  );

  // Create ImportReview with fieldMappings
  // - notes has appendMode: new notes APPEND to existing instead of replacing
  // - appendRemainingTextTo: unextracted text also goes to notes
  const extraction = ImportReview({
    trigger,
    schema: fieldsSchema,
    systemPrompt: fieldsSystemPrompt,
    fieldMappings: [
      { key: "displayName", label: "Display Name", currentValue: displayName },
      { key: "email", label: "Email", currentValue: email },
      { key: "phone", label: "Phone", currentValue: phone },
      { key: "notes", label: "Notes", currentValue: notes, appendMode: true },
    ],
    captureRemainingText: true,
    appendRemainingTextTo: "notes",
  });

  // Apply handler - updates cells with selected values from extraction
  // The selectedFieldValues already contains the combined append values
  const applySelectedFields = handler<
    unknown,
    {
      displayName: Cell<string>;
      email: Cell<string>;
      phone: Cell<string>;
      notes: Cell<string>;
      extractionInput: Cell<string>;
      selectedValues: Record<string, unknown>;
      remainingText: string;
      trigger: Cell<string>;
    }
  >((_, ctx) => {
    const selected = ctx.selectedValues ?? {};

    // Apply each selected field (type guard for safety)
    if ("displayName" in selected && typeof selected.displayName === "string") {
      ctx.displayName.set(selected.displayName);
    }
    if ("email" in selected && typeof selected.email === "string") {
      ctx.email.set(selected.email);
    }
    if ("phone" in selected && typeof selected.phone === "string") {
      ctx.phone.set(selected.phone);
    }
    // For notes: selectedFieldValues already contains the combined value
    // (current + separator + extracted + separator + remainingText)
    // So we just set it directly - no manual append needed!
    if ("notes" in selected && typeof selected.notes === "string") {
      ctx.notes.set(selected.notes);
    }

    // Put remaining text back in extraction input for potential refinement
    ctx.extractionInput.set(ctx.remainingText ?? "");

    // Clear trigger to reset extraction state and hide the panel
    ctx.trigger.set("");
  });

  return {
    [NAME]: "Test: ImportReview Field Mode",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 8px 0" }}>Contact Update Review</h1>
          <p style={{ color: "#666", margin: "0 0 16px 0" }}>
            Paste text, type notes, or upload images to extract and review contact updates.
          </p>

          {/* Current values display */}
          <div
            style={{
              marginBottom: "16px",
              padding: "12px",
              background: "#f5f5f5",
              borderRadius: "8px",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>Current Values:</h3>
            <div style={{ fontSize: "14px" }}>
              <div><strong>Name:</strong> {displayName}</div>
              <div><strong>Email:</strong> {email}</div>
              <div><strong>Phone:</strong> {phone}</div>
              <div><strong>Notes:</strong> {derive(notes, (n) => n ? (n.length > 100 ? n.slice(0, 100) + "..." : n) : "(empty)")}</div>
            </div>
          </div>

          {/* Extraction Input area using SmartTextInput */}
          <div style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>Extraction Input:</h3>
            {smartInput.ui.complete}
            <div style={{ marginTop: "8px" }}>
              <ct-button
                variant="primary"
                onClick={triggerExtract({ trigger, extractionInput })}
              >
                Extract Fields
              </ct-button>
            </div>
          </div>

          {/* Field diff panel from ImportReview */}
          {ifElse(
            derive(
              extraction.hasFieldResults,
              (has) => has || extraction.pending || extraction.showFieldEmptyState
            ),
            extraction.ui.fieldDiffPanel,
            null
          )}

          {/* Apply button */}
          {ifElse(
            derive(extraction.selectedFieldCount, (count) => count > 0),
            <div style={{ marginTop: "16px" }}>
              <ct-button
                variant="primary"
                onClick={applySelectedFields({
                  displayName,
                  email,
                  phone,
                  notes,
                  extractionInput,
                  selectedValues: extraction.selectedFieldValues,
                  remainingText: extraction.remainingText,
                  trigger,
                })}
              >
                Apply {extraction.selectedFieldCount} Selected Field(s)
              </ct-button>
            </div>,
            null
          )}

          {/* Debug state */}
          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              background: "#f5f5f5",
              borderRadius: "8px",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "14px" }}>Debug State:</h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "8px",
                fontSize: "12px",
              }}
            >
              <div>Pending: {derive(extraction.pending, String)}</div>
              <div>Has Field Results: {derive(extraction.hasFieldResults, String)}</div>
              <div>Field Diff Count: {extraction.fieldDiffCount}</div>
              <div>Selected Fields: {extraction.selectedFieldCount}</div>
              <div>Error: {derive(extraction.error, (e) => e ? "Yes" : "No")}</div>
              <div style={{ gridColumn: "1 / -1" }}>
                Remaining Text: {derive(extraction.remainingText, (t) => t ? `"${t.slice(0, 50)}${t.length > 50 ? "..." : ""}"` : "(none)")}
              </div>
            </div>
          </div>
        </div>
      </ct-screen>
    ),
  };
});
