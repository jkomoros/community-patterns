/// <cts-enable />

/**
 * Autocomplete Value Demo - Demonstrates ct-autocomplete $value binding
 *
 * This pattern shows the $value binding for ct-autocomplete in both
 * single-select and multi-select modes.
 *
 * Features demonstrated:
 * - Single-select mode with $value binding (shows selected label in input)
 * - Multi-select mode with $value + multiple (adds to array, filters selected)
 * - Backspace to clear in single-select
 * - "Already added" items shown at bottom with remove functionality
 * - Custom values with "Add X" option
 */

import { Writable, computed, Default, NAME, pattern, UI } from "commontools";

// Sample items for demo
const CATEGORY_ITEMS = [
  { value: "work", label: "Work", group: "Activity" },
  { value: "personal", label: "Personal", group: "Activity" },
  { value: "health", label: "Health", group: "Activity" },
  { value: "finance", label: "Finance", group: "Activity" },
  { value: "urgent", label: "Urgent", group: "Priority" },
  { value: "important", label: "Important", group: "Priority" },
  { value: "low", label: "Low Priority", group: "Priority" },
];

type Input = {
  // Single select value
  singleValue: Writable<Default<string, "">>;
  // Multi select values
  multiValues: Writable<Default<string[], []>>;
};

type Result = {
  singleValue: string;
  multiValues: string[];
};

// Get label for a value
const getLabel = (value: string) => {
  const item = CATEGORY_ITEMS.find(i => i.value === value);
  return item?.label || value;
};

export default pattern<Input, Result>(
  ({ singleValue, multiValues }) => {
    return {
      [NAME]: "Autocomplete Value Demo",
      [UI]: (
        <ct-vstack gap="4" style={{ padding: "1rem", maxWidth: "500px" }}>
          <h2>Autocomplete Value Binding Demo</h2>
          <p style={{ color: "#666", fontSize: "0.875rem" }}>
            Demonstrates the new <code>$value</code> binding for ct-autocomplete
            in single-select and multi-select modes.
          </p>

          {/* Single Select Section */}
          <ct-card>
            <ct-vstack gap="3">
              <label style={{ fontWeight: "500" }}>Single Select (with $value)</label>
              <ct-autocomplete
                items={CATEGORY_ITEMS}
                $value={singleValue}
                placeholder="Select a category..."
                allowCustom={true}
              />
              <div style={{ fontSize: "0.75rem", color: "#666" }}>
                Selected: <strong>{computed(() => singleValue.get() || "(none)")}</strong>
              </div>
            </ct-vstack>
          </ct-card>

          {/* Multi Select Section */}
          <ct-card>
            <ct-vstack gap="3">
              <label style={{ fontWeight: "500" }}>Multi Select (with $value + multiple)</label>

              {/* Tag display for selected items */}
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                minHeight: "2rem",
              }}>
                {multiValues.map((value: string) => (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      padding: "0.25rem 0.5rem",
                      backgroundColor: "#dbeafe",
                      color: "#1e40af",
                      borderRadius: "9999px",
                      fontSize: "0.875rem",
                    }}
                  >
                    {getLabel(value)}
                    <button
                      onClick={() => {
                        const current = multiValues.get() || [];
                        multiValues.set(current.filter(v => v !== value));
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "1rem",
                        height: "1rem",
                        padding: "0",
                        border: "none",
                        background: "transparent",
                        color: "#3b82f6",
                        cursor: "pointer",
                        borderRadius: "50%",
                        fontSize: "1rem",
                        lineHeight: "1",
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <ct-autocomplete
                items={CATEGORY_ITEMS}
                $value={multiValues}
                multiple={true}
                placeholder="Search to add tags..."
                allowCustom={true}
              />
              <div style={{ fontSize: "0.75rem", color: "#666" }}>
                Count: {computed(() => (multiValues.get() || []).length)} selected
              </div>
            </ct-vstack>
          </ct-card>

          {/* Debug output */}
          <ct-card>
            <ct-vstack gap="2">
              <label style={{ fontWeight: "500", fontSize: "0.875rem" }}>Debug State</label>
              <code style={{
                padding: "0.5rem",
                backgroundColor: "#f3f4f6",
                borderRadius: "0.25rem",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
              }}>
                {computed(() =>
                  `singleValue: ${JSON.stringify(singleValue.get())}`
                )}
              </code>
              <code style={{
                padding: "0.5rem",
                backgroundColor: "#f3f4f6",
                borderRadius: "0.25rem",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
              }}>
                {computed(() =>
                  `multiValues: ${JSON.stringify(multiValues.get() || [])}`
                )}
              </code>
            </ct-vstack>
          </ct-card>

          <p style={{ color: "#666", fontSize: "0.75rem" }}>
            The single-select shows the selected label in the input. The multi-select
            filters out already-selected items from the dropdown.
          </p>
        </ct-vstack>
      ),
      singleValue,
      multiValues,
    };
  }
);
