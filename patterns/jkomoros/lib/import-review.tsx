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

// Field mapping for per-field diff mode (person.tsx use case)
interface FieldMapping {
  key: string;                              // Field key in extraction result
  label: string;                            // Display label
  currentValue?: Cell<string> | string;     // Current value for diff comparison

  // Array append mode (food-recipe.tsx use case)
  // When true, shows count preview instead of diff, and apply uses .push()
  isArray?: boolean;
  arrayCountLabel?: string;                 // e.g., "ingredient(s)", "tag(s)"
}

interface ImportReviewInput<T extends ExtractedItem = ExtractedItem> {
  // Required: Trigger Cell for controlled extraction
  // Pattern: trigger.set(`${text}\n---EXTRACT-${Date.now()}---`)
  trigger?: Cell<Default<string, "">>;

  // Optional: Schema Cell for field extraction mode
  // When provided, generateObject uses this schema directly.
  // Parent builds schema based on their field definitions.
  // This solves the OpaqueRef issue - Cells don't get wrapped in OpaqueRef.
  // See: community-docs/superstitions/2025-12-17-array-isarray-fails-for-subpattern-props.md
  schema?: Cell<object>;

  // Optional: System prompt Cell for customization
  // Only used when schema is provided (otherwise uses DEFAULT_SYSTEM_PROMPT)
  systemPrompt?: Cell<string>;

  // Optional: Key/label derivation functions
  // These are wrapped with lift() internally for reactivity
  // Default: uses item.name field if present
  getKey?: (item: T, index: number) => string;
  getLabel?: (item: T, index: number) => string;

  // Optional: Comparison with existing items
  existingItems?: Cell<Default<T[], []>>;

  // Internal state (persisted)
  hiddenItemIds?: Cell<Default<string[], []>>; // Track "dismissed" items

  // Per-field diff mode (person.tsx use case)
  // When provided, enables field-diff UI (fieldDiffPanel).
  // Used ONLY for UI rendering inside computed(), not for schema building.
  // NOTE: Due to OpaqueRef wrapping, you cannot iterate this array outside computed().
  fieldMappings?: FieldMapping[];

  // ID-matching merge mode (food-recipe.tsx timing/wait-time use case)
  // When provided, enables merge-diff UI (mergeDiffPanel).
  // Used for updating existing items by ID (e.g., update timing fields on step groups)
  mergeFieldMappings?: MergeFieldMapping[];
}

interface ProcessedItem<T extends ExtractedItem = ExtractedItem> {
  item: T;
  key: string;
  label: string;
  isNew: boolean; // Not in existingItems
  selected: boolean; // Current selection state
}

// Per-field diff for field-diff mode
interface ProcessedFieldDiff {
  key: string;                    // Field key
  label: string;                  // Display label
  currentValue: string;           // Current value (resolved from Cell or string)
  extractedValue: string;         // Value from LLM extraction (or count message for arrays)
  hasChanged: boolean;            // currentValue !== extractedValue
  selected: boolean;              // Current selection state
  _rawValue?: unknown[];          // For array fields: the raw array for getSelectedFieldValues()
}

// ═══════════════════════════════════════════════════════════════════════════
// MERGE MODE INTERFACES (for timing/wait-time suggestions)
// ═══════════════════════════════════════════════════════════════════════════

// Field config for merge mode
interface MergeField {
  key: string;                              // Field to update (e.g., "nightsBeforeServing")
  label: string;                            // Display label
  format?: (value: unknown) => string;      // Optional formatter for display
}

// Merge mapping for ID-matching merge mode (food-recipe.tsx timing/wait-time use case)
interface MergeFieldMapping {
  key: string;                              // Field in extraction result (e.g., "stepGroups")
  label: string;                            // Section label
  idField: string;                          // Field to match by (e.g., "id")
  existingItems: Cell<unknown[]>;           // Current items to match against
  getItemLabel?: (item: unknown) => string; // Get display label from existing item
  mergeFields: MergeField[];                // Fields to show/merge
}

// Processed merge diff for a single existing item
interface ProcessedMergeItem {
  id: string;                               // ID value for matching
  label: string;                            // Display label from existing item
  fieldDiffs: ProcessedMergeFieldDiff[];    // Field-by-field diffs for this item
}

