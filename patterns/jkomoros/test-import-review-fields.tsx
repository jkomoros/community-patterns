/// <cts-enable />
/**
 * TEST: ImportReview Per-Field Diff Mode
 *
 * This pattern tests the fieldMappings feature of ImportReview.
 * It simulates a simple person-like extraction with field-by-field diff display.
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

interface TestInput {
  trigger?: Cell<Default<string, "">>;
}

// Handler to trigger extraction
const triggerExtract = handler<
  unknown,
  { trigger: Cell<string>; inputText: Cell<string> }
>((_, { trigger, inputText }) => {
  if (!trigger || !inputText) return;
  const text = inputText.get() ?? "";
  if (!text.trim()) return;
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

  // Input text for extraction
  const inputText = cell<string>("");

  // Build schema from fieldMappings using helper
  const fieldsSchema = Cell.of(buildFieldMappingSchema([
    { key: "displayName", label: "Display Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "notes", label: "Notes" },
  ]));

  const fieldsSystemPrompt = Cell.of(
    "Extract person contact information from the text. " +
    "Return displayName (full name), email, phone, and notes (any other relevant info)."
  );

  // Create ImportReview with fieldMappings
  const extraction = ImportReview({
    trigger,
    schema: fieldsSchema,
    systemPrompt: fieldsSystemPrompt,
    fieldMappings: [
      { key: "displayName", label: "Display Name", currentValue: displayName },
      { key: "email", label: "Email", currentValue: email },
      { key: "phone", label: "Phone", currentValue: phone },
      { key: "notes", label: "Notes", currentValue: notes },
    ],
  });

  // Create apply handler that uses the reactive Cell version of selected values
  // NOTE: Functions from sub-patterns don't work due to OpaqueRef wrapping,
  // but computed() values can be passed as handler params and read directly
  const applySelectedFields = handler<
    unknown,
    {
      displayName: Cell<string>;
      email: Cell<string>;
      phone: Cell<string>;
      notes: Cell<string>;
      selectedValues: Record<string, unknown>;  // computed() returns value, not Cell
      trigger: Cell<string>;
    }
  >((_, ctx) => {
    // Read directly - computed() values are already unwrapped
    const selected = ctx.selectedValues ?? {};
    console.log("Applying selected fields:", selected);

    // Apply each selected field
    if ("displayName" in selected && typeof selected.displayName === "string") {
      ctx.displayName.set(selected.displayName);
    }
    if ("email" in selected && typeof selected.email === "string") {
      ctx.email.set(selected.email);
    }
    if ("phone" in selected && typeof selected.phone === "string") {
      ctx.phone.set(selected.phone);
    }
    if ("notes" in selected && typeof selected.notes === "string") {
      ctx.notes.set(selected.notes);
    }

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
            Paste updated contact info below to extract and review changes before applying.
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
              <div><strong>Notes:</strong> {derive(notes, (n) => n || "(empty)")}</div>
            </div>
          </div>

          {/* Input area */}
          <div style={{ marginBottom: "16px" }}>
            <p style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
              Paste updated info from email, LinkedIn, business card, etc:
            </p>
            <ct-textarea
              $value={inputText}
              placeholder="e.g. Sarah just got promoted! Her new title is VP of Product and her new email is sarah.chen@acme.com. She's now based in NYC at (212) 555-8900."
              rows={4}
              style={{ width: "100%", marginBottom: "8px" }}
            />
            <ct-button
              variant="primary"
              onClick={triggerExtract({ trigger, inputText })}
            >
              Extract Fields
            </ct-button>
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
                  selectedValues: extraction.selectedFieldValues,
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
            </div>
          </div>
        </div>
      </ct-screen>
    ),
  };
});
