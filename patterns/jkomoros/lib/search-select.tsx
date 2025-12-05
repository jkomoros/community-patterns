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
// Helpers
// =============================================================================

// Safely unwrap a value that might be a Cell or already unwrapped
// deno-lint-ignore no-explicit-any
function safeUnwrap<T>(value: T | Cell<T> | undefined, defaultValue: T): T {
  if (value === undefined || value === null) return defaultValue;
  // Check for Cell-like objects (have .get and .set methods, and are not Map/Set)
  // deno-lint-ignore no-explicit-any
  const v = value as any;
  if (
    typeof v === "object" &&
    typeof v.get === "function" &&
    typeof v.set === "function" &&
    !(v instanceof Map) &&
    !(v instanceof Set)
  ) {
    return v.get() ?? defaultValue;
  }
  return value as T;
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
      // deno-lint-ignore no-explicit-any
      ([itemList]: [any]) => {
        const list = safeUnwrap<SearchSelectItem[]>(itemList, []);
        return list.map((item) => ({
          value: item.value,
          label: item.label ?? item.value,
          group: item.group,
        }));
      },
    );

    // Build lookup object for display (value -> item)
    // Using plain object instead of Map since Maps don't serialize well
    const itemLookup = derive(
      [normalizedItems],
      // deno-lint-ignore no-explicit-any
      ([itemList]: [any]) => {
        const list = safeUnwrap<NormalizedItem[]>(itemList, []);
        const lookup: Record<string, NormalizedItem> = {};
        for (const item of list) {
          lookup[item.value] = item;
        }
        return lookup;
      },
    );

    // Available options (not already selected)
    const availableItems = derive(
      [normalizedItems, selected],
      // deno-lint-ignore no-explicit-any
      ([itemList, sel]: [any, any]) => {
        const list = safeUnwrap<NormalizedItem[]>(itemList, []);
        const selectedValues = safeUnwrap<string[]>(sel, []);
        return list.filter((item) => !selectedValues.includes(item.value));
      },
    );

    // Filtered options based on search query
    const filteredItems = derive(
      [searchQuery, availableItems, maxVisible],
      // deno-lint-ignore no-explicit-any
      ([query, available, max]: [any, any, any]) => {
        const q = safeUnwrap<string>(query, "");
        const availableList = safeUnwrap<NormalizedItem[]>(available, []);
        const maxNum = safeUnwrap<number>(max, 8);

        if (!q.trim()) return availableList.slice(0, maxNum);
        const qLower = q.toLowerCase();
        return availableList
          .filter(
            (item) =>
              item.label.toLowerCase().includes(qLower) ||
              item.value.toLowerCase().includes(qLower) ||
              (item.group?.toLowerCase().includes(qLower) ?? false),
          )
          .slice(0, maxNum);
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
              [selected, itemLookup],
              // deno-lint-ignore no-explicit-any
              ([sel, lookup]: [any, any]) => {
                const selectedValues = safeUnwrap<string[]>(sel, []);
                const lookupObj = safeUnwrap<Record<string, NormalizedItem>>(
                  lookup,
                  {},
                );
                return selectedValues.map((value, index) => {
                  const item = lookupObj[value];
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
                });
              },
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
          {derive([isOpen], ([open]: [unknown]) => {
            const isOpenValue = safeUnwrap<boolean>(open as boolean, false);
            return isOpenValue ? (
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
                    // deno-lint-ignore no-explicit-any
                    ([items]: [any]) => {
                      const itemList = safeUnwrap<NormalizedItem[]>(items, []);
                      return itemList.length === 0 ? (
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
                        itemList.map((item, index) => (
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
                      );
                    },
                  )}
                </div>
              </div>
            ) : null;
          })}
        </div>
      ),
    };
  },
);