// Per-field diff within a merge item
interface ProcessedMergeFieldDiff {
  itemId: string;                           // Parent item ID
  fieldKey: string;                         // Field key
  fieldLabel: string;                       // Display label
  currentValue: string;                     // Current value (formatted)
  extractedValue: string;                   // Suggested value (formatted)
  hasChanged: boolean;                      // Current != extracted
  selected: boolean;                        // Selection state
  selectionKey: string;                     // Pre-computed: `${itemId}:${fieldKey}`
}

interface ImportReviewOutput<T extends ExtractedItem = ExtractedItem> {
  // State (reactive primitives)
  pending: boolean;
  error: unknown;
  hasResults: boolean;
  hasFieldResults: boolean;  // For field-diff mode
  itemCount: number;
  selectedCount: number;

  // Reactive selection array - use in JSX/computed for live updates
  selectedItems: T[];

  // Selection helper function (backward compatibility - use in handlers)
  getSelectedItems: () => T[];

  // Per-field diff mode outputs
  fieldDiffCount: number;                           // Number of changed fields
  selectedFieldCount: number;                       // Number of selected fields
  selectedFieldKeys: string[];                      // Keys of selected fields (reactive)
  getSelectedFieldValues: () => Record<string, unknown>;  // Returns selected field values
  selectedFieldValues: Record<string, unknown>;     // Reactive Cell version - pass to handler params

  // Handlers (flattened - following chatbot.tsx pattern)
  // NOTE: trigger/hiddenItemIds are NOT exposed here - parent already has them as inputs
  selectAll: () => void;
  selectNone: () => void;
  dismissAll: () => void;
  clearTrigger: () => void;

  // Per-field diff mode handlers
  selectAllFields: () => void;
  selectNoFields: () => void;
  toggleFieldSelection: (key: string) => void;

  // Merge mode outputs (ID-matching merge for timing/wait-time)
  hasMergeResults: boolean;                              // Has merge items to show
  mergeItemCount: number;                                // Number of items with changes
  selectedMergeFieldCount: number;                       // Number of selected merge fields
  selectedMergeValues: Record<string, unknown>[];        // Reactive: selected values per item
  getSelectedMergeValues: () => Record<string, unknown>[]; // Returns selected merge values

  // Merge mode handlers
  selectAllMergeFields: () => void;
  selectNoMergeFields: () => void;
  toggleMergeFieldSelection: (itemId: string, fieldKey: string) => void;

