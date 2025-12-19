/// <cts-enable />
/**
 * TEST: ImportReview Item-List Mode
 *
 * Tests the DEFAULT_SCHEMA mode where items are extracted as a list.
 * This is the simplest ImportReview use case.
 *
 * TESTS:
 * A. Basic Item Extraction - input text, get items with checkboxes
 * B. Selection Management - Select All, Select None, individual toggle
 * C. Item Dismissal - dismiss (X) removes item from list
 * D. NEW Badge Detection - items not in existingItems show NEW badge
 *
 * WORKFLOW:
 * 1. Paste text like "Shopping list: apples, bananas, milk"
 * 2. Click "Extract Items"
 * 3. Items appear with checkboxes (all selected by default)
 * 4. Test selection controls and dismissal
 * 5. Set existingItems to see NEW badge on new items
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

// Handler to clear trigger
const clearTrigger = handler<
  unknown,
  { trigger: Cell<string> }
>((_, { trigger }) => {
  if (!trigger) return;
  trigger.set("");
});

// Handler to toggle existing items mode
const toggleExistingItems = handler<
  unknown,
  { existingItems: Cell<string[]>; enabled: boolean }
>((_, { existingItems, enabled }) => {
  if (!existingItems) return;
  if (enabled) {
    // Set some existing items to test NEW badge
    existingItems.set(["apples", "bananas"]);
  } else {
    existingItems.set([]);
  }
});

export default pattern<TestInput, {}>((props) => {
  // Internal trigger cell
  const trigger = cell<string>("");

  // Input text for extraction
  const inputText = cell<string>("");

  // Existing items (for NEW badge testing)
  const existingItems = cell<string[]>([]);

  // Create ImportReview in item-list mode (no fieldMappings)
  // Uses DEFAULT_SCHEMA which extracts { items: [{ name, description }] }
  const extraction = ImportReview({
    trigger,
    existingItems,
    // getKey and getLabel for item display
    getKey: (item) => {
      if (item && typeof item === "object" && "name" in item) {
        return String((item as { name: string }).name);
      }
      return String(item);
    },
    getLabel: (item) => {
      if (item && typeof item === "object" && "name" in item) {
        const obj = item as { name: string; description?: string };
        return obj.description ? `${obj.name} - ${obj.description}` : obj.name;
      }
      return String(item);
    },
  });

  return {
    [NAME]: "Test: ImportReview Item-List Mode",
    [UI]: (
      <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ padding: "16px", maxWidth: "700px", margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 8px 0" }}>ImportReview Item-List Mode</h1>
          <p style={{ color: "#666", margin: "0 0 24px 0" }}>
            Tests basic item extraction, selection management, dismissal, and NEW badge.
          </p>

          {/* Test Controls */}
          <div style={{
            marginBottom: "24px",
            padding: "16px",
            background: "#f0f9ff",
            borderRadius: "8px",
            border: "1px solid #bae6fd",
          }}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: "16px" }}>Test Controls</h2>

            {/* NEW Badge Testing */}
            <div style={{ marginBottom: "12px" }}>
              <strong>D. NEW Badge Testing:</strong>
              <div style={{ marginTop: "4px", display: "flex", gap: "8px" }}>
                <ct-button
                  variant="secondary"
                  size="sm"
                  onClick={toggleExistingItems({ existingItems, enabled: true })}
                >
                  Set Existing: [apples, bananas]
                </ct-button>
                <ct-button
                  variant="secondary"
                  size="sm"
                  onClick={toggleExistingItems({ existingItems, enabled: false })}
                >
                  Clear Existing Items
                </ct-button>
              </div>
              <div style={{ fontSize: "12px", marginTop: "4px", color: "#666" }}>
                Current: {derive(existingItems, (items) => items.length > 0 ? `[${items.join(", ")}]` : "(none)")}
              </div>
            </div>

            {/* Quick Test Input */}
            <div>
              <strong>Quick Test:</strong>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Try: "Shopping list: apples, bananas, cherries, milk, bread"
              </div>
            </div>
          </div>

          {/* Extraction Input */}
          <div style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>A. Basic Item Extraction:</h3>
            <ct-textarea
              $value={inputText}
              placeholder="Enter text to extract items (e.g., 'Shopping list: apples, bananas, milk')..."
              rows={3}
              style={{ width: "100%", marginBottom: "8px" }}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <ct-button
                variant="primary"
                onClick={triggerExtract({ trigger, inputText })}
              >
                Extract Items
              </ct-button>
              <ct-button
                variant="secondary"
                onClick={clearTrigger({ trigger })}
              >
                Clear / Reset
              </ct-button>
            </div>
          </div>

          {/* Selection Controls */}
          {ifElse(
            derive(extraction.hasResults, (has) => has),
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>B. Selection Management:</h3>
              <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                <ct-button variant="secondary" size="sm" onClick={extraction.selectAll}>
                  Select All
                </ct-button>
                <ct-button variant="secondary" size="sm" onClick={extraction.selectNone}>
                  Select None
                </ct-button>
                <ct-button variant="secondary" size="sm" onClick={extraction.dismissAll}>
                  C. Dismiss All
                </ct-button>
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Selected: {extraction.selectedCount} of {extraction.itemCount}
              </div>
            </div>,
            null
          )}

          {/* Review Panel from ImportReview */}
          {ifElse(
            derive(
              extraction.hasResults,
              (has) => has || extraction.pending || extraction.showEmptyState
            ),
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>Item List (with checkboxes):</h3>
              {extraction.ui.reviewPanel}
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
              <div>Has Results: {derive(extraction.hasResults, String)}</div>
              <div>Item Count: {extraction.itemCount}</div>
              <div>Selected Count: {extraction.selectedCount}</div>
              <div>Error: {derive(extraction.error, (e) => e ? "YES" : "no")}</div>
              <div>Show Empty State: {derive(extraction.showEmptyState, String)}</div>
              <div style={{ gridColumn: "1 / -1" }}>
                Existing Items: {derive(existingItems, (items) => items.length > 0 ? `[${items.join(", ")}]` : "(none)")}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                Selected Items: {derive(extraction.selectedItems, (items) =>
                  items.length > 0
                    ? JSON.stringify(items.map((i: unknown) => {
                        if (i && typeof i === "object" && "name" in i) {
                          return (i as { name: string }).name;
                        }
                        return String(i);
                      }))
                    : "(none)"
                )}
              </div>
            </div>
          </div>
        </div>
      </ct-screen>
    ),
  };
});
