/// <cts-enable />
import {
  Cell,
  cell,
  computed,
  Default,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";

// =============================================================================
// Types
// =============================================================================

/**
 * Item in the options list.
 * - value: The actual value stored in selected array
 * - label: Display label (defaults to value if not provided)
 * - group: Category shown as smaller text to disambiguate
 */
export interface SearchSelectItem {
  value: string;
  label?: string;
  group?: string;
}

// Normalized item (always has label)
interface NormalizedItem {
  value: string;
  label: string;
  group?: string;
}

// =============================================================================
// Input/Output Schema
// =============================================================================

interface SearchSelectInput {
  // The full list of available options
  items: Default<SearchSelectItem[], []>;

  // Currently selected values (Cell for write access from handlers)
  selected: Cell<string[]>;

  // UI configuration
  placeholder?: Default<string, "Search...">;
  maxVisible?: Default<number, 8>;
}

interface SearchSelectOutput {
  selected: Cell<string[]>;
}

// =============================================================================
// Pattern
// =============================================================================

export default pattern<SearchSelectInput, SearchSelectOutput>(
  ({ items, selected, placeholder, maxVisible }) => {
    // -------------------------------------------------------------------------
    // Local UI State
    // -------------------------------------------------------------------------
    const searchQuery = cell("");
    const isOpen = cell(false);

    // -------------------------------------------------------------------------
    // Derived Data (using computed() with direct cell access)
    // -------------------------------------------------------------------------

    // Normalize items (ensure all have labels)
    const normalizedItems = computed(() =>
      items.map((item) => ({
        value: item.value,
        label: item.label ?? item.value,
        group: item.group,
      }))
    );

    // Build lookup object for display (value -> item)
    const itemLookup = computed(() => {
      const lookup: Record<string, NormalizedItem> = {};
      for (const item of normalizedItems) {
        lookup[item.value] = item;
      }
      return lookup;
    });

    // Pre-compute selected items with resolved labels
    // (Can't access computed values inside JSX .map() callbacks)
    const selectedWithLabels = computed(() => {
      const sel = selected.get();
      return sel.map((value) => ({
        value,
        label: itemLookup[value]?.label ?? value,
      }));
    });

    // Available options (not already selected)
    const availableItems = computed(() => {
      const sel = selected.get();
      return normalizedItems.filter((item) => !sel.includes(item.value));
    });

    // Filtered options based on search query
    const filteredItems = computed(() => {
      const q = searchQuery.get().trim().toLowerCase();
      const max = maxVisible ?? 8;

      if (!q) return availableItems.slice(0, max);

      return availableItems
        .filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.value.toLowerCase().includes(q) ||
            (item.group?.toLowerCase().includes(q) ?? false)
        )
        .slice(0, max);
    });

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    // Add item to selected (value passed as state, not closure)
    const addItem = handler<
      Record<string, never>,
      {
        selected: Cell<string[]>;
        isOpen: Cell<boolean>;
        searchQuery: Cell<string>;
        value: string;
      }
    >((_, state) => {
      const current = state.selected.get();
      if (!current.includes(state.value)) {
        state.selected.set([...current, state.value]);
      }
      // Clear search and close dropdown after selection
      state.searchQuery.set("");
      state.isOpen.set(false);
    });

    // Remove item from selected (value passed as state, not closure)
    const removeItem = handler<
      Record<string, never>,
      { selected: Cell<string[]>; value: string }
    >((_, { selected, value }) => {
      const current = selected.get();
      selected.set(current.filter((v) => v !== value));
    });

    // Toggle dropdown
    const toggleDropdown = handler<
      Record<string, never>,
      { isOpen: Cell<boolean>; searchQuery: Cell<string> }
    >((_, state) => {
      const wasOpen = state.isOpen.get();
      state.isOpen.set(!wasOpen);
      if (wasOpen) {
        state.searchQuery.set("");
      }
    });

    // -------------------------------------------------------------------------
    // UI
    // -------------------------------------------------------------------------

    return {
      [NAME]: "Search Select",
      selected,
      [UI]: (
        <div style={{ position: "relative" }}>
          {/* Selected chips + Add button */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              alignItems: "center",
            }}
          >
            {/* Render selected items as chips */}
            {selectedWithLabels.map((item, index) => (
              <div
                key={index}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 10px",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: "9999px",
                  fontSize: "13px",
                }}
              >
                <span>{item.label}</span>
                <span
                  onClick={removeItem({ selected, value: item.value })}
                  style={{
                    cursor: "pointer",
                    marginLeft: "2px",
                    color: "#94a3b8",
                    fontWeight: "bold",
                  }}
                >
                  ×
                </span>
              </div>
            ))}

            {/* Add button */}
            <ct-button
              size="sm"
              variant="secondary"
              onClick={toggleDropdown({ isOpen, searchQuery })}
            >
              + Add
            </ct-button>
          </div>

          {/* Dropdown - using computed for conditional */}
          {computed(() =>
            isOpen.get() ? (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: "0",
                  marginTop: "4px",
                  minWidth: "250px",
                  maxWidth: "350px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  zIndex: "100",
                  overflow: "hidden",
                }}
              >
                {/* Search input */}
                <div
                  style={{ padding: "8px", borderBottom: "1px solid #e2e8f0" }}
                >
                  <ct-input
                    placeholder={placeholder}
                    $value={searchQuery}
                    style={{ width: "100%" }}
                  />
                </div>

                {/* Options list */}
                <div
                  style={{
                    maxHeight: "240px",
                    overflowY: "auto",
                    padding: "4px",
                  }}
                >
                  {filteredItems.length === 0 ? (
                    <div
                      style={{
                        padding: "12px",
                        textAlign: "center",
                        color: "#94a3b8",
                        fontSize: "13px",
                      }}
                    >
                      No matching options
                    </div>
                  ) : (
                    filteredItems.map((item, index) => (
                      <div
                        key={index}
                        onClick={addItem({
                          selected,
                          isOpen,
                          searchQuery,
                          value: item.value,
                        })}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          cursor: "pointer",
                          borderRadius: "4px",
                          fontSize: "14px",
                        }}
                      >
                        <span>{item.label}</span>
                        {item.group && (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#94a3b8",
                              marginLeft: "12px",
                            }}
                          >
                            {item.group}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null
          )}
        </div>
      ),
    };
  }
);
