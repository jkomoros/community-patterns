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
 *   // In commit handler - pass selectedItems as Cell param and call .get()
 *   // See person.tsx applySelectedExtractedData for the correct pattern
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

  // Scalar append mode (for notes-like fields)
  // When true, extracted value appends to currentValue instead of replacing
  appendMode?: boolean;
  appendSeparator?: string;                 // Default: "\n\n"
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

  /**
   * Per-field diff mode (person.tsx use case).
   * When provided, enables field-diff UI (fieldDiffPanel).
   *
   * REQUIRED: When using fieldMappings, you MUST also provide:
   * - `schema`: Cell<object> - JSON schema with properties matching fieldMappings keys
   * - `systemPrompt`: Cell<string> - LLM instructions for extraction
   *
   * Or use `buildFieldMappingSchema(fieldMappings)` helper to auto-generate schema.
   *
   * NOTE: Due to OpaqueRef wrapping, you cannot iterate this array outside computed().
   *
   * @see person.tsx for correct usage example
   * @see buildFieldMappingSchema for convenience helper
   */
  fieldMappings?: FieldMapping[];

  /**
   * ID-matching merge mode (food-recipe.tsx timing/wait-time use case).
   * When provided, enables merge-diff UI (mergeDiffPanel).
   * Used for updating existing items by ID (e.g., update timing fields on step groups).
   *
   * REQUIRED: When using mergeFieldMappings, you MUST also provide:
   * - `schema`: Cell<object> - JSON schema for extraction
   * - `systemPrompt`: Cell<string> - LLM instructions for extraction
   *
   * @see food-recipe.tsx timingReview for correct usage example
   */
  mergeFieldMappings?: MergeFieldMapping[];

  /**
   * When true, ImportReview will ask the LLM to also return `remainingText`
   * containing any text from the input that was NOT used for extraction.
   *
   * This enables consuming patterns to:
   * - Update input text to show only unextracted content after commit
   * - Support iterative extraction workflows (paste more, extract more)
   *
   * REQUIRES: When using with fieldMappings, use
   * `buildFieldMappingSchema(mappings, { captureRemainingText: true })`
   * to include the remainingText field in the schema.
   *
   * @default false
   */
  captureRemainingText?: boolean;

  /**
   * Field key to append remainingText to.
   * Requires captureRemainingText: true.
   *
   * When specified:
   * - The target field's selectedValue includes remainingText appended
   * - Consumer doesn't need to manually handle remainingText
   * - The target field should also have appendMode: true in fieldMappings
   *
   * @example
   * ImportReview({
   *   captureRemainingText: true,
   *   appendRemainingTextTo: "notes",
   *   fieldMappings: [
   *     { key: "name", label: "Name", currentValue: name },
   *     { key: "notes", label: "Notes", currentValue: notes, appendMode: true },
   *   ],
   * });
   */
  appendRemainingTextTo?: string;
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
  selectionKey: string;           // Pre-computed key for handler (survives closure frame issues)
  _rawValue?: unknown[];          // For array fields: the raw array for selectedFieldValues Cell

  // Append mode metadata
  appendMode?: boolean;           // True if this field uses append semantics
  appendSeparator?: string;       // Separator for append (default "\n\n")
  _extractedOnly?: string;        // The raw extracted value (before combining with current)
  _combinedValue?: string;        // Preview of final value after append

  // Staleness tracking - for detecting if currentValue changed after extraction
  _currentValueCell?: Cell<string>;  // Original Cell reference (if was Cell)
  _snapshotValue?: string;           // Value at extraction time
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
  showUnmatchedItems?: boolean;             // Include extracted items that don't match existing (default: false)
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

// Unmatched item from extraction (when showUnmatchedItems=true)
interface ProcessedUnmatchedItem<T = unknown> {
  item: T;                                  // Full extracted item
  key: string;                              // Unique key (from idField)
  label: string;                            // Display label (from getItemLabel)
  selected: boolean;                        // For checkbox selection state
}

interface ImportReviewOutput<T extends ExtractedItem = ExtractedItem> {
  // State (reactive primitives)
  pending: boolean;
  error: unknown;
  hasResults: boolean;
  hasFieldResults: boolean;  // For field-diff mode
  showEmptyState: boolean;  // True when item extraction completed with no items
  showFieldEmptyState: boolean;  // True when field extraction completed with no changes
  itemCount: number;
  selectedCount: number;

  /**
   * Reactive selection array - use in JSX/computed for live updates.
   *
   * In handlers, pass as a Cell param and call .get().
   * See person.tsx applySelectedExtractedData for correct pattern.
   */
  selectedItems: T[];

