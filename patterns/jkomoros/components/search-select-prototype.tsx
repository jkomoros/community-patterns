/// <cts-enable />
/**
 * PROTOTYPE: Search-Select Component (User-land Pattern)
 *
 * This is a prototype exploring search-select functionality as a user-land pattern.
 * It demonstrates the desired UX but has limitations that require a proper
 * built-in ct-search-select component.
 *
 * STATUS: Prototype - DO NOT USE in production patterns
 *
 * KNOWN LIMITATIONS:
 * 1. Visual highlight doesn't update when arrow keys are pressed (internal state works)
 * 2. Dropdown position is hardcoded (no getBoundingClientRect access)
 * 3. No programmatic focus control
 *
 * See: patterns/jkomoros/design/todo/ct-search-select-prd.md for the proper component spec
 * See: patterns/jkomoros/issues/ISSUE-Map-Style-Reactivity.md for technical details
 */
import {
  Cell,
  cell,
  computed,
  Default,
  derive,
  handler,
  ifElse,
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
    const highlightedIndex = cell(0); // Index of currently highlighted item

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

    // Get count and highlighted value for keyboard navigation
    const filteredCount = computed(() => filteredItems.length);
    const highlightedValue = computed(() => {
      const idx = highlightedIndex.get();
      const items = filteredItems;
      if (idx >= 0 && idx < items.length) {
        return items[idx]?.value ?? null;
      }
      return null;
    });

    // Pre-compute items with highlight state for rendering
    // Using derive() with single explicit dependency
    // NOTE: Even single-cell derive doesn't auto-unwrap - must call .get()
    const filteredItemsWithHighlight = derive(highlightedIndex, (idx) => {
      const idxVal = (idx as any).get ? (idx as any).get() : idx;
      return filteredItems.map((item, i) => ({
        value: item.value,
        label: item.label,
        group: item.group ?? "",
        highlightBg: i === idxVal ? "#e2e8f0" : "transparent",
      }));
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
        highlightedIndex: Cell<number>;
        value: string;
      }
    >((_, state) => {
      const current = state.selected.get();
      if (!current.includes(state.value)) {
        state.selected.set([...current, state.value]);
      }
      // Clear search, close dropdown, and reset highlight after selection
      state.searchQuery.set("");
      state.isOpen.set(false);
      state.highlightedIndex.set(0);
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
      {
        isOpen: Cell<boolean>;
        searchQuery: Cell<string>;
        highlightedIndex: Cell<number>;
      }
    >((_, state) => {
      const wasOpen = state.isOpen.get();
      state.isOpen.set(!wasOpen);
      if (wasOpen) {
        state.searchQuery.set("");
        state.highlightedIndex.set(0);
      }
    });

    // Close dropdown (for backdrop click or Escape)
    const closeDropdown = handler<
      Record<string, never>,
      {
        isOpen: Cell<boolean>;
        searchQuery: Cell<string>;
        highlightedIndex: Cell<number>;
      }
    >((_, state) => {
      state.isOpen.set(false);
      state.searchQuery.set("");
      state.highlightedIndex.set(0);
    });

    // Move highlight up (for ArrowUp key)
    const moveUp = handler<
      Record<string, never>,
      { isOpen: Cell<boolean>; highlightedIndex: Cell<number> }
    >((_, state) => {
      if (!state.isOpen.get()) return;
      const current = state.highlightedIndex.get();
      if (current > 0) {
        state.highlightedIndex.set(current - 1);
      }
    });

    // Move highlight down (for ArrowDown key)
    // Note: We pass maxItems as state since we can't access filteredItems.length in handler
    const moveDown = handler<
      Record<string, never>,
      {
        isOpen: Cell<boolean>;
        highlightedIndex: Cell<number>;
        maxItems: number;
      }
    >((_, state) => {
      if (!state.isOpen.get()) return;
      const current = state.highlightedIndex.get();
      if (current < state.maxItems - 1) {
        state.highlightedIndex.set(current + 1);
      }
    });

    // Select highlighted item (for Enter key)
    const selectHighlighted = handler<
      Record<string, never>,
      {
        isOpen: Cell<boolean>;
        selected: Cell<string[]>;
        searchQuery: Cell<string>;
        highlightedIndex: Cell<number>;
        highlightedValue: string | null;
      }
    >((_, state) => {
      if (!state.isOpen.get()) return;
      if (!state.highlightedValue) return;

      const current = state.selected.get();
      if (!current.includes(state.highlightedValue)) {
        state.selected.set([...current, state.highlightedValue]);
      }
      state.searchQuery.set("");
      state.isOpen.set(false);
      state.highlightedIndex.set(0);
    });

    // -------------------------------------------------------------------------
    // UI
    // -------------------------------------------------------------------------

    return {
      [NAME]: "Search Select",
      selected,
      [UI]: (
        <div style={{ position: "relative", overflow: "visible" }}>
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
              onClick={toggleDropdown({ isOpen, searchQuery, highlightedIndex })}
            >
              + Add
            </ct-button>
          </div>

          {/* Dropdown with backdrop - using ifElse for conditional rendering */}
          {ifElse(
            isOpen,
            <>
              {/* Keyboard navigation */}
              <ct-keybind
                code="Escape"
                onct-keybind={closeDropdown({
                  isOpen,
                  searchQuery,
                  highlightedIndex,
                })}
              />
              <ct-keybind
                code="ArrowUp"
                ignore-editable={false}
                preventDefault
                onct-keybind={moveUp({ isOpen, highlightedIndex })}
              />
              <ct-keybind
                code="ArrowDown"
                ignore-editable={false}
                preventDefault
                onct-keybind={moveDown({
                  isOpen,
                  highlightedIndex,
                  maxItems: filteredCount,
                })}
              />
              <ct-keybind
                code="Enter"
                ignore-editable={false}
                preventDefault
                onct-keybind={selectHighlighted({
                  isOpen,
                  selected,
                  searchQuery,
                  highlightedIndex,
                  highlightedValue,
                })}
              />
              {/* Invisible backdrop to catch outside clicks */}
              <div
                onClick={closeDropdown({ isOpen, searchQuery, highlightedIndex })}
                style={{
                  position: "fixed",
                  top: "0",
                  left: "0",
                  right: "0",
                  bottom: "0",
                  zIndex: "999",
                }}
              />
              {/* Dropdown panel - using position:fixed to escape all parent overflow constraints */}
              <div
                style={{
                  position: "fixed",
                  top: "280px",
                  left: "100px",
                  width: "320px",
                  maxHeight: "280px",
                  overflowY: "auto",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  zIndex: "1000",
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
                    autofocus
                  />
                </div>

                {/* Options list */}
                <div
                  style={{
                    padding: "4px",
                  }}
                >
                  {ifElse(
                    computed(() => filteredItemsWithHighlight.length === 0),
                    <div
                      style={{
                        padding: "12px",
                        textAlign: "center",
                        color: "#94a3b8",
                        fontSize: "13px",
                      }}
                    >
                      No matching options
                    </div>,
                    filteredItems.map((item, index) => (
                      <div
                        key={index}
                        onClick={addItem({
                          selected,
                          isOpen,
                          searchQuery,
                          highlightedIndex,
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
                          // NOTE: Visual highlight doesn't update reactively - see ISSUE file
                          // The highlightBg is pre-computed but JSX doesn't re-render
                          background: filteredItemsWithHighlight[index]?.highlightBg ?? "transparent",
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
            </>,
            null
          )}
        </div>
      ),
    };
  }
);
