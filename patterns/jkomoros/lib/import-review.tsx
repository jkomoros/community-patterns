/// <cts-enable />
import {
  cell,
  Cell,
  computed,
  Default,
  derive,
  generateObject,
  handler,
  ifElse,
  lift,
  NAME,
  pattern,
  UI,
} from "commontools";

/**
 * ImportReview - Composable sub-pattern for "extract → review → commit" flows
 *
 * This pattern encapsulates the common flow:
 * 1. LLM extracts structured data from text via generateObject()
 * 2. User reviews extracted items with selection checkboxes
 * 3. User commits selected items to target data
 *
 * Key features:
 * - Trigger Cell pattern prevents reactive storms (extraction only on explicit trigger)
 * - hiddenItemIds pattern for "soft delete" without array mutation bugs
 * - ui.* return pattern for composability (like chatbot.tsx)
 * - Works with any schema (generic over item type)
 * - Configurable getKey/getLabel for flexible item identification
 * - selectedItems computed for reactive selection state
 *
 * Architecture (following chatbot.tsx pattern):
 * - State values are reactive primitives (not Cells)
 * - Handlers are flattened at top level (not nested in handlers object)
 * - Internal Cells (trigger, hiddenItemIds) NOT exposed in output
 *   (parent already has them as inputs)
 *
 * Data flow:
 *   Parent sets trigger → generateObject extracts → User reviews → Parent commits selected
 *
 * Usage:
 *   const trigger = cell<string>("");
 *   const extraction = ImportReview({
 *     trigger,                        // Cell<string> - set to trigger extraction
 *     schema,                         // JSON schema for extraction
 *     systemPrompt,                   // LLM system prompt
 *     getKey: (item) => item.id,      // Optional: derive unique key from item
 *     getLabel: (item) => item.title, // Optional: derive display label from item
 *   });
 *
 *   // In UI - use reactive selectedItems:
 *   {extraction.ui.reviewPanel}
 *   <span>Selected: {extraction.selectedCount}</span>
 *
 *   // Handlers are flattened (not extraction.handlers.*):
 *   <ct-button onClick={extraction.selectAll}>Select All</ct-button>
 *
 *   // In commit handler - use getSelectedItems() or selectedItems:
 *   const selected = extraction.getSelectedItems();
 *   // Or for reactive usage: extraction.selectedItems
 */

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

// Generic item - any schema-validated object
interface ExtractedItem {
  [key: string]: unknown;
}

interface ImportReviewInput<T extends ExtractedItem = ExtractedItem> {
  // Required: Trigger Cell for controlled extraction
  // Pattern: trigger.set(`${text}\n---EXTRACT-${Date.now()}---`)
  trigger?: Cell<Default<string, "">>;

  // NOTE: schema/systemPrompt/model are NOT in the interface!
  // Having optional non-Cell inputs breaks generateObject reactivity.
  // See: community-docs/superstitions/2025-12-17-optional-non-cell-inputs-break-generateobject.md
  // These are configured as constants below instead.

  // Optional: Key/label derivation functions
  // These are wrapped with lift() internally for reactivity
  // Default: uses item.name field if present
  getKey?: (item: T, index: number) => string;
  getLabel?: (item: T, index: number) => string;

  // Optional: Comparison with existing items
  existingItems?: Cell<Default<T[], []>>;

  // Internal state (persisted)
  hiddenItemIds?: Cell<Default<string[], []>>; // Track "dismissed" items
}

interface ProcessedItem<T extends ExtractedItem = ExtractedItem> {
  item: T;
  key: string;
  label: string;
  isNew: boolean; // Not in existingItems
  selected: boolean; // Current selection state
}

interface ImportReviewOutput<T extends ExtractedItem = ExtractedItem> {
  // State (reactive primitives)
  pending: boolean;
  error: unknown;
  hasResults: boolean;
  itemCount: number;
  selectedCount: number;

  // Reactive selection array - use in JSX/computed for live updates
  selectedItems: T[];

  // Selection helper function (backward compatibility - use in handlers)
  getSelectedItems: () => T[];

  // Handlers (flattened - following chatbot.tsx pattern)
  // NOTE: trigger/hiddenItemIds are NOT exposed here - parent already has them as inputs
  selectAll: () => void;
  selectNone: () => void;
  dismissAll: () => void;
  clearTrigger: () => void;