  // Per-field diff mode outputs
  fieldDiffCount: number;                           // Number of changed fields
  selectedFieldCount: number;                       // Number of selected fields
  selectedFieldKeys: string[];                      // Keys of selected fields (reactive)
  hasStaleFields: boolean;                          // True if any currentValue changed since extraction
  /**
   * Reactive computed of selected field values - use in JSX/computed.
   *
   * In handlers, pass as handler param (framework will wrap appropriately).
   * See person.tsx applySelectedExtractedData for correct pattern.
   */
  selectedFieldValues: Record<string, unknown>;

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
  /**
   * Reactive computed of selected merge values - use in JSX/computed.
   *
   * In handlers, pass as handler param (framework will wrap appropriately).
   * See food-recipe.tsx applyTimingExtraction for correct pattern.
   */
  selectedMergeValues: Record<string, unknown>[];

  // Merge mode handlers
  selectAllMergeFields: () => void;
  selectNoMergeFields: () => void;
  toggleMergeFieldSelection: (itemId: string, fieldKey: string) => void;

  // Unmatched items outputs (when showUnmatchedItems=true in merge mode)
  hasUnmatchedItems: boolean;                              // Has unmatched items to show
  unmatchedItems: ProcessedUnmatchedItem[];                // All unmatched items with selection state
  unmatchedItemCount: number;                              // Number of unmatched items
  selectedUnmatchedItems: unknown[];                       // Reactive: items user selected for addition
  selectedUnmatchedCount: number;                          // Number of selected unmatched items

  // Unmatched items handlers
  selectAllUnmatched: () => void;
  selectNoUnmatched: () => void;
  toggleUnmatchedSelection: (itemKey: string) => void;

