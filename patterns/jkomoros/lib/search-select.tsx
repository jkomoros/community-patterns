/// <cts-enable />
import {
  Cell,
  cell,
  Default,
  derive,
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

  // Currently selected values (bidirectional Cell from parent)
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
    // Derived Data
    // -------------------------------------------------------------------------

    // Normalize items (ensure all have labels)
    const normalizedItems = derive(
      [items],
      ([itemList]: [SearchSelectItem[]]) =>
        itemList.map((item) => ({
          value: item.value,
          label: item.label ?? item.value,
          group: item.group,
        })),
    );

    // Build lookup map for display (value -> item)
    const itemMap = derive(
      [normalizedItems],
      ([itemList]: [NormalizedItem[]]) =>
        new Map(itemList.map((item) => [item.value, item])),
    );

    // Available options (not already selected)
    const availableItems = derive(
      [normalizedItems, selected],
      ([itemList, sel]: [NormalizedItem[], string[]]) =>
        itemList.filter((item) => !sel.includes(item.value)),
    );

    // Filtered options based on search query
    const filteredItems = derive(
      [searchQuery, availableItems, maxVisible],
      ([query, available, max]: [string, NormalizedItem[], number]) => {
        if (!query.trim()) return available.slice(0, max);
        const q = query.toLowerCase();
        return available
          .filter(
            (item) =>
              item.label.toLowerCase().includes(q) ||
              item.value.toLowerCase().includes(q) ||
              (item.group?.toLowerCase().includes(q) ?? false),
          )
          .slice(0, max);
      },
    );

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    // Add item to selected (value captured in closure via factory)
    const createAddHandler = (valueToAdd: string) =>
      handler<
        Record<string, never>,
        { selected: Cell<string[]>; isOpen: Cell<boolean>; searchQuery: Cell<string> }
      >((_, state) => {
        const current = state.selected.get();
        if (!current.includes(valueToAdd)) {
          state.selected.set([...current, valueToAdd]);
        }
        // Clear search and close dropdown after selection
        state.searchQuery.set("");
        state.isOpen.set(false);
      });

    // Remove item from selected (value captured in closure via factory)
    const createRemoveHandler = (valueToRemove: string) =>
      handler<Record<string, never>, { selected: Cell<string[]> }>(
        (_, state) => {
          const current = state.selected.get();
          state.selected.set(current.filter((v) => v !== valueToRemove));
        },
      );

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

    // Update search query
    const updateSearch = handler<
      { target: { value: string } },
      { searchQuery: Cell<string> }
    >((event, state) => {
      state.searchQuery.set(event.target.value);
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
            {derive(
              [selected, itemMap],
              ([sel, map]: [string[], Map<string, NormalizedItem>]) =>
                sel.map((value, index) => {
                  const item = map.get(value);
                  const label = item?.label ?? value;
                  return (
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
                      <span>{label}</span>
                      <span
                        onClick={createRemoveHandler(value)({ selected })}
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
                  );
                }),
            )}

            {/* Add button */}
            <ct-button
              size="sm"
              variant="secondary"
              onClick={toggleDropdown({ isOpen, searchQuery })}
            >
              + Add
            </ct-button>
          </div>

          {/* Dropdown */}
          {derive([isOpen], ([open]: [boolean]) =>
            open ? (
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
                <div style={{ padding: "8px", borderBottom: "1px solid #e2e8f0" }}>
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
                  {derive(
                    [filteredItems],
                    ([items]: [NormalizedItem[]]) =>
                      items.length === 0 ? (
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
                        items.map((item, index) => (
                          <div
                            key={index}
                            onClick={createAddHandler(item.value)({
                              selected,
                              isOpen,
                              searchQuery,
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
                      ),
                  )}
                </div>
              </div>
            ) : null,
          )}
        </div>
      ),
    };
  },
);
