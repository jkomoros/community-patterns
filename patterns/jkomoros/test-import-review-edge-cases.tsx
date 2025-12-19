/// <cts-enable />
/**
 * TEST: ImportReview Edge Cases
 *
 * Tests three previously-untested features:
 * 1. Error Handling - error state display and dismissError handler
 * 2. Stale Field Detection - hasStaleFields when currentValue changes post-extraction
 * 3. Placeholder Filtering - verifies UNKNOWN, N/A, etc. are filtered out
 *
 * WORKFLOW:
 * - Section A: Error handling - trigger extraction, view error state, dismiss
 * - Section B: Stale detection - extract, modify field via button, see warning
 * - Section C: Placeholder filtering - input lacking some fields, verify filtering
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

// Handler to modify a field value (tests stale detection)
const modifyField = handler<
  unknown,
  { field: Cell<string>; newValue: string }
>((_, { field, newValue }) => {
  if (!field) return;
  field.set(newValue);
});

// Handler to clear trigger (reset state)
const clearTrigger = handler<
  unknown,
  { trigger: Cell<string> }
>((_, { trigger }) => {
  if (!trigger) return;
  trigger.set("");
});

export default pattern<TestInput, {}>((props) => {
  // Internal trigger cell
  const trigger = cell<string>("");

  // Input text for extraction
  const inputText = cell<string>("");

  // Field values for stale detection testing
  const displayName = cell<string>("Alice Smith");
  const email = cell<string>("alice@example.com");
  const phone = cell<string>("555-1234");
  const company = cell<string>("Acme Corp");

  // Schema for field extraction
  const fieldsSchema = Cell.of(buildFieldMappingSchema([
    { key: "displayName", label: "Display Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "company", label: "Company" },
  ]));

  const fieldsSystemPrompt = Cell.of(
    "Extract person contact information from the text. " +
    "Only include fields that are explicitly mentioned. " +
    "Omit any fields not found - do NOT use placeholders like 'unknown' or 'N/A'."
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
      { key: "company", label: "Company", currentValue: company },
    ],
  });

  return {
    [NAME]: "Test: ImportReview Edge Cases",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ padding: "16px", maxWidth: "700px", margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 8px 0" }}>ImportReview Edge Cases Test</h1>
          <p style={{ color: "#666", margin: "0 0 24px 0" }}>
            Tests error handling, stale field detection, and placeholder filtering.
          </p>

          {/* Section A: Error Handling */}
          <div style={{
            marginBottom: "24px",
            padding: "16px",
            background: "#fef2f2",
            borderRadius: "8px",
            border: "1px solid #fecaca",
          }}>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>A. Error Handling</h2>
            <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#666" }}>
              The error state displays when extraction fails. Click "Dismiss" to clear.
            </p>
            <div style={{ fontSize: "14px" }}>
              <strong>Error State:</strong>{" "}
              {derive(extraction.error, (e) => e ? `YES - ${String(e).slice(0, 100)}` : "none")}
            </div>
          </div>

          {/* Section B: Stale Field Detection */}
          <div style={{
            marginBottom: "24px",
            padding: "16px",
            background: "#fefce8",
            borderRadius: "8px",
            border: "1px solid #fef08a",
          }}>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>B. Stale Field Detection</h2>
            <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#666" }}>
              After extraction, click "Modify Name" to change the displayName field.
              A stale warning should appear in the diff panel.
            </p>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <ct-button
                variant="secondary"
                size="sm"
                onClick={modifyField({ field: displayName, newValue: "Bob Jones (MODIFIED)" })}
              >
                Modify Name
              </ct-button>
              <ct-button
                variant="secondary"
                size="sm"
                onClick={modifyField({ field: displayName, newValue: "Alice Smith" })}
              >
                Reset Name
              </ct-button>
            </div>
            <div style={{ fontSize: "14px" }}>
              <strong>Current Name:</strong> {displayName}
            </div>
            <div style={{ fontSize: "14px" }}>
              <strong>Has Stale Fields:</strong>{" "}
              {derive(extraction.hasStaleFields, (s) => s ? "YES - Warning should appear!" : "no")}
            </div>
          </div>

          {/* Section C: Placeholder Filtering */}
          <div style={{
            marginBottom: "24px",
            padding: "16px",
            background: "#f0fdf4",
            borderRadius: "8px",
            border: "1px solid #bbf7d0",
          }}>
            <h2 style={{ margin: "0 0 8px 0", fontSize: "16px" }}>C. Placeholder Filtering</h2>
            <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#666" }}>
              Try input that lacks some fields (e.g., no phone/company).
              Fields with UNKNOWN, N/A, etc. should be filtered out of the diff.
            </p>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>
              <strong>Test Input:</strong> "Contact Bob at bob@test.com"
              <br />
              <strong>Expected:</strong> Only displayName and email should appear (phone/company filtered)
            </div>
          </div>

          {/* Extraction Input */}
          <div style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>Extraction Input:</h3>
            <ct-textarea
              $value={inputText}
              placeholder="Enter text to extract (e.g., 'Contact Bob at bob@test.com')..."
              rows={3}
              style={{ width: "100%", marginBottom: "8px" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <ct-button
                variant="primary"
                onClick={triggerExtract({ trigger, inputText })}
              >
                Extract Fields
              </ct-button>
              <ct-button
                variant="secondary"
                onClick={clearTrigger({ trigger })}
              >
                Clear / Reset
              </ct-button>
            </div>
          </div>

          {/* Field Diff Panel from ImportReview */}
          {ifElse(
            derive(
              extraction.hasFieldResults,
              (has) => has || extraction.pending || extraction.showFieldEmptyState
            ),
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>Field Diff Panel:</h3>
              {extraction.ui.fieldDiffPanel}
            </div>,
            null
          )}

          {/* Debug State Panel */}
          <div style={{
            marginTop: "24px",
            padding: "16px",
            background: "#f5f5f5",
            borderRadius: "8px",
          }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "14px" }}>Debug State:</h3>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "8px",
              fontSize: "12px",
            }}>
              <div>Pending: {derive(extraction.pending, String)}</div>
              <div>Has Field Results: {derive(extraction.hasFieldResults, String)}</div>
              <div>Field Diff Count: {extraction.fieldDiffCount}</div>
              <div>Selected Fields: {extraction.selectedFieldCount}</div>
              <div>Error: {derive(extraction.error, (e) => e ? "YES" : "no")}</div>
              <div>Has Stale Fields: {derive(extraction.hasStaleFields, String)}</div>
              <div style={{ gridColumn: "1 / -1" }}>
                Trigger: {derive(trigger, (t) => t ? `"${t.slice(0, 50)}..."` : "(empty)")}
              </div>
            </div>
          </div>
        </div>
      </ct-screen>
    ),
  };
});