  // Pre-composed UI components
  ui: {
    complete: JSX.Element; // Full drop-in component
    loadingState: JSX.Element;
    errorState: JSX.Element;
    emptyState: JSX.Element;
    itemList: JSX.Element;
    selectionBar: JSX.Element;
    reviewPanel: JSX.Element;
    fieldDiffPanel: JSX.Element;  // Per-field diff UI
    mergeDiffPanel: JSX.Element;  // ID-matching merge diff UI
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
// PER-FIELD DIFF MODE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// Toggle selection for a single field
const toggleFieldSelectionHandler = handler<
  unknown,
  { selectedFieldKeys: Cell<string[]>; fieldKey: string }
>((_, { selectedFieldKeys, fieldKey }) => {
  // Defensive guards
  if (!fieldKey || typeof fieldKey !== "string") return;
  if (!selectedFieldKeys) return;

  const current = selectedFieldKeys.get() ?? [];
  if (current.includes(fieldKey)) {
    // Deselect - remove from selectedFieldKeys
    selectedFieldKeys.set(current.filter((k) => k !== fieldKey));
  } else {
    // Select - use .push() to avoid StorageTransactionInconsistent
    selectedFieldKeys.push(fieldKey);
  }
});

// Select all changed fields
const selectAllFieldsHandler = handler<
  unknown,
  { selectedFieldKeys: Cell<string[]>; allChangedFieldKeys: string[] }
>((_, { selectedFieldKeys, allChangedFieldKeys }) => {
  // Defensive guards
  if (!selectedFieldKeys) return;
  if (!Array.isArray(allChangedFieldKeys)) return;

  selectedFieldKeys.set([...allChangedFieldKeys]);
});

// Deselect all fields
const selectNoFieldsHandler = handler<
  unknown,
  { selectedFieldKeys: Cell<string[]> }
>((_, { selectedFieldKeys }) => {
  // Defensive guard
  if (!selectedFieldKeys) return;

  selectedFieldKeys.set([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// MERGE MODE HANDLERS (for timing/wait-time suggestions)
// ═══════════════════════════════════════════════════════════════════════════

// Toggle selection for a single merge field
// Key format: "itemId:fieldKey"
const toggleMergeFieldSelectionHandler = handler<
  unknown,
  { selectedMergeKeys: Cell<string[]>; selectionKey: string }
>((_, { selectedMergeKeys, selectionKey }) => {
  // Defensive guards
  if (!selectionKey || typeof selectionKey !== "string") return;
  if (!selectedMergeKeys) return;

  const current = selectedMergeKeys.get() ?? [];
  if (current.includes(selectionKey)) {
    // Deselect - remove from selectedMergeKeys
    selectedMergeKeys.set(current.filter((k) => k !== selectionKey));
  } else {
    // Select - use .push() to avoid StorageTransactionInconsistent
    selectedMergeKeys.push(selectionKey);
  }
});

// Select all merge fields
const selectAllMergeFieldsHandler = handler<
  unknown,
  { selectedMergeKeys: Cell<string[]>; allMergeFieldKeys: string[] }
>((_, { selectedMergeKeys, allMergeFieldKeys }) => {
  // Defensive guards
  if (!selectedMergeKeys) return;
  if (!Array.isArray(allMergeFieldKeys)) return;

  selectedMergeKeys.set([...allMergeFieldKeys]);
});

// Deselect all merge fields
const selectNoMergeFieldsHandler = handler<
  unknown,
  { selectedMergeKeys: Cell<string[]> }
>((_, { selectedMergeKeys }) => {
  // Defensive guard
  if (!selectedMergeKeys) return;

  selectedMergeKeys.set([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN
// ═══════════════════════════════════════════════════════════════════════════

const ImportReview = pattern<ImportReviewInput, ImportReviewOutput>(
  ({
    trigger: triggerInput,
    schema: schemaInput,
    systemPrompt: systemPromptInput,
    getKey,
    getLabel,
    existingItems,
    hiddenItemIds,
    fieldMappings,
    mergeFieldMappings,
  }) => {
    // Use constants directly - NOT from props (that breaks generateObject)
    // See: community-docs/superstitions/2025-12-17-optional-non-cell-inputs-break-generateobject.md

    // Use triggerInput directly - framework provides default from schema (Default<string, "">)
    // Don't create a fallback cell - that breaks reactivity tracking
    const trigger = triggerInput;

    // Internal cell for tracking selected items (separate from hidden)
    const selectedIds = cell<string[]>([]);

    // Internal cell for tracking selected fields (per-field diff mode)
    const selectedFieldKeys = cell<string[]>([]);

    // Internal cell for tracking selected merge fields (merge mode)
    // Format: ["itemId:fieldKey", "itemId:fieldKey", ...]
    const selectedMergeKeys = cell<string[]>([]);

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

    // Schema selection:
    // - If schema Cell provided: parent built the schema (field-diff mode)
    // - Otherwise: use DEFAULT_SCHEMA constant (item-list mode)
    //
    // Why schema is a Cell prop:
    // OpaqueRef wrapping prevents building schemas from array props at init time.
    // Items iterated from `for...of` are ALSO OpaqueRef, so `mapping.key` throws.
    // Solution: Parent builds schema as a Cell, Cells don't get OpaqueRef wrapped.
    // See: community-docs/superstitions/2025-12-17-array-isarray-fails-for-subpattern-props.md
    const effectiveSchema = schemaInput ?? Cell.of(DEFAULT_SCHEMA);
    const effectiveSystemPrompt = systemPromptInput ?? Cell.of(DEFAULT_SYSTEM_PROMPT);

    // Check if fieldMappings was provided (for UI purposes only)
    // NOTE: Cannot iterate fieldMappings here - OpaqueRef wrapping.
    // It's only used inside computed() for field-diff UI rendering.
    const hasFieldMappings = !!fieldMappings;

    // Call generateObject at TOP LEVEL (not inside computed/derive)
    // Pass trigger directly - framework should handle reactivity
    // NOTE: When trigger is empty, generateObject returns early without LLM call
    // (see llm.ts:715 - empty prompt check)
    const {
      result: extractionResult,
      pending: extractionPending,
      error: extractionError,
    } = generateObject({
      system: effectiveSystemPrompt,     // Cell<string> - mode-specific prompt
      prompt: trigger,                    // Cell<string> - triggers extraction
      schema: effectiveSchema,            // Cell<object> - mode-specific schema
      model: "anthropic:claude-sonnet-4-5",
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
    // 2.5. PER-FIELD DIFF MODE (when fieldMappings provided)
    // ═══════════════════════════════════════════════════════════════════════

    // Compute field-by-field diffs when fieldMappings is provided
    // This enables person.tsx use case: extract flat fields and compare to current values
    // Also supports array append mode (food-recipe.tsx): show count for array fields
    const fieldDiffs = computed((): ProcessedFieldDiff[] => {
      // Only compute if fieldMappings is provided
      // NOTE: CTS transformer wraps arrays in OpaqueRef, so Array.isArray() returns false
      // Use .length check instead (OpaqueRef proxies array-like behavior)
      const fmArray = fieldMappings as unknown as FieldMapping[] | undefined;
      if (!fmArray || fmArray.length === 0) return [];

      const result = extractionResult;
      const selected = selectedFieldKeys.get() ?? [];

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return [];

      // Extract result as a flat object (for field access)
      const extractedData = result as Record<string, unknown>;

      const processed: ProcessedFieldDiff[] = [];
      for (const mapping of fmArray) {
        // Extract mapping properties without renaming (CTS transformer quirks)
        const fieldKey = mapping.key;
        const fieldLabel = mapping.label;
        const fieldCurrentInput = mapping.currentValue;
        const isArrayField = mapping.isArray ?? false;
        const arrayCountLabel = mapping.arrayCountLabel ?? "item(s)";

        // Get extracted value from result
        const extractedRaw = extractedData[fieldKey];

        // Handle array fields differently (food-recipe.tsx use case)
        if (isArrayField) {
          // For array fields, check if the extracted value is an array with items
          const extractedArray = Array.isArray(extractedRaw) ? extractedRaw : [];
          const arrayCount = extractedArray.length;

          // Only show if there are items to add
          if (arrayCount === 0) continue;

          processed.push({
            key: fieldKey,
            label: fieldLabel,
            currentValue: "",  // No current value comparison for append mode
            extractedValue: `${arrayCount} ${arrayCountLabel} will be added`,
            hasChanged: true,  // Always "changed" if there are items
            selected: selected.includes(fieldKey),
            // Store the raw array for getSelectedFieldValues()
            _rawValue: extractedArray,
          } as ProcessedFieldDiff);
          continue;
        }

        // Scalar field handling (original behavior)
        // Resolve currentValue - could be Cell or string
        let resolvedCurrentValue: string;
        if (fieldCurrentInput && typeof fieldCurrentInput === "object" && "get" in fieldCurrentInput) {
          // It's a Cell - get the value
          resolvedCurrentValue = (fieldCurrentInput as Cell<string>).get() ?? "";
        } else {
          resolvedCurrentValue = (fieldCurrentInput as string) ?? "";
        }

        const extractedValue = extractedRaw != null ? String(extractedRaw) : "";

        // Compare - only show if there's a change
        const hasChanged = resolvedCurrentValue !== extractedValue;
        if (!hasChanged) continue;

        processed.push({
          key: fieldKey,
          label: fieldLabel,
          currentValue: resolvedCurrentValue,
          extractedValue,
          hasChanged,
          selected: selected.includes(fieldKey),
        });
      }

      return processed;
    });

    // Field diff mode counts
    const fieldDiffCount = computed(() => fieldDiffs.length);
    const selectedFieldCount = computed(() =>
      fieldDiffs.filter((f) => f.selected).length
    );
    const hasFieldResults = computed(() => fieldDiffs.length > 0);
    const allChangedFieldKeys = computed(() => fieldDiffs.map((f) => f.key));

    // Show field empty state when triggered, not pending, no field results, no error
    const showFieldEmptyState = computed(() => {
      const triggered = (trigger.get()?.trim() ?? "").length > 0;
      const pending = extractionPending;
      const hasFields = fieldDiffs.length > 0;
      const hasError = !!extractionError;
      // Only show if fieldMappings is provided
      // NOTE: CTS transformer wraps arrays in OpaqueRef, so Array.isArray() returns false
      // Use .length check instead (OpaqueRef proxies array-like behavior)
      const fmArray = fieldMappings as unknown as FieldMapping[] | undefined;
      const hasFieldMappingsCheck = fmArray && fmArray.length > 0;
      return hasFieldMappingsCheck && triggered && !pending && !hasFields && !hasError;
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 2.6. MERGE MODE (for timing/wait-time suggestions)
    // ═══════════════════════════════════════════════════════════════════════

    // Compute merge diffs when mergeFieldMappings is provided
    // This enables ID-matching merge: find existing items by ID, show field-by-field diffs
    const mergeDiffs = computed((): ProcessedMergeItem[] => {
      // Only compute if mergeFieldMappings is provided
      // NOTE: CTS transformer wraps arrays in OpaqueRef, so use .length check
      const mfmArray = mergeFieldMappings as unknown as MergeFieldMapping[] | undefined;
      if (!mfmArray || mfmArray.length === 0) return [];

      const result = extractionResult;
      const selectedKeys = selectedMergeKeys.get() ?? [];

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return [];

      const extractedData = result as Record<string, unknown>;
      const processed: ProcessedMergeItem[] = [];

      // Process each merge field mapping
      for (const mapping of mfmArray) {
        const arrayKey = mapping.key;
        const idField = mapping.idField;
        const mergeFields = mapping.mergeFields;
        const getItemLabel = mapping.getItemLabel ?? ((item: unknown) => {
          const obj = item as Record<string, unknown>;
          return String(obj?.name ?? obj?.id ?? "Unknown");
        });

        // Get extracted array from result
        const extractedArray = extractedData[arrayKey];
        if (!extractedArray || !Array.isArray(extractedArray)) continue;

        // Get existing items to match against
        const existingItemsValue = mapping.existingItems?.get() ?? [];

        // Process each extracted item
        for (const extractedItem of extractedArray) {
          const extractedObj = extractedItem as Record<string, unknown>;
          const itemId = String(extractedObj[idField] ?? "");
          if (!itemId) continue;

          // Find matching existing item
          const existingItem = existingItemsValue.find((existing: unknown) => {
            const existingObj = existing as Record<string, unknown>;
            return String(existingObj[idField] ?? "") === itemId;
          });

          if (!existingItem) continue; // Skip if no matching existing item

          const existingObj = existingItem as Record<string, unknown>;
          const itemLabel = getItemLabel(existingItem);

          // Build field diffs for this item
          const fieldDiffs: ProcessedMergeFieldDiff[] = [];

          for (const field of mergeFields) {
            const fieldKey = field.key;
            const fieldLabel = field.label;
            const formatter = field.format ?? ((v: unknown) => {
              if (v === undefined || v === null) return "(none)";
              if (typeof v === "object") return JSON.stringify(v);
              return String(v);
            });

            const currentRaw = existingObj[fieldKey];
            const extractedRaw = extractedObj[fieldKey];

            // Skip if extracted value is undefined (not suggested)
            if (extractedRaw === undefined) continue;

            const currentValue = formatter(currentRaw);
            const extractedValue = formatter(extractedRaw);
            const hasChanged = currentValue !== extractedValue;

            // Only show fields that have changed
            if (!hasChanged) continue;

            const selectionKey = `${itemId}:${fieldKey}`;
            fieldDiffs.push({
              itemId,
              fieldKey,
              fieldLabel,
              currentValue,
              extractedValue,
              hasChanged,
              selected: selectedKeys.includes(selectionKey),
              selectionKey,
            });
          }

          // Only add item if it has changed fields
          if (fieldDiffs.length > 0) {
            processed.push({
              id: itemId,
              label: itemLabel,
              fieldDiffs,
            });
          }
        }
      }

      return processed;
    });

    // Merge mode counts
    const mergeItemCount = computed(() => mergeDiffs.length);
    const selectedMergeFieldCount = computed(() => {
      let count = 0;
      for (const item of mergeDiffs) {
        count += item.fieldDiffs.filter((f) => f.selected).length;
      }
      return count;
    });
    const hasMergeResults = computed(() => mergeDiffs.length > 0);
    const allMergeFieldKeys = computed(() => {
      const keys: string[] = [];
      for (const item of mergeDiffs) {
        for (const field of item.fieldDiffs) {
          keys.push(`${item.id}:${field.fieldKey}`);
        }
      }
      return keys;
    });

    // Show merge empty state when triggered, not pending, no merge results, no error
    const showMergeEmptyState = computed(() => {
      const triggered = (trigger.get()?.trim() ?? "").length > 0;
      const pending = extractionPending;
      const hasMerge = mergeDiffs.length > 0;
      const hasError = !!extractionError;
      // Only show if mergeFieldMappings is provided
      const mfmArray = mergeFieldMappings as unknown as MergeFieldMapping[] | undefined;
      const hasMergeFieldMappingsCheck = mfmArray && mfmArray.length > 0;
      return hasMergeFieldMappingsCheck && triggered && !pending && !hasMerge && !hasError;
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

    // Get selected field values (for field-diff mode)
    // Returns an object with only the selected fields' extracted values
    const getSelectedFieldValues = (): Record<string, unknown> => {
      const selected = selectedFieldKeys.get() ?? [];
      const result = extractionResult;

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return {};

      const extractedData = result as Record<string, unknown>;
      const selectedValues: Record<string, unknown> = {};

      for (const key of selected) {
        if (key in extractedData) {
          selectedValues[key] = extractedData[key];
        }
      }

      return selectedValues;
    };

    // Computed Cell version of selected field values
    // This is needed because handlers can't call functions captured via closure
    // due to OpaqueRef wrapping. Cells can be passed as handler params and read with .get()
    const selectedFieldValuesCell = computed(() => {
      const selected = selectedFieldKeys.get() ?? [];
      const result = extractionResult;

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return {};

      const extractedData = result as Record<string, unknown>;
      const selectedValues: Record<string, unknown> = {};

      for (const key of selected) {
        if (key in extractedData) {
          selectedValues[key] = extractedData[key];
        }
      }

      return selectedValues;
    });

    // Reactive computed of selected field keys (for parent's reactive use)
    const selectedFieldKeysComputed = computed(() => {
      return selectedFieldKeys.get() ?? [];
    });

    // Get selected merge values (for merge mode)
    // Returns an array of objects, each containing ID + selected field values
    // Example: [{ id: "prep-123", nightsBeforeServing: undefined, minutesBeforeServing: 120 }, ...]
    const getSelectedMergeValues = (): Record<string, unknown>[] => {
      const selectedKeys = selectedMergeKeys.get() ?? [];
      const result = extractionResult;

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return [];

      // Get merge field mappings
      const mfmArray = mergeFieldMappings as unknown as MergeFieldMapping[] | undefined;
      if (!mfmArray || mfmArray.length === 0) return [];

      const extractedData = result as Record<string, unknown>;
      const mergeValues: Record<string, unknown>[] = [];

      // Process each merge field mapping
      for (const mapping of mfmArray) {
        const arrayKey = mapping.key;
        const idField = mapping.idField;

        // Get extracted array from result
        const extractedArray = extractedData[arrayKey];
        if (!extractedArray || !Array.isArray(extractedArray)) continue;

        // Process each extracted item
        for (const extractedItem of extractedArray) {
          const extractedObj = extractedItem as Record<string, unknown>;
          const itemId = String(extractedObj[idField] ?? "");
          if (!itemId) continue;

          // Build object with ID + selected fields only
          const itemValues: Record<string, unknown> = { [idField]: itemId };
          let hasSelectedFields = false;

          for (const field of mapping.mergeFields) {
            const selectionKey = `${itemId}:${field.key}`;
            if (selectedKeys.includes(selectionKey)) {
              itemValues[field.key] = extractedObj[field.key];
              hasSelectedFields = true;
            }
          }

          // Only include item if it has selected fields
          if (hasSelectedFields) {
            mergeValues.push(itemValues);
          }
        }
      }

      return mergeValues;
    };

    // Computed Cell version of selected merge values
    // This is needed because handlers can't call functions captured via closure
    const selectedMergeValuesCell = computed(() => {
      const selectedKeys = selectedMergeKeys.get() ?? [];
      const result = extractionResult;

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return [];

      // Get merge field mappings
      const mfmArray = mergeFieldMappings as unknown as MergeFieldMapping[] | undefined;
      if (!mfmArray || mfmArray.length === 0) return [];

      const extractedData = result as Record<string, unknown>;
      const mergeValues: Record<string, unknown>[] = [];

      // Process each merge field mapping
      for (const mapping of mfmArray) {
        const arrayKey = mapping.key;
        const idField = mapping.idField;

        // Get extracted array from result
        const extractedArray = extractedData[arrayKey];
        if (!extractedArray || !Array.isArray(extractedArray)) continue;

        // Process each extracted item
        for (const extractedItem of extractedArray) {
          const extractedObj = extractedItem as Record<string, unknown>;
          const itemId = String(extractedObj[idField] ?? "");
          if (!itemId) continue;

          // Build object with ID + selected fields only
          const itemValues: Record<string, unknown> = { [idField]: itemId };
          let hasSelectedFields = false;

          for (const field of mapping.mergeFields) {
            const selectionKey = `${itemId}:${field.key}`;
            if (selectedKeys.includes(selectionKey)) {
              itemValues[field.key] = extractedObj[field.key];
              hasSelectedFields = true;
            }
          }

          // Only include item if it has selected fields
          if (hasSelectedFields) {
            mergeValues.push(itemValues);
          }
        }
      }

      return mergeValues;
    });

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

    // Pre-bind field selection handlers OUTSIDE JSX
    const boundSelectAllFields = selectAllFieldsHandler({ selectedFieldKeys, allChangedFieldKeys });
    const boundSelectNoFields = selectNoFieldsHandler({ selectedFieldKeys });

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

    // ═══════════════════════════════════════════════════════════════════════
    // Per-field diff panel (for person.tsx use case)
    // Shows field-by-field changes with individual selection
    // ═══════════════════════════════════════════════════════════════════════

    const fieldSelectionBar = (
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
          onClick={boundSelectAllFields}
        >
          Select All
        </ct-button>
        <ct-button
          variant="secondary"
          size="sm"
          onClick={boundSelectNoFields}
        >
          Select None
        </ct-button>
        <span style={{ marginLeft: "auto", color: "#666", fontSize: "14px" }}>
          {selectedFieldCount} of {fieldDiffCount} fields selected
        </span>
      </div>
    );

    const fieldDiffList = (
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {fieldDiffs.map((fieldDiff) => (
          <div
            key={fieldDiff.key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              padding: "12px",
              borderBottom: "1px solid #eee",
              backgroundColor: "transparent",
            }}
          >
            <ct-checkbox
              checked={fieldDiff.selected}
              onClick={toggleFieldSelectionHandler({
                selectedFieldKeys,
                fieldKey: fieldDiff.key,
              })}
              style={{ marginRight: "12px", marginTop: "2px" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, marginBottom: "4px" }}>
                {fieldDiff.label}
              </div>
              <div style={{ fontSize: "14px" }}>
                {/* Current value with strikethrough red (only for scalar fields) */}
                {fieldDiff.currentValue && (
                  <span
                    style={{
                      textDecoration: "line-through",
                      color: "#dc2626",
                      marginRight: "8px",
                    }}
                  >
                    {fieldDiff.currentValue}
                  </span>
                )}
                {/* Arrow separator (only for scalar fields with current value) */}
                {fieldDiff.currentValue && (
                  <span style={{ color: "#666", marginRight: "8px" }}>→</span>
                )}
                {/* Extracted value with green highlight */}
                <span
                  style={{
                    backgroundColor: "#dcfce7",
                    color: "#166534",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  {fieldDiff.extractedValue || "(empty)"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );

    const fieldDiffPanel = (
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
          <h3 style={{ margin: 0, fontSize: "16px" }}>Review Field Changes</h3>
        </div>

        {ifElse(extractionPending, loadingState, null)}

        {ifElse(
          derive(extractionError, (err) => !!err && !extractionPending),
          errorState,
          null
        )}

        {ifElse(
          showFieldEmptyState,
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
              No field changes detected.
            </p>
          </div>,
          null
        )}

        {ifElse(
          derive(hasFieldResults, (has) => has && !extractionPending),
          <div>
            {fieldSelectionBar}
            {fieldDiffList}
          </div>,
          null
        )}
      </div>
    );

    // ═══════════════════════════════════════════════════════════════════════
    // Merge diff panel (for timing/wait-time suggestions)
    // Shows per-item, per-field changes with individual selection
    // ═══════════════════════════════════════════════════════════════════════

    // Pre-bind merge selection handlers OUTSIDE JSX
    const boundSelectAllMergeFields = selectAllMergeFieldsHandler({ selectedMergeKeys, allMergeFieldKeys });
    const boundSelectNoMergeFields = selectNoMergeFieldsHandler({ selectedMergeKeys });

    const mergeSelectionBar = (
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
          onClick={boundSelectAllMergeFields}
        >
          Select All
        </ct-button>
        <ct-button
          variant="secondary"
          size="sm"
          onClick={boundSelectNoMergeFields}
        >
          Select None
        </ct-button>
        <span style={{ marginLeft: "auto", color: "#666", fontSize: "14px" }}>
          {selectedMergeFieldCount} field(s) selected
        </span>
      </div>
    );

    const mergeDiffList = (
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {mergeDiffs.map((mergeItem) => (
          <div
            key={mergeItem.id}
            style={{
              padding: "12px",
              borderBottom: "1px solid #e5e7eb",
              background: "#f9fafb",
            }}
          >
            {/* Item header */}
            <div
              style={{
                fontWeight: 600,
                fontSize: "14px",
                marginBottom: "8px",
                color: "#374151",
              }}
            >
              {mergeItem.label}
            </div>

            {/* Field diffs for this item */}
            <div style={{ paddingLeft: "8px" }}>
              {mergeItem.fieldDiffs.map((fieldDiff, fieldIndex) => (
                <div
                  key={fieldIndex}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    padding: "6px 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <ct-checkbox
                    checked={fieldDiff.selected}
                    onClick={toggleMergeFieldSelectionHandler({
                      selectedMergeKeys,
                      selectionKey: fieldDiff.selectionKey,
                    })}
                    style={{ marginRight: "10px", marginTop: "2px" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px" }}>
                      <span style={{ color: "#666", marginRight: "8px" }}>
                        {fieldDiff.fieldLabel}:
                      </span>
                      <span
                        style={{
                          textDecoration: "line-through",
                          color: "#dc2626",
                          marginRight: "6px",
                        }}
                      >
                        {fieldDiff.currentValue}
                      </span>
                      <span style={{ color: "#16a34a" }}>
                        {fieldDiff.extractedValue}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );

    const mergeDiffPanel = (
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
          <h3 style={{ margin: 0, fontSize: "16px" }}>Review Suggested Changes</h3>
        </div>

        {ifElse(extractionPending, loadingState, null)}

        {ifElse(
          derive(extractionError, (err) => !!err && !extractionPending),
          errorState,
          null
        )}

        {ifElse(
          showMergeEmptyState,
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
              No changes to suggest.
            </p>
          </div>,
          null
        )}

        {ifElse(
          derive(hasMergeResults, (has) => has && !extractionPending),
          <div>
            {mergeSelectionBar}
            {mergeDiffList}
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
      hasFieldResults,
      itemCount,
      selectedCount,

      // Reactive selection array - use in JSX/computed
      selectedItems,

      // Selection helper function (backward compat - use in handlers)
      getSelectedItems,

      // Per-field diff mode outputs
      fieldDiffCount,
      selectedFieldCount,
      selectedFieldKeys: selectedFieldKeysComputed,
      getSelectedFieldValues,
      selectedFieldValues: selectedFieldValuesCell, // Reactive Cell version for handler params

      // Flattened handlers (following chatbot.tsx pattern)
      // NOTE: trigger/hiddenItemIds NOT exposed - parent already has them as inputs
      selectAll: selectAllItems({ selectedIds, allVisibleKeys }),
      selectNone: selectNoneItems({ selectedIds }),
      dismissAll: boundDismissAll,
      clearTrigger: clearTrigger({ trigger }),

      // Per-field diff mode handlers
      selectAllFields: boundSelectAllFields,
      selectNoFields: boundSelectNoFields,
      toggleFieldSelection: (key: string) => toggleFieldSelectionHandler({ selectedFieldKeys, fieldKey: key }),

      // Merge mode outputs (ID-matching merge for timing/wait-time)
      hasMergeResults,
      mergeItemCount,
      selectedMergeFieldCount,
      selectedMergeValues: selectedMergeValuesCell,
      getSelectedMergeValues,

      // Merge mode handlers
      selectAllMergeFields: boundSelectAllMergeFields,
      selectNoMergeFields: boundSelectNoMergeFields,
      toggleMergeFieldSelection: (itemId: string, fieldKey: string) =>
        toggleMergeFieldSelectionHandler({ selectedMergeKeys, selectionKey: `${itemId}:${fieldKey}` }),

      // UI components for composition
      ui: {
        complete,
        loadingState,
        errorState,
        emptyState,
        itemList,
        selectionBar,
        reviewPanel,
        fieldDiffPanel,
        mergeDiffPanel,
      },
    };
  }
);

export default ImportReview;
