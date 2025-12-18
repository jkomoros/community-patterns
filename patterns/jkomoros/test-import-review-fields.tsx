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
import ImportReview from "./lib/import-review.tsx";

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
  const { trigger } = props;

  // Current values (simulating existing person data)
  const displayName = cell<string>("John Doe");
  const email = cell<string>("john@example.com");
  const phone = cell<string>("555-1234");
  const notes = cell<string>("");

  // Input text for extraction
  const inputText = cell<string>("");

  // Create ImportReview with fieldMappings
  const extraction = ImportReview({
    trigger,
    fieldMappings: [
      { key: "displayName", label: "Display Name", currentValue: displayName },
      { key: "email", label: "Email", currentValue: email },
      { key: "phone", label: "Phone", currentValue: phone },
      { key: "notes", label: "Notes", currentValue: notes },
    ],
  });

  // Store reference to getSelectedFieldValues function
  // NOTE: CTS transformer wraps functions returned from sub-patterns,
  // so we need to cast to bypass TypeScript checking
  const getSelectedFieldValues = extraction.getSelectedFieldValues as unknown as () => Record<string, unknown>;

  // Create apply handler inside pattern to capture extraction closure
  // (handler closures work, but passing functions through handler args doesn't)
  const applySelectedFields = handler<
    unknown,
    {
      displayName: Cell<string>;
      email: Cell<string>;
      phone: Cell<string>;
      notes: Cell<string>;
    }
  >((_, ctx) => {
    // Call getSelectedFieldValues from closure
    const selected = getSelectedFieldValues();
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
  });

  return {
    [NAME]: "Test: ImportReview Field Mode",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 8px 0" }}>ImportReview Field Mode Test</h1>
          <p style={{ color: "#666", margin: "0 0 16px 0" }}>
            Test per-field diff mode with fieldMappings.
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
              Enter text with updated info (e.g., "Updated: Jane Smith, jane@company.com, 555-9999, Prefers morning calls"):
            </p>
            <ct-textarea
              $value={inputText}
              placeholder="Paste text with person info to extract..."
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
            derive(extraction.hasFieldResults, (has) => has || extraction.pending),
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