  // Pre-composed UI components
  ui: {
    complete: JSX.Element; // Full drop-in component
    loadingState: JSX.Element;
    errorState: JSX.Element;
    emptyState: JSX.Element;
    itemList: JSX.Element;
    selectionBar: JSX.Element;
    reviewPanel: JSX.Element;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_SYSTEM_PROMPT = `You are a data extraction assistant. Extract structured data from the provided text.
Return all items found in the text according to the schema provided.
If no items are found, return an empty items array.`;

const DEFAULT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item name" },
          description: { type: "string", description: "Item description" },
        },
        required: ["name"],
      },
    },
  },
  required: ["items"],
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate string value - handles generateObject returning string "null"
 * See: community-docs/superstitions/2025-11-29-llm-generateObject-returns-string-null.md
 */
function isValidString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0) return false;
  const lower = value.toLowerCase().trim();
  if (lower === "null" || lower === "undefined") return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS (with defensive guards)
// ═══════════════════════════════════════════════════════════════════════════

// Toggle selection for a single item
const toggleSelection = handler<
  unknown,
  { selectedIds: Cell<string[]>; itemKey: string }
>((_, { selectedIds, itemKey }) => {
  // Defensive guards
  if (!itemKey || typeof itemKey !== "string") return;
  if (!selectedIds) return;

  const current = selectedIds.get() ?? [];
  if (current.includes(itemKey)) {
    // Deselect - remove from selectedIds (filter is OK for removal)
    selectedIds.set(current.filter((id) => id !== itemKey));
  } else {
    // Select - use .push() for append to avoid StorageTransactionInconsistent
    selectedIds.push(itemKey);
  }
});

// Select all visible items
const selectAllItems = handler<
  unknown,
  { selectedIds: Cell<string[]>; allVisibleKeys: string[] }
>((_, { selectedIds, allVisibleKeys }) => {
  // Defensive guards
  if (!selectedIds) return;
  if (!Array.isArray(allVisibleKeys)) return;

  // Full replacement is OK (not append)
  selectedIds.set([...allVisibleKeys]);
});

// Deselect all items
const selectNoneItems = handler<
  unknown,
  { selectedIds: Cell<string[]> }
>((_, { selectedIds }) => {
  // Defensive guard
  if (!selectedIds) return;

  selectedIds.set([]);
});

// Dismiss an item (hide without deleting)
const dismissItem = handler<
  unknown,
  { hiddenItemIds: Cell<string[]>; itemKey: string }
>((_, { hiddenItemIds, itemKey }) => {
  // Defensive guards
  if (!itemKey || typeof itemKey !== "string") return;
  if (!hiddenItemIds) return;

  const hidden = hiddenItemIds.get() ?? [];
  if (hidden.includes(itemKey)) return; // Idempotent - already hidden

  // Use .push() instead of spread to avoid StorageTransactionInconsistent errors
  hiddenItemIds.push(itemKey);
});

// Dismiss all visible items
const dismissAllItems = handler<
  unknown,
  { hiddenItemIds: Cell<string[]>; allVisibleKeys: string[] }
>((_, { hiddenItemIds, allVisibleKeys }) => {
  // Defensive guards
  if (!hiddenItemIds) return;
  if (!Array.isArray(allVisibleKeys)) return;

  const hidden = hiddenItemIds.get() ?? [];
  allVisibleKeys.forEach((key) => {
    if (!hidden.includes(key)) {
      hiddenItemIds.push(key);
    }
  });
});

// Clear trigger (reset extraction)
const clearTrigger = handler<
  unknown,
  { trigger: Cell<string> }
>((_, { trigger }) => {
  // Defensive guard
  if (!trigger) return;

  trigger.set("");
});

// Dismiss error by clearing trigger
const dismissError = handler<
  unknown,
  { trigger: Cell<string> }
>((_, { trigger }) => {
  // Defensive guard
  if (!trigger) return;

  trigger.set("");
});

// Demo: Extract button handler
// Formats input text with timestamp suffix to trigger LLM extraction
// Pattern: trigger.set(`${text}\n---EXTRACT-${Date.now()}---`)
const demoExtract = handler<
  unknown,
  { trigger: Cell<string>; inputText: Cell<string> }
>((_, { trigger, inputText }) => {
  // Defensive guards
  if (!trigger || !inputText) return;

  const text = inputText.get() ?? "";
  if (!text.trim()) return; // Don't trigger on empty text

  // Format with timestamp to bust cache and force new LLM call
  trigger.set(`${text}\n---EXTRACT-${Date.now()}---`);
});

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN
// ═══════════════════════════════════════════════════════════════════════════