  /**
   * Text from the input that was NOT extracted into any field.
   * Only populated when `captureRemainingText: true` is set.
   *
   * Use this to update the input text Cell after commit:
   * ```typescript
   * const applyAndClear = handler((_, { inputText, remainingText }) => {
   *   // Apply selected fields...
   *   inputText.set(remainingText ?? "");
   * });
   * ```
   *
   * Returns empty string if all text was extracted or option not enabled.
   */
  remainingText: string;

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
    unmatchedItemsPanel: JSX.Element;  // Unmatched items UI (for showUnmatchedItems=true)
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

// IMPORTANT: Create Cell wrapper at MODULE LEVEL, not inside pattern function.
// Cell.of() inside pattern body breaks generateObject reactivity.
// See: community-docs investigation of test-import-review-items not triggering LLM
const DEFAULT_SCHEMA_CELL = Cell.of(DEFAULT_SCHEMA);
const DEFAULT_SYSTEM_PROMPT_CELL = Cell.of(DEFAULT_SYSTEM_PROMPT);

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default schema for item-list mode.
 * Extracts: { items: [{ name: string, description?: string }] }
 *
 * IMPORTANT: You must wrap this in Cell.of() in your parent pattern
 * and pass it as the `schema` prop. Creating Cell.of() inside a sub-pattern
 * breaks generateObject reactivity.
 *
 * @example
 * const schema = Cell.of(ITEM_LIST_SCHEMA);
 * const systemPrompt = Cell.of(ITEM_LIST_SYSTEM_PROMPT);
 *
 * const extraction = ImportReview({
 *   trigger,
 *   schema,
 *   systemPrompt,
 *   getKey: (item) => item.name,
 *   getLabel: (item) => item.description ? `${item.name} - ${item.description}` : item.name,
 * });
 */
export const ITEM_LIST_SCHEMA = DEFAULT_SCHEMA;

/**
 * Default system prompt for item-list mode.
 * Use with ITEM_LIST_SCHEMA for extracting lists of items.
 *
 * @example
 * const systemPrompt = Cell.of(ITEM_LIST_SYSTEM_PROMPT);
 */
export const ITEM_LIST_SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT;

/**
 * Build a JSON schema from FieldMapping array.
 * Convenience helper for field-diff mode when you don't need custom descriptions.
 *
 * @example
 * const schema = Cell.of(buildFieldMappingSchema([
 *   { key: "name", label: "Name" },
 *   { key: "email", label: "Email" },
 *   { key: "tags", label: "Tags", isArray: true },
 * ]));
 *
 * const extraction = ImportReview({
 *   trigger,
 *   schema,
 *   systemPrompt: Cell.of("Extract contact info..."),
 *   fieldMappings: [...]
 * });
 */
export function buildFieldMappingSchema(
  mappings: Array<{ key: string; label: string; isArray?: boolean }>,
  options?: { captureRemainingText?: boolean }
): object {
  const properties: Record<string, object> = {};
  // NOTE: No `required` array - let LLM omit fields it can't extract from input
  // This prevents <UNKNOWN> or placeholder values for missing fields

  for (const mapping of mappings) {
    if (mapping.isArray) {
      properties[mapping.key] = {
        type: "array",
        items: { type: "string" },
        description: mapping.label,
      };
    } else {
      properties[mapping.key] = {
        type: "string",
        description: mapping.label,
      };
    }
  }

  // Add remainingText field if requested - captures unextracted input text
  if (options?.captureRemainingText) {
    properties["remainingText"] = {
      type: "string",
      description: "Any text from the input that was NOT extracted into the above fields. Include context, filler words, and any content that doesn't map to a specific field. Return empty string if all text was extracted.",
    };
  }

  return {
    type: "object",
    properties,
    additionalProperties: false,
  };
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
// NOTE: Uses inverted logic - tracks DESELECTED keys, not selected
// Empty array = all selected, add to array = deselect
const toggleFieldSelectionHandler = handler<
  unknown,
  { deselectedFieldKeys: Cell<string[]>; fieldKey: string }
>((_, { deselectedFieldKeys, fieldKey }) => {
  // Defensive guards
  if (!fieldKey || typeof fieldKey !== "string") return;
  if (!deselectedFieldKeys) return;

  const current = deselectedFieldKeys.get() ?? [];
  if (current.includes(fieldKey)) {
    // Currently deselected → remove from list → now selected
    deselectedFieldKeys.set(current.filter((k) => k !== fieldKey));
  } else {
    // Currently selected → add to list → now deselected
    deselectedFieldKeys.push(fieldKey);
  }
});

// Select all changed fields
// With inverted logic: "select all" means "deselect none" → clear the array
const selectAllFieldsHandler = handler<
  unknown,
  { deselectedFieldKeys: Cell<string[]> }
>((_, { deselectedFieldKeys }) => {
  // Defensive guard
  if (!deselectedFieldKeys) return;

  deselectedFieldKeys.set([]);
});

// Deselect all fields
// With inverted logic: "select none" means "deselect all" → populate with all keys
const selectNoFieldsHandler = handler<
  unknown,
  { deselectedFieldKeys: Cell<string[]>; allChangedFieldKeys: string[] }
>((_, { deselectedFieldKeys, allChangedFieldKeys }) => {
  // Defensive guards
  if (!deselectedFieldKeys) return;
  if (!Array.isArray(allChangedFieldKeys)) return;

  deselectedFieldKeys.set([...allChangedFieldKeys]);
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
// UNMATCHED ITEMS HANDLERS (for showUnmatchedItems=true)
// ═══════════════════════════════════════════════════════════════════════════

// Toggle selection for a single unmatched item
const toggleUnmatchedSelectionHandler = handler<
  unknown,
  { selectedUnmatchedKeys: Cell<string[]>; itemKey: string }
>((_, { selectedUnmatchedKeys, itemKey }) => {
  // Defensive guards
  if (!itemKey || typeof itemKey !== "string") return;
  if (!selectedUnmatchedKeys) return;

  const current = selectedUnmatchedKeys.get() ?? [];
  if (current.includes(itemKey)) {
    // Deselect - remove from selectedUnmatchedKeys
    selectedUnmatchedKeys.set(current.filter((k) => k !== itemKey));
  } else {
    // Select - use .push() to avoid StorageTransactionInconsistent
    selectedUnmatchedKeys.push(itemKey);
  }
});

// Select all unmatched items
const selectAllUnmatchedHandler = handler<
  unknown,
  { selectedUnmatchedKeys: Cell<string[]>; allUnmatchedKeys: string[] }
>((_, { selectedUnmatchedKeys, allUnmatchedKeys }) => {
  // Defensive guards
  if (!selectedUnmatchedKeys) return;
  if (!Array.isArray(allUnmatchedKeys)) return;

  selectedUnmatchedKeys.set([...allUnmatchedKeys]);
});

// Deselect all unmatched items
const selectNoUnmatchedHandler = handler<
  unknown,
  { selectedUnmatchedKeys: Cell<string[]> }
>((_, { selectedUnmatchedKeys }) => {
  // Defensive guard
  if (!selectedUnmatchedKeys) return;

  selectedUnmatchedKeys.set([]);
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
    captureRemainingText,
    appendRemainingTextTo,
  }) => {
    // Use constants directly - NOT from props (that breaks generateObject)
    // See: community-docs/superstitions/2025-12-17-optional-non-cell-inputs-break-generateobject.md

    // ═══════════════════════════════════════════════════════════════════════
    // DEFENSIVE VALIDATION: Warn about common misconfigurations
    // ═══════════════════════════════════════════════════════════════════════
    if (fieldMappings && !schemaInput) {
      console.warn(
        "[ImportReview] fieldMappings provided without schema. " +
        "This will use DEFAULT_SCHEMA which expects { items: [...] }, " +
        "but your fieldMappings expect a flat object { field1, field2, ... }. " +
        "Either provide schema: Cell.of({...}) or use buildFieldMappingSchema(fieldMappings). " +
        "See person.tsx for correct usage."
      );
    }
    if (mergeFieldMappings && !schemaInput) {
      console.warn(
        "[ImportReview] mergeFieldMappings provided without schema. " +
        "Provide schema: Cell.of({...}) for correct extraction. " +
        "See food-recipe.tsx timingReview for correct usage."
      );
    }
    // NOTE: Validation of appendRemainingTextTo against fieldMappings is skipped here
    // because CTS wraps arrays in OpaqueRef which cannot be directly accessed at pattern
    // initialization time. The validation would require a computed() context.
    // The validation is deferred - if the field key doesn't exist, it simply won't append.

    // Use triggerInput directly - framework provides default from schema (Default<string, "">)
    // Don't create a fallback cell - that breaks reactivity tracking
    const trigger = triggerInput;

    // Internal cell for tracking selected items (separate from hidden)
    const selectedIds = cell<string[]>([]);

    // Internal cell for tracking DESELECTED fields (per-field diff mode)
    // Empty array = all fields selected (nothing deselected yet)
    // This inverted logic provides "default all selected" behavior
    const deselectedFieldKeys = cell<string[]>([]);

    // Internal cell for tracking selected merge fields (merge mode)
    // Format: ["itemId:fieldKey", "itemId:fieldKey", ...]
    const selectedMergeKeys = cell<string[]>([]);

    // Internal cell for tracking selected unmatched items (when showUnmatchedItems=true)
    // Format: ["itemKey1", "itemKey2", ...]
    const selectedUnmatchedKeys = cell<string[]>([]);

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
    // - Otherwise: use DEFAULT_SCHEMA_CELL constant (item-list mode)
    //
    // Why schema is a Cell prop:
    // OpaqueRef wrapping prevents building schemas from array props at init time.
    // Items iterated from `for...of` are ALSO OpaqueRef, so `mapping.key` throws.
    // Solution: Parent builds schema as a Cell, Cells don't get OpaqueRef wrapped.
    // See: community-docs/superstitions/2025-12-17-array-isarray-fails-for-subpattern-props.md
    //
    // CRITICAL: Use module-level Cell constants (DEFAULT_SCHEMA_CELL, DEFAULT_SYSTEM_PROMPT_CELL)
    // NOT Cell.of() inside pattern body - that breaks generateObject reactivity!
    const effectiveSchema = schemaInput ?? DEFAULT_SCHEMA_CELL;

    // Build effective system prompt - append remainingText instructions if enabled
    const baseSystemPrompt = systemPromptInput ?? DEFAULT_SYSTEM_PROMPT_CELL;
    const effectiveSystemPrompt = captureRemainingText
      ? derive(baseSystemPrompt, (base) =>
          `${base}\n\nIMPORTANT: Also include a "remainingText" field containing any text from the input that was NOT used for extraction. This includes filler words, context, and any content that doesn't map to a specific field. If all text was extracted, set remainingText to an empty string "". CRITICAL: Exclude any text matching the pattern "---EXTRACT-[numbers]---" from remainingText - this is a system separator, not user content.`
        )
      : baseSystemPrompt;

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
      // Use inverted logic: track deselected keys, not selected
      // Empty array = all selected (nothing deselected yet)
      const deselected = deselectedFieldKeys.get() ?? [];

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

          // Pre-compute selectionKey with template literal to survive closure frame issues
          const selectionKey = `${fieldKey}`;
          processed.push({
            key: fieldKey,
            label: fieldLabel,
            currentValue: "",  // No current value comparison for append mode
            extractedValue: `${arrayCount} ${arrayCountLabel} will be added`,
            hasChanged: true,  // Always "changed" if there are items
            selected: !deselected.includes(selectionKey),
            selectionKey,
            // Store the raw array for selectedFieldValues Cell
            _rawValue: extractedArray,
          } as ProcessedFieldDiff);
          continue;
        }

        // Scalar field handling
        // Check for append mode
        const isAppendMode = mapping.appendMode ?? false;
        const appendSeparator = mapping.appendSeparator ?? "\n\n";

        // Resolve currentValue - could be Cell or string
        let resolvedCurrentValue: string;
        if (fieldCurrentInput && typeof fieldCurrentInput === "object" && "get" in fieldCurrentInput) {
          // It's a Cell - get the value
          resolvedCurrentValue = (fieldCurrentInput as Cell<string>).get() ?? "";
        } else {
          resolvedCurrentValue = (fieldCurrentInput as string) ?? "";
        }

        const extractedValue = extractedRaw != null ? String(extractedRaw) : "";

        // Skip fields where LLM couldn't extract a value (returned null/empty)
        // This happens when the input text doesn't contain relevant info for this field
        if (!extractedValue || extractedValue.trim() === "") continue;

        // Filter placeholder values that LLM may fabricate when it can't extract real data
        // Be moderately specific - only filter known placeholder patterns, not all brackets/parens
        // This allows legitimate values like "(John Doe)" or "[2024-01-01]" to pass through
        const placeholderPatterns = /^(<UNKNOWN>|UNKNOWN|N\/A|n\/a|unknown|none|null|undefined|\[unknown\]|\[n\/a\]|\[none\]|\(unknown\)|\(n\/a\)|\(none\))$/i;
        if (placeholderPatterns.test(extractedValue.trim())) continue;

        // For append mode, compute the combined value
        let displayValue = extractedValue;
        let combinedValue: string | undefined;
        if (isAppendMode) {
          // Compute what the final value will be after append
          if (!resolvedCurrentValue.trim()) {
            combinedValue = extractedValue;
          } else {
            combinedValue = `${resolvedCurrentValue}${appendSeparator}${extractedValue}`;
          }
          // For display, we show what will be appended
          displayValue = extractedValue;
        }

        // Compare - for append mode, always show if there's extracted content
        // For replace mode, only show if there's a change
        const hasChanged = isAppendMode ? true : (resolvedCurrentValue !== extractedValue);
        if (!hasChanged) continue;

        // Pre-compute selectionKey with template literal to survive closure frame issues
        const selectionKey = `${fieldKey}`;

        // Check if fieldCurrentInput is a Cell for staleness tracking
        const isCell = fieldCurrentInput && typeof fieldCurrentInput === "object" && "get" in fieldCurrentInput;

        processed.push({
          key: fieldKey,
          label: fieldLabel,
          currentValue: resolvedCurrentValue,
          extractedValue: displayValue,
          hasChanged,
          selected: !deselected.includes(selectionKey),
          selectionKey,
          // Append mode metadata
          appendMode: isAppendMode,
          appendSeparator,
          _extractedOnly: extractedValue,
          _combinedValue: combinedValue,
          // Staleness tracking - store Cell ref and snapshot for later comparison
          _currentValueCell: isCell ? (fieldCurrentInput as Cell<string>) : undefined,
          _snapshotValue: resolvedCurrentValue,
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
    const allChangedFieldKeys = computed(() => fieldDiffs.map((f) => f.selectionKey));

    // Check if any field's currentValue Cell has changed since extraction
    // This warns user that the diff preview may be stale
    const hasStaleFields = computed(() => {
      for (const fieldDiff of fieldDiffs) {
        if (fieldDiff._currentValueCell && fieldDiff._snapshotValue !== undefined) {
          // NOTE: Type assertion needed because CTS transformer wraps Cell types in OpaqueCell,
          // creating complex intersection types. The .get() call is valid at runtime.
          const cellRef = fieldDiff._currentValueCell as unknown as Cell<string>;
          const currentNow = cellRef.get() ?? "";
          if (currentNow !== fieldDiff._snapshotValue) {
            return true;
          }
        }
      }
      return false;
    });

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

    // Extract remainingText from result (when captureRemainingText is enabled)
    const remainingTextComputed = computed(() => {
      // Return empty if feature not enabled
      if (!captureRemainingText) return "";

      const result = extractionResult;

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return "";

      const extractedData = result as Record<string, unknown>;
      const remaining = extractedData["remainingText"];

      // Validate it's a string and clean it up
      if (typeof remaining === "string") {
        return remaining
          .trim()
          // Remove trigger separator pattern (framework implementation detail, not user content)
          .replace(/\n?---EXTRACT-\d+---\n?/g, "")
          .trim();
      }

      return "";
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

        // Helper to unwrap Cell-wrapped items (food-recipe uses Cell<Array<Cell<StepGroup>>>)
        // NOTE: `as any` is required here because TypeScript cannot check for .get() method
        // on unknown types. This is a necessary pattern when items may or may not be Cell-wrapped.
        const unwrapItem = (item: unknown): Record<string, unknown> => {
          const unwrapped = (item as any)?.get ? (item as any).get() : item;
          return unwrapped as Record<string, unknown>;
        };

        // Process each extracted item
        for (const extractedItem of extractedArray) {
          const extractedObj = extractedItem as Record<string, unknown>;
          const itemId = String(extractedObj[idField] ?? "");
          if (!itemId) continue;

          // Find matching existing item (may be Cell-wrapped)
          const existingItem = existingItemsValue.find((existing: unknown) => {
            const existingObj = unwrapItem(existing);
            return String(existingObj[idField] ?? "") === itemId;
          });

          if (!existingItem) continue; // Skip if no matching existing item

          // Unwrap Cell-wrapped item if needed
          const existingObj = unwrapItem(existingItem);
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
    // 2b. UNMATCHED ITEMS (merge mode with showUnmatchedItems=true)
    // ═══════════════════════════════════════════════════════════════════════

    // Compute unmatched items from extraction that don't match any existing item
    const unmatchedItemsComputed = computed((): ProcessedUnmatchedItem[] => {
      // Only compute if mergeFieldMappings is provided with showUnmatchedItems=true
      const mfmArray = mergeFieldMappings as unknown as MergeFieldMapping[] | undefined;
      if (!mfmArray || mfmArray.length === 0) return [];

      // Check if any mapping has showUnmatchedItems=true
      const mappingWithUnmatched = mfmArray.find(m => m.showUnmatchedItems === true);
      if (!mappingWithUnmatched) return [];

      const result = extractionResult;
      const selectedKeys = selectedUnmatchedKeys.get() ?? [];

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return [];

      const extractedData = result as Record<string, unknown>;
      const processed: ProcessedUnmatchedItem[] = [];

      // Process the mapping with showUnmatchedItems
      const mapping = mappingWithUnmatched;
      const arrayKey = mapping.key;
      const idField = mapping.idField;
      const getItemLabel = mapping.getItemLabel ?? ((item: unknown) => {
        const obj = item as Record<string, unknown>;
        return String(obj?.name ?? obj?.id ?? "Unknown");
      });

      // Get extracted array from result
      const extractedArray = extractedData[arrayKey];
      if (!extractedArray || !Array.isArray(extractedArray)) return [];

      // Get existing items to match against
      const existingItemsValue = mapping.existingItems?.get() ?? [];

      // Helper to unwrap Cell-wrapped items
      // NOTE: `as any` is required here because TypeScript cannot check for .get() method
      // on unknown types. This is a necessary pattern when items may or may not be Cell-wrapped.
      const unwrapItem = (item: unknown): Record<string, unknown> => {
        const unwrapped = (item as any)?.get ? (item as any).get() : item;
        return unwrapped as Record<string, unknown>;
      };

      // Build a set of existing IDs for quick lookup
      const existingIds = new Set<string>();
      for (const existing of existingItemsValue) {
        const existingObj = unwrapItem(existing);
        const id = String(existingObj[idField] ?? "");
        if (id) existingIds.add(id);
      }

      // Find extracted items that don't match any existing item
      for (const extractedItem of extractedArray) {
        const extractedObj = extractedItem as Record<string, unknown>;
        const itemKey = String(extractedObj[idField] ?? "");
        if (!itemKey) continue;

        // Skip if this item matches an existing one
        if (existingIds.has(itemKey)) continue;

        // This is an unmatched item
        const label = getItemLabel(extractedItem);
        processed.push({
          item: extractedItem,
          key: itemKey,
          label,
          selected: selectedKeys.includes(itemKey),
        });
      }

      return processed;
    });

    // Unmatched items counts
    const hasUnmatchedItems = computed(() => unmatchedItemsComputed.length > 0);
    const unmatchedItemCount = computed(() => unmatchedItemsComputed.length);
    const selectedUnmatchedCount = computed(() => {
      return unmatchedItemsComputed.filter(item => item.selected).length;
    });

    // Get all unmatched item keys (for select all/none)
    const allUnmatchedKeys = computed(() => {
      return unmatchedItemsComputed.map(item => item.key);
    });

    // Reactive selected unmatched items (full item objects)
    const selectedUnmatchedItemsComputed = computed(() => {
      return unmatchedItemsComputed
        .filter(item => item.selected)
        .map(item => item.item);
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

    // Computed Cell version of selected field values
    // This is needed because handlers can't call functions captured via closure
    // due to OpaqueRef wrapping. Cells can be passed as handler params and read with .get()
    // NOTE: Uses inverted logic - returns values for keys NOT in deselectedFieldKeys
    const selectedFieldValuesCell = computed(() => {
      const deselected = deselectedFieldKeys.get() ?? [];
      const result = extractionResult;

      // Guard: no result or not an object
      if (!result || typeof result !== "object") return {};

      const extractedData = result as Record<string, unknown>;
      const selectedValues: Record<string, unknown> = {};

      // Get remainingText for appendRemainingTextTo feature
      const remaining = remainingTextComputed ?? "";

      // Process each field diff to handle append mode correctly
      for (const fieldDiff of fieldDiffs) {
        const key = fieldDiff.key;
        if (deselected.includes(key)) continue;
        if (!(key in extractedData)) continue;

        // Get append mode info - cast to string to avoid OpaqueRef issues
        const isAppend = fieldDiff.appendMode === true;
        const combinedVal = String(fieldDiff._combinedValue ?? "");
        const separator = String(fieldDiff.appendSeparator ?? "\n\n");

        // Check if this field has append mode
        if (isAppend && combinedVal) {
          // Use the pre-computed combined value
          let finalValue = combinedVal;

          // If this field is the appendRemainingTextTo target, also append remaining text
          if (appendRemainingTextTo === key && remaining.trim()) {
            finalValue = `${finalValue}${separator}${remaining}`;
          }

          selectedValues[key] = finalValue;
        } else {
          // Normal replace mode - use extracted value directly
          // But still check if this is the appendRemainingTextTo target
          if (appendRemainingTextTo === key && remaining.trim()) {
            // For non-append fields that receive remainingText, append it
            // Use the field's separator if configured, otherwise default
            const extracted = String(extractedData[key] ?? "");
            const fieldSeparator = String(fieldDiff.appendSeparator ?? "\n\n");
            selectedValues[key] = extracted ? `${extracted}${fieldSeparator}${remaining}` : remaining;
          } else {
            selectedValues[key] = extractedData[key];
          }
        }
      }

      return selectedValues;
    });

    // Reactive computed of selected field keys (for parent's reactive use)
    // NOTE: Uses inverted logic - returns keys NOT in deselectedFieldKeys
    const selectedFieldKeysComputed = computed(() => {
      const deselected = deselectedFieldKeys.get() ?? [];
      const allKeys = fieldDiffs.map((f) => f.key);
      return allKeys.filter((k) => !deselected.includes(k));
    });

    // Computed Cell version of selected merge values
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "8px" }}>
          <ct-loader size="md" show-elapsed></ct-loader>
        </div>
        <p style={{ margin: 0, color: "#0369a1" }}>Extracting data...</p>
      </div>
    );

    // Pre-bind dismissError handler OUTSIDE JSX to avoid ReadOnlyAddressError
    // Must be defined before errorState JSX which uses it
    const boundDismissError = dismissError({ trigger });

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
          onClick={boundDismissError}
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
    // Note: Using inverted logic - handlers take deselectedFieldKeys
    const boundSelectAllFields = selectAllFieldsHandler({ deselectedFieldKeys });
    const boundSelectNoFields = selectNoFieldsHandler({ deselectedFieldKeys, allChangedFieldKeys });
    const boundClearTrigger = clearTrigger({ trigger });
    // boundDismissError is defined earlier (before errorState JSX that uses it)

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

    // Map directly in JSX - following mergeDiffList pattern that works.
    // Key points:
    // 1. No derive() wrapper - derive() returns OpaqueRef-wrapped JSX that doesn't render on updates
    // 2. Pass deselectedFieldKeys Cell directly to handler (not unpacked)
    // 3. fieldDiff.key comes from map parameter, avoiding closure frame issues
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
                deselectedFieldKeys,
                fieldKey: fieldDiff.selectionKey,  // Use pre-computed selectionKey (not key) to survive closure frame
              })}
              style={{ marginRight: "12px", marginTop: "2px" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, marginBottom: "4px" }}>
                {fieldDiff.label}
                {fieldDiff.appendMode && (
                  <span
                    style={{
                      marginLeft: "8px",
                      fontSize: "12px",
                      color: "#2563eb",
                      fontWeight: 400,
                    }}
                  >
                    (append)
                  </span>
                )}
              </div>
              <div style={{ fontSize: "14px" }}>
                {/* For append mode: show current value in blue with + indicator */}
                {fieldDiff.appendMode ? (
                  <>
                    {fieldDiff.currentValue && (
                      <span
                        style={{
                          color: "#2563eb",
                          marginRight: "8px",
                        }}
                      >
                        {fieldDiff.currentValue}
                      </span>
                    )}
                    <span style={{ color: "#2563eb", marginRight: "8px", fontWeight: 600 }}>+</span>
                    <span
                      style={{
                        backgroundColor: "#dbeafe",
                        color: "#1e40af",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {fieldDiff.extractedValue || "(empty)"}
                    </span>
                  </>
                ) : (
                  <>
                    {/* For replace mode: show current with strikethrough in red */}
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
                    {fieldDiff.currentValue && (
                      <span style={{ color: "#666", marginRight: "8px" }}>→</span>
                    )}
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
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );

    // Remaining text preview - shows what input will contain after apply
    // Only visible when captureRemainingText is enabled
    // Styled as subtle footnote text, not a prominent box
    const remainingTextPreview = captureRemainingText ? (
      <div
        style={{
          marginTop: "8px",
          paddingTop: "8px",
          borderTop: "1px solid #e5e7eb",
        }}
      >
        <div style={{ fontSize: "12px", marginBottom: "2px", color: "#9ca3af" }}>
          After apply, input will contain:
        </div>
        {ifElse(
          derive(remainingTextComputed, (t) => !!t?.trim()),
          <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {derive(remainingTextComputed, (t) => {
              const text = t ?? "";
              if (text.length <= 150) return `"${text}"`;
              return `"${text.slice(0, 150)}..."`;
            })}
          </div>,
          <div style={{ fontSize: "12px", color: "#9ca3af", fontStyle: "italic" }}>
            (Input will be cleared)
          </div>
        )}
      </div>
    ) : null;

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
          <ct-button
            variant="secondary"
            size="sm"
            onClick={boundClearTrigger}
          >
            Dismiss
          </ct-button>
        </div>

        {ifElse(extractionPending, loadingState, null)}

        {ifElse(
          derive(extractionError, (err) => !!err && !extractionPending),
          errorState,
          null
        )}

        {/* Stale data warning - shows if field values changed after extraction */}
        {ifElse(
          hasStaleFields,
          <div
            style={{
              padding: "12px",
              marginBottom: "12px",
              background: "#fef3c7",
              borderRadius: "8px",
              border: "1px solid #f59e0b",
              fontSize: "14px",
            }}
          >
            <strong style={{ color: "#92400e" }}>⚠️ Fields changed:</strong>{" "}
            <span style={{ color: "#92400e" }}>
              Some field values have changed since extraction. Re-extract to see updated comparison.
            </span>
          </div>,
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
            {remainingTextPreview}
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

    // Unmatched items panel (for showUnmatchedItems=true)
    const unmatchedItemsPanel = (
      <div>
        {ifElse(
          hasUnmatchedItems,
          <div
            style={{
              marginTop: "16px",
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "8px",
              padding: "12px",
            }}
          >
            <h4
              style={{
                color: "#166534",
                margin: "0 0 8px 0",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "16px" }}>+</span>
              New Items ({unmatchedItemCount})
            </h4>
            <p style={{ fontSize: "12px", color: "#166534", margin: "0 0 12px 0" }}>
              These items were extracted but don't match any existing item. Select to add them.
            </p>

            {/* Unmatched items list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {unmatchedItemsComputed.map((item: ProcessedUnmatchedItem) => (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px",
                    background: "white",
                    borderRadius: "4px",
                    border: "1px solid #bbf7d0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={toggleUnmatchedSelectionHandler({
                      selectedUnmatchedKeys,
                      itemKey: item.key,
                    })}
                  />
                  <span style={{ flex: 1, fontSize: "14px" }}>{item.label}</span>
                </div>
              ))}
            </div>

            {/* Selection buttons */}
            <div
              style={{
                marginTop: "12px",
                display: "flex",
                gap: "8px",
                borderTop: "1px solid #bbf7d0",
                paddingTop: "12px",
              }}
            >
              <button
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  background: "#22c55e",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
                onClick={selectAllUnmatchedHandler({
                  selectedUnmatchedKeys,
                  allUnmatchedKeys,
                })}
              >
                Select All
              </button>
              <button
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  background: "white",
                  color: "#166534",
                  border: "1px solid #22c55e",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
                onClick={selectNoUnmatchedHandler({ selectedUnmatchedKeys })}
              >
                Select None
              </button>
              <span style={{ marginLeft: "auto", fontSize: "12px", color: "#166534" }}>
                {selectedUnmatchedCount} of {unmatchedItemCount} selected
              </span>
            </div>
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
      showEmptyState,
      showFieldEmptyState,
      itemCount,
      selectedCount,

      // Reactive selection array - use in JSX/computed
      selectedItems,

      // Per-field diff mode outputs
      fieldDiffCount,
      selectedFieldCount,
      selectedFieldKeys: selectedFieldKeysComputed,
      hasStaleFields,
      selectedFieldValues: selectedFieldValuesCell,

      // Flattened handlers (following chatbot.tsx pattern)
      // NOTE: trigger/hiddenItemIds NOT exposed - parent already has them as inputs
      //
      // PATTERN: Handler factories are pre-bound here with their Cell dependencies.
      // Parameterized handlers (toggleFieldSelection, toggleMergeFieldSelection,
      // toggleUnmatchedSelection) use inline arrow functions that call the handler
      // factory with runtime args. This is the idiomatic pattern for handlers that
      // need both Cell bindings AND runtime parameters - same as per-item handlers in JSX.
      selectAll: selectAllItems({ selectedIds, allVisibleKeys }),
      selectNone: selectNoneItems({ selectedIds }),
      dismissAll: boundDismissAll,
      clearTrigger: clearTrigger({ trigger }),

      // Per-field diff mode handlers
      selectAllFields: boundSelectAllFields,
      selectNoFields: boundSelectNoFields,
      toggleFieldSelection: (key: string) => toggleFieldSelectionHandler({ deselectedFieldKeys, fieldKey: key }),

      // Merge mode outputs (ID-matching merge for timing/wait-time)
      hasMergeResults,
      mergeItemCount,
      selectedMergeFieldCount,
      selectedMergeValues: selectedMergeValuesCell,

      // Merge mode handlers
      selectAllMergeFields: boundSelectAllMergeFields,
      selectNoMergeFields: boundSelectNoMergeFields,
      toggleMergeFieldSelection: (itemId: string, fieldKey: string) =>
        toggleMergeFieldSelectionHandler({ selectedMergeKeys, selectionKey: `${itemId}:${fieldKey}` }),

      // Unmatched items outputs (when showUnmatchedItems=true)
      hasUnmatchedItems,
      unmatchedItems: unmatchedItemsComputed,
      unmatchedItemCount,
      selectedUnmatchedItems: selectedUnmatchedItemsComputed,
      selectedUnmatchedCount,

      // Unmatched items handlers
      selectAllUnmatched: selectAllUnmatchedHandler({
        selectedUnmatchedKeys,
        allUnmatchedKeys,
      }),
      selectNoUnmatched: selectNoUnmatchedHandler({ selectedUnmatchedKeys }),
      toggleUnmatchedSelection: (itemKey: string) =>
        toggleUnmatchedSelectionHandler({ selectedUnmatchedKeys, itemKey }),

      // Remaining text (when captureRemainingText is enabled)
      remainingText: remainingTextComputed,

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
        unmatchedItemsPanel,
      },
    };
  }
);

export default ImportReview;