const ImportReview = pattern<ImportReviewInput, ImportReviewOutput>(
  ({
    trigger: triggerInput,
    // NOTE: schema/systemPrompt/model removed from destructuring
    // Having optional non-Cell inputs breaks generateObject reactivity
    getKey,
    getLabel,
    existingItems,
    hiddenItemIds,
  }) => {
    // Use constants directly - NOT from props (that breaks generateObject)
    // See: community-docs/superstitions/2025-12-17-optional-non-cell-inputs-break-generateobject.md

    // Use triggerInput directly - framework provides default from schema (Default<string, "">)
    // Don't create a fallback cell - that breaks reactivity tracking
    const trigger = triggerInput;

    // Internal cell for tracking selected items (separate from hidden)
    const selectedIds = cell<string[]>([]);

    // Demo: Raw input text (before formatting as trigger)
    const demoInputText = cell<string>("");

    // Lift function props for use inside computed()
    // These create reactive functions that work correctly with the CTS transformer
    // IMPORTANT: lift() requires all arguments as a single object parameter
    const liftedGetKey = lift(({ item, index, fn }: {
      item: ExtractedItem;
      index: number;
      fn: ((item: ExtractedItem, index: number) => string) | undefined;
    }): string => {
      if (fn) return fn(item, index);
      // Default: use item.name if valid string, otherwise fallback to index
      const itemName = item?.name as unknown;
      return (typeof itemName === "string" && (itemName as string).length > 0)
        ? (itemName as string)
        : `item-${index}`;
    });

    const liftedGetLabel = lift(({ item, index, fn }: {
      item: ExtractedItem;
      index: number;
      fn: ((item: ExtractedItem, index: number) => string) | undefined;
    }): string => {
      if (fn) return fn(item, index);
      // Default: use item.name if valid string, otherwise use key
      const itemName = item?.name as unknown;
      return (typeof itemName === "string" && (itemName as string).length > 0)
        ? (itemName as string)
        : `item-${index}`;
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 1. LLM EXTRACTION (only runs when trigger changes)
    // ═══════════════════════════════════════════════════════════════════════

    // Call generateObject at TOP LEVEL (not inside computed/derive)
    // Pass trigger directly - framework should handle reactivity
    // NOTE: When trigger is empty, generateObject returns early without LLM call
    // (see llm.ts:715 - empty prompt check)
    // IMPORTANT: Use constants directly, NOT from props (optional non-Cell inputs break reactivity)
    const {
      result: extractionResult,
      pending: extractionPending,
      error: extractionError,
    } = generateObject({
      system: DEFAULT_SYSTEM_PROMPT,  // Use constant directly
      prompt: trigger,                 // Pass trigger Cell directly
      schema: DEFAULT_SCHEMA,          // Use constant directly
      model: "anthropic:claude-sonnet-4-5",  // Use constant directly
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 2. PROCESS RESULTS
    // ═══════════════════════════════════════════════════════════════════════

    // Process extraction result into visible items with selection state
    // Combined into single computed to avoid opaque value issues with chained computeds
    // Uses lifted getKey/getLabel functions for flexible item identification
    const visibleItems = computed(() => {
      const result = extractionResult;
      const hidden = hiddenItemIds.get() ?? [];
      const selected = selectedIds.get() ?? [];
      const existing = existingItems?.get() ?? [];

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return [] as ProcessedItem[];

      // Extract items array from result with robust validation
      let rawItems: unknown[];
      if (Array.isArray(result)) {
        rawItems = result;
      } else if ("items" in result && Array.isArray((result as { items: unknown[] }).items)) {
        rawItems = (result as { items: unknown[] }).items;
      } else {
        // Single item result - wrap in array
        rawItems = [result];
      }

      // Filter valid items
      const validItems = rawItems.filter(
        (item): item is ExtractedItem =>
          item !== null && typeof item === "object"
      );

      // Build existingKeys array using lifted getKey for comparison
      const existingKeys = existing.map((e: ExtractedItem, i: number) =>
        liftedGetKey({ item: e, index: i, fn: getKey })
      );

      // Transform to ProcessedItem using .map() and filter hidden
      // NOTE: .map() inside computed() works with CTS transformer
      // The for-loop was only needed because we can't .map() over computed result in JSX
      const processed: ProcessedItem[] = [];
      for (let index = 0; index < validItems.length; index++) {
        const item = validItems[index];

        // Use lifted functions for key/label derivation
        const key = liftedGetKey({ item, index, fn: getKey });
        const label = liftedGetLabel({ item, index, fn: getLabel });

        // Skip hidden items
        if (hidden.includes(key)) continue;

        const isNew = !existingKeys.includes(key);

        processed.push({
          item,
          key,
          label,
          isNew,
          selected: selected.includes(key),
        });
      }

      return processed;
    });

    // Count and state computed values
    const itemCount = computed(() => visibleItems.length);
    const selectedCount = computed(() =>
      visibleItems.filter((item) => item.selected).length
    );
    const hasResults = computed(() => visibleItems.length > 0);
    const hasTriggered = computed(() => (trigger.get()?.trim() ?? "").length > 0);
    const allVisibleKeys = computed(() => visibleItems.map((item) => item.key));

    // Show empty state when triggered, not pending, no results, no error
    const showEmptyState = computed(() => {
      const triggered = (trigger.get()?.trim() ?? "").length > 0;
      const pending = extractionPending;
      const hasItems = visibleItems.length > 0;
      const hasError = !!extractionError;
      return triggered && !pending && !hasItems && !hasError;
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 3. SELECTION HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    // Reactive computed of selected items - can be used in JSX/computed
    const selectedItems = computed(() => {
      const selected = selectedIds.get() ?? [];
      return visibleItems
        .filter((item) => selected.includes(item.key))
        .map((item) => item.item);
    });

    // Called from parent's commit handler (backward compatibility)
    const getSelectedItems = () => {
      const selected = selectedIds.get() ?? [];
      return visibleItems
        .filter((item) => selected.includes(item.key))
        .map((item) => item.item);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 4. UI COMPONENTS
    // ═══════════════════════════════════════════════════════════════════════

    const loadingState = (
      <div
        style={{
          padding: "32px",
          textAlign: "center",
          background: "#f0f9ff",
          borderRadius: "8px",
        }}
      >
        <div style={{ fontSize: "24px", marginBottom: "8px" }}>⏳</div>
        <p style={{ margin: 0, color: "#0369a1" }}>Extracting data...</p>
      </div>
    );

    const errorState = (
      <div
        style={{
          padding: "16px",
          background: "#fef2f2",
          borderRadius: "8px",
          border: "1px solid #ef4444",
        }}
      >
        <p
          style={{
            margin: "0 0 8px 0",
            color: "#dc2626",
            fontWeight: 500,
          }}
        >
          ❌ Extraction Failed
        </p>
        <p
          style={{
            margin: "0 0 12px 0",
            color: "#7f1d1d",
            fontSize: "14px",
          }}
        >
          {derive(extractionError, (err) => String(err ?? "Unknown error"))}
        </p>
        <ct-button
          variant="secondary"
          size="sm"
          onClick={dismissError({ trigger })}
        >
          Dismiss
        </ct-button>
      </div>
    );

    const emptyState = (
      <div
        style={{
          padding: "24px",
          textAlign: "center",
          background: "#fef3c7",
          borderRadius: "8px",
          border: "1px solid #f59e0b",
        }}
      >
        <p style={{ margin: 0, color: "#92400e" }}>
          No items found in the provided text.
        </p>
      </div>
    );

    const selectionBar = (
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <ct-button
          variant="secondary"
          size="sm"
          onClick={selectAllItems({ selectedIds, allVisibleKeys })}
        >
          Select All
        </ct-button>
        <ct-button
          variant="secondary"
          size="sm"
          onClick={selectNoneItems({ selectedIds })}
        >
          Select None
        </ct-button>
        <span style={{ marginLeft: "auto", color: "#666", fontSize: "14px" }}>
          {selectedCount} of {itemCount} selected
        </span>
      </div>
    );

    const itemList = (
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {visibleItems.map((processedItem) => (
          <div
            key={processedItem.key}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px",
              borderBottom: "1px solid #eee",
              backgroundColor: processedItem.isNew ? "#f0fdf4" : "transparent",
            }}
          >
            <ct-checkbox
              checked={processedItem.selected}
              onClick={toggleSelection({
                selectedIds,
                itemKey: processedItem.key,
              })}
              style={{ marginRight: "12px" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>
                {processedItem.label}
                {processedItem.isNew && (
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "11px",
                      padding: "2px 6px",
                      background: "#dcfce7",
                      color: "#166534",
                      borderRadius: "4px",
                    }}
                  >
                    NEW
                  </span>
                )}
              </div>
            </div>
            <ct-button
              variant="secondary"
              size="sm"
              onClick={dismissItem({ hiddenItemIds, itemKey: processedItem.key })}
            >
              ✕
            </ct-button>
          </div>
        ))}
      </div>
    );

    // Pre-bind dismissAll handler OUTSIDE JSX to avoid ReadOnlyAddressError
    const boundDismissAll = dismissAllItems({ hiddenItemIds, allVisibleKeys });

    const reviewPanel = (
      <div
        style={{
          padding: "16px",
          background: "#f9fafb",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px" }}>Review Extracted Items</h3>
          {/* Button ALWAYS rendered - visibility controlled via style, not ifElse */}
          {/* This avoids ReadOnlyAddressError from handlers inside conditional rendering */}
          <ct-button
            variant="secondary"
            size="sm"
            onClick={boundDismissAll}
            style={derive(hasResults, (has) => ({
              display: has ? "inline-block" : "none",
            }))}
          >
            Dismiss All
          </ct-button>
        </div>

        {ifElse(extractionPending, loadingState, null)}

        {ifElse(
          derive(extractionError, (err) => !!err && !extractionPending),
          errorState,
          null
        )}

        {ifElse(showEmptyState, emptyState, null)}

        {ifElse(
          derive(hasResults, (has) => has && !extractionPending),
          <div>
            {selectionBar}
            {itemList}
          </div>,
          null
        )}
      </div>
    );

    const complete = (
      <div>
        {ifElse(hasTriggered, reviewPanel, null)}
      </div>
    );

    // ═══════════════════════════════════════════════════════════════════════
    // 5. RETURN
    // ═══════════════════════════════════════════════════════════════════════

    return {
      [NAME]: "Import Review",
      [UI]: (
        <ct-screen style={{ backgroundColor: "white", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>
            <h1 style={{ margin: "0 0 8px 0" }}>Import Review Pattern</h1>
            <p style={{ color: "#666", margin: "0 0 16px 0" }}>
              Extract structured data from text, review, and commit.
            </p>

            {/* Demo: Manual trigger input */}
            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "14px", color: "#666", marginBottom: "8px" }}>
                Enter text and click Extract to test extraction:
              </p>
              <ct-textarea
                $value={demoInputText}
                placeholder="Paste text here (e.g., 'Shopping list: apples, bananas, milk')"
                rows={4}
                style={{ width: "100%", marginBottom: "8px" }}
              />
              <ct-button
                variant="primary"
                onClick={demoExtract({ trigger, inputText: demoInputText })}
              >
                Extract Items
              </ct-button>
            </div>

            {reviewPanel}

            {/* Debug: Show state */}
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
                <div>Pending: {derive(extractionPending, (p) => String(p))}</div>
                <div>Has Results: {derive(hasResults, (h) => String(h))}</div>
                <div>Item Count: {itemCount}</div>
                <div>Selected: {selectedCount}</div>
                <div>Error: {derive(extractionError, (e) => e ? "Yes" : "No")}</div>
                <div>Triggered: {derive(hasTriggered, (t) => String(t))}</div>
                <div>Trigger Length: {derive(trigger, (t: string) => String(t?.length ?? 0))}</div>
                <div>Trigger Val: {derive(trigger, (t: string) => t ? t.substring(0, 30) + "..." : "(empty)")}</div>
              </div>
            </div>
          </div>
        </ct-screen>
      ),

      // State outputs (reactive primitives)
      pending: extractionPending,
      error: extractionError,
      hasResults,
      itemCount,
      selectedCount,

      // Reactive selection array - use in JSX/computed
      selectedItems,

      // Selection helper function (backward compat - use in handlers)
      getSelectedItems,

      // Flattened handlers (following chatbot.tsx pattern)
      // NOTE: trigger/hiddenItemIds NOT exposed - parent already has them as inputs
      selectAll: selectAllItems({ selectedIds, allVisibleKeys }),
      selectNone: selectNoneItems({ selectedIds }),
      dismissAll: boundDismissAll,
      clearTrigger: clearTrigger({ trigger }),

      // UI components for composition
      ui: {
        complete,
        loadingState,
        errorState,
        emptyState,
        itemList,
        selectionBar,
        reviewPanel,
      },
    };
  }
);

export default ImportReview;
