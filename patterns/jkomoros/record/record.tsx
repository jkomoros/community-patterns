/// <cts-enable />
/**
 * Record Pattern v2 - True Sub-Charm Architecture
 *
 * A data-up meta-container where each module is its own sub-charm pattern.
 * This enables:
 * - Adding new module types without code changes to Record
 * - User-defined custom modules (future)
 * - Modules that can exist independently
 * - @-reference specific modules by charm ID
 *
 * #record
 */

import {
  Cell,
  computed,
  type Default,
  handler,
  ifElse,
  lift,
  NAME,
  pattern,
  str,
  toSchema,
  UI,
} from "commontools";
import {
  createSubCharm,
  getAddableTypes,
  getDefinition,
} from "./sub-charms/registry.ts";
import {
  inferTypeFromModules,
} from "./templates/template-registry.ts";
import { TypePickerModule } from "./sub-charms/type-picker-module.tsx";
import { setRecordPattern } from "./sub-charms/record-pattern-store.ts";
import type { SubCharmEntry, TrashedSubCharmEntry } from "./types/record-types.ts";

// ===== Types =====

interface RecordInput {
  title?: Default<string, "">;
  subCharms?: Default<SubCharmEntry[], []>;
  trashedSubCharms?: Default<TrashedSubCharmEntry[], []>;
}

interface RecordOutput {
  title?: Default<string, "">;
  subCharms?: Default<SubCharmEntry[], []>;
  trashedSubCharms?: Default<TrashedSubCharmEntry[], []>;
}

// ===== Auto-Initialize Notes + TypePicker (Two-Lift Pattern) =====
// Based on chatbot-list-view.tsx pattern:
// - Outer lift creates the charms and calls inner lift
// - Inner lift receives charms as input and stores them
// This works because the inner lift provides proper cause context
//
// TypePicker is a "controller module" - it receives parent Cells as input
// so it can modify the parent's subCharms list when a template is selected.

// Inner lift: stores the initial charms (receives charms as input)
// Only runs if subCharms is truly empty (not just on reload)
const storeInitialCharms = lift(
  toSchema<{
    notesCharm: unknown;
    typePickerCharm: unknown;
    subCharms: Cell<SubCharmEntry[]>;
  }>(),
  undefined,
  ({ notesCharm, typePickerCharm, subCharms }) => {
    // Double-check subCharms is empty before setting
    // This prevents re-initialization on reload
    const current = subCharms.get() || [];
    if (current.length === 0) {
      subCharms.set([
        { type: "notes", pinned: true, charm: notesCharm },
        { type: "type-picker", pinned: false, charm: typePickerCharm },
      ]);
      return notesCharm; // Return notes charm as primary reference
    }
  }
);

// Outer lift: checks if empty, creates charms, calls inner lift
// TypePicker receives parent Cells so it can modify subCharms when template selected
// Note: We check currentCharms (unwrapped value) to determine if we should initialize
const initializeRecord = lift(
  toSchema<{
    currentCharms: SubCharmEntry[];  // Unwrapped value, not Cell
    subCharms: Cell<SubCharmEntry[]>;
    trashedSubCharms: Cell<TrashedSubCharmEntry[]>;
  }>(),
  undefined,
  ({ currentCharms, subCharms, trashedSubCharms }) => {
    // Only initialize if truly empty (no existing modules)
    if ((currentCharms || []).length === 0) {
      const notesCharm = createSubCharm("notes");
      // TypePicker receives parent Cells as input (survives serialization)
      // deno-lint-ignore no-explicit-any
      const typePickerCharm = TypePickerModule({
        parentSubCharms: subCharms,
        parentTrashedSubCharms: trashedSubCharms,
      } as any);
      return storeInitialCharms({ notesCharm, typePickerCharm, subCharms });
    }
  }
);

// ===== Helper: Get charm name =====
const getCharmName = lift(({ charm }: { charm: unknown }) => {
  // deno-lint-ignore no-explicit-any
  return (charm as any)?.[NAME] || "Unknown";
});

// Helper to get module display info (icon + label) from type
const getModuleDisplay = lift(({ type }: { type: string }) => {
  const def = getDefinition(type);
  return {
    icon: def?.icon || "📋",
    label: def?.label || type,
  };
});

// Inner lift for charm repair: stores the repaired entries
const storeRepairedCharms = lift(
  toSchema<{
    repairedEntries: SubCharmEntry[];
    subCharms: Cell<SubCharmEntry[]>;
  }>(),
  undefined,
  ({ repairedEntries, subCharms }) => {
    // Only update if we actually have repaired entries
    if (repairedEntries && repairedEntries.length > 0) {
      subCharms.set(repairedEntries);
    }
  }
);

// Lift to repair charm instances after server restart (two-lift pattern)
// This runs once at startup and recreates any missing charm instances
const repairCharmInstances = lift(
  toSchema<{
    currentCharms: SubCharmEntry[];
    subCharms: Cell<SubCharmEntry[]>;
    trashedSubCharms: Cell<TrashedSubCharmEntry[]>;
  }>(),
  undefined,
  ({ currentCharms, subCharms, trashedSubCharms }) => {
    if (!currentCharms || currentCharms.length === 0) return;

    // Check if any charms need repair (missing UI symbol)
    // deno-lint-ignore no-explicit-any
    const needsRepair = currentCharms.some((e: SubCharmEntry) => e?.type && !(e?.charm as any)?.[UI]);
    if (!needsRepair) return;

    // Repair each entry
    const repairedEntries = currentCharms.map((entry: SubCharmEntry) => {
      // Skip if charm already has UI
      // deno-lint-ignore no-explicit-any
      if (entry?.charm && (entry.charm as any)?.[UI]) {
        return entry;
      }
      if (!entry?.type) return entry;

      // Type-picker needs parent Cells
      if (entry.type === "type-picker") {
        // deno-lint-ignore no-explicit-any
        const newCharm = TypePickerModule({
          parentSubCharms: subCharms,
          parentTrashedSubCharms: trashedSubCharms,
        } as any);
        return { ...entry, charm: newCharm };
      }

      // Regular modules - recreate from registry
      try {
        const newCharm = createSubCharm(entry.type);
        return { ...entry, charm: newCharm };
      } catch {
        return entry;
      }
    });

    // Store repaired entries using inner lift (two-lift pattern)
    return storeRepairedCharms({ repairedEntries, subCharms });
  }
);

// Lift to get a charm's UI (simplified - assumes charm is already repaired)
const getCharmUI = lift(({ entry }: { entry: SubCharmEntry }) => {
  // deno-lint-ignore no-explicit-any
  return (entry?.charm as any)?.[UI] || null;
});

// ===== Module-Scope Handlers (avoid closures, use references not indices) =====

// Toggle pin state for a sub-charm - uses entry reference, not index
const togglePin = handler<
  unknown,
  { subCharms: Cell<SubCharmEntry[]>; entry: SubCharmEntry }
>((_event, { subCharms: sc, entry }) => {
  const current = sc.get() || [];
  // Find by reference using charm identity
  const index = current.findIndex((e) => e?.charm === entry?.charm);
  if (index < 0) return;

  const updated = [...current];
  updated[index] = { ...entry, pinned: !entry.pinned };
  sc.set(updated);
});

// Add a new sub-charm
const addSubCharm = handler<
  { detail: { value: string } },
  { subCharms: Cell<SubCharmEntry[]>; selectedAddType: Cell<string> }
>(({ detail }, { subCharms: sc, selectedAddType: sat }) => {
  const type = detail?.value;
  if (!type) return;

  // Create the sub-charm and add it (multiple modules of same type allowed)
  const current = sc.get() || [];
  const charm = createSubCharm(type);
  sc.set([...current, { type, pinned: false, charm }]);
  sat.set("");
});

// Move sub-charm to trash (soft delete) - uses Cell.push() and Cell.remove()
const trashSubCharm = handler<
  unknown,
  { subCharms: Cell<SubCharmEntry[]>; trashedSubCharms: Cell<TrashedSubCharmEntry[]>; entry: SubCharmEntry }
>((_event, { subCharms: sc, trashedSubCharms: trash, entry }) => {
  // Move to trash with timestamp
  trash.push({ ...entry, trashedAt: new Date().toISOString() });

  // Remove from active
  sc.remove(entry);
});

// Restore sub-charm from trash - uses Cell.push() and Cell.remove()
const restoreSubCharm = handler<
  unknown,
  { subCharms: Cell<SubCharmEntry[]>; trashedSubCharms: Cell<TrashedSubCharmEntry[]>; entry: TrashedSubCharmEntry }
>((_event, { subCharms: sc, trashedSubCharms: trash, entry }) => {
  // Restore to active (without trashedAt)
  const { trashedAt: _trashedAt, ...restored } = entry;
  sc.push(restored);

  // Remove from trash
  trash.remove(entry);
});

// Permanently delete from trash - uses Cell.remove() with entry reference
const permanentlyDelete = handler<
  unknown,
  { trashedSubCharms: Cell<TrashedSubCharmEntry[]>; entry: TrashedSubCharmEntry }
>((_event, { trashedSubCharms: trash, entry }) => {
  trash.remove(entry);
});

// Empty all trash
const emptyTrash = handler<
  unknown,
  { trashedSubCharms: Cell<TrashedSubCharmEntry[]> }
>((_event, { trashedSubCharms: trash }) => {
  trash.set([]);
});

// Toggle trash section expanded/collapsed
const toggleTrashExpanded = handler<unknown, { expanded: Cell<boolean> }>(
  (_event, { expanded }) => expanded.set(!expanded.get())
);

// Insert module at a specific position via drag-and-drop
// Each drop zone knows exactly where to insert (after which entry)
const insertAtPosition = handler<
  { detail: { sourceCell: Cell<SubCharmEntry> } },
  {
    subCharms: Cell<SubCharmEntry[]>;
    insertAfterEntry: SubCharmEntry | null; // null = insert at start
    targetPinned: boolean;
  }
>((event, { subCharms, insertAfterEntry, targetPinned }) => {
  const draggedEntry = event.detail?.sourceCell?.get() as SubCharmEntry;
  if (!draggedEntry) return;

  const current = subCharms.get() || [];

  // Remove from current position
  const withoutDragged = current.filter((e) => e?.charm !== draggedEntry?.charm);

  // Update pinned state
  const updatedEntry = { ...draggedEntry, pinned: targetPinned };

  // Find insertion index
  let insertIndex: number;
  if (insertAfterEntry === null) {
    insertIndex = 0;
  } else {
    const afterIndex = withoutDragged.findIndex(
      (e) => e?.charm === insertAfterEntry?.charm
    );
    insertIndex = afterIndex >= 0 ? afterIndex + 1 : withoutDragged.length;
  }

  // Insert at position
  const newList = [
    ...withoutDragged.slice(0, insertIndex),
    updatedEntry,
    ...withoutDragged.slice(insertIndex),
  ];

  subCharms.set(newList);
});

// ===== The Record Pattern =====
const Record = pattern<RecordInput, RecordOutput>(
  ({ title, subCharms, trashedSubCharms }) => {

    // Local state
    const selectedAddType = Cell.of<string>("");
    const trashExpanded = Cell.of(false);

    // ===== Auto-initialize Notes + TypePicker =====
    // Only initializes if subCharms is empty (won't re-init on reload)
    initializeRecord({ currentCharms: subCharms, subCharms, trashedSubCharms });

    // ===== Repair charm instances after server restart =====
    // Charm instances don't survive JSON serialization, so we recreate them from their types
    repairCharmInstances({ currentCharms: subCharms, subCharms, trashedSubCharms });

    // ===== Computed Values =====

    // Display name with fallback
    const displayName = computed(() => title?.trim() || "(Untitled Record)");

    // Split sub-charms by pin status
    // No longer need indices - we use entry references directly
    // NOTE: Don't transform entries here - keep original Cell references for drag-and-drop
    const pinnedEntries = lift(({ sc }: { sc: SubCharmEntry[] }) =>
      (sc || []).filter((entry) => entry?.pinned)
    )({ sc: subCharms });

    const unpinnedEntries = lift(({ sc }: { sc: SubCharmEntry[] }) =>
      (sc || []).filter((entry) => !entry?.pinned)
    )({ sc: subCharms });

    // All subcharms (for grid layout when no split needed)
    const allEntries = lift(({ sc }: { sc: SubCharmEntry[] }) =>
      (sc || [])
    )({ sc: subCharms });

    // Check layout mode based on pinned count
    const pinnedCount = lift(({ arr }: { arr: SubCharmEntry[] }) =>
      (arr || []).length
    )({ arr: pinnedEntries });

    const hasUnpinned = lift(({ arr }: { arr: SubCharmEntry[] }) =>
      (arr || []).length > 0
    )({ arr: unpinnedEntries });

    // Check if there are any module types available to add
    // (always true unless registry is empty - multiple of same type allowed)
    const hasTypesToAdd = getAddableTypes().length > 0;

    // Build dropdown items from registry, separating new types from existing ones
    const addSelectItems = lift(({ sc }: { sc: SubCharmEntry[] }) => {
      const existingTypes = new Set((sc || []).map((e) => e?.type).filter(Boolean));
      const allTypes = getAddableTypes();

      const newTypes = allTypes.filter((def) => !existingTypes.has(def.type));
      const existingTypesDefs = allTypes.filter((def) => existingTypes.has(def.type));

      const items: { value: string; label: string; disabled?: boolean }[] = [];

      // Add new types first
      for (const def of newTypes) {
        items.push({ value: def.type, label: `${def.icon} ${def.label}` });
      }

      // Add divider and existing types if any
      if (existingTypesDefs.length > 0) {
        if (newTypes.length > 0) {
          items.push({ value: "", label: "── Add another ──", disabled: true });
        }
        for (const def of existingTypesDefs) {
          items.push({ value: def.type, label: `${def.icon} ${def.label}` });
        }
      }

      return items;
    })({ sc: subCharms });

    // Infer record type from modules (data-up philosophy)
    const inferredType = lift(({ sc }: { sc: SubCharmEntry[] }) => {
      const moduleTypes = (sc || []).map((e) => e?.type).filter(Boolean);
      return inferTypeFromModules(moduleTypes as string[]);
    })({ sc: subCharms });

    // Extract icon from inferred type for NAME display
    const recordIcon = lift(({ inferred }: { inferred: { icon: string } }) =>
      inferred?.icon || "\u{1F4CB}"
    )({ inferred: inferredType });

    // ===== Trash Section Computed Values =====

    // Compute trash count directly
    const trashCount = lift(({ t }: { t: TrashedSubCharmEntry[] }) =>
      (t || []).length
    )({ t: trashedSubCharms });

    // Check if there are any trashed items
    const hasTrash = lift(({ t }: { t: TrashedSubCharmEntry[] }) =>
      (t || []).length > 0
    )({ t: trashedSubCharms });

    // ===== Main UI =====
    return {
      [NAME]: str`${recordIcon} ${displayName}`,
      [UI]: (
        <ct-vstack style={{ height: "100%", gap: "0" }}>
          {/* Header toolbar */}
          <ct-hstack
            style={{
              padding: "8px 12px",
              gap: "8px",
              borderBottom: "1px solid #e5e7eb",
              alignItems: "center",
            }}
          >
            <ct-input
              $value={title}
              placeholder="Record title..."
              style={{ flex: "1", fontWeight: "600", fontSize: "16px" }}
            />
            {hasTypesToAdd && (
              <ct-select
                $value={selectedAddType}
                placeholder="+ Add"
                items={addSelectItems}
                onct-change={addSubCharm({ subCharms, selectedAddType })}
                style={{ width: "130px" }}
              />
            )}
          </ct-hstack>

          {/* Main content area */}
          <div
            style={{
              flex: "1",
              overflow: "auto",
              padding: "12px",
              background: "#f9fafb",
            }}
          >
            {/* Adaptive layout based on pinned count */}
            {ifElse(
                pinnedCount > 0,
                // Primary + Rail layout (when items are pinned)
                <div style={{ display: "flex", gap: "16px" }}>
                  {/* Left: Pinned items (2/3 width) */}
                  <div style={{ flex: 2, display: "flex", flexDirection: "column" }}>
                    {/* Drop zone before first item */}
                    <ct-drop-zone
                      accept="module"
                      onct-drop={insertAtPosition({ subCharms, insertAfterEntry: null, targetPinned: true })}
                    >
                      <div style={{ height: "8px", margin: "4px 0", borderRadius: "4px" }} />
                    </ct-drop-zone>
                    {pinnedEntries.map((entry, index) => {
                      const displayInfo = getModuleDisplay({ type: entry.type });
                      const isLast = index === pinnedEntries.length - 1;
                      return (
                        <>
                          <div
                            style={{
                              background: "white",
                              borderRadius: "8px",
                              border: "1px solid #e5e7eb",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "8px 12px",
                                borderBottom: "1px solid #f3f4f6",
                                background: "#fafafa",
                              }}
                            >
                              <ct-drag-source $cell={entry} type="module">
                                <span style={{ cursor: "grab", padding: "4px", marginRight: "4px", color: "#9ca3af" }}>⋮⋮</span>
                              </ct-drag-source>
                              <span style={{ fontSize: "14px", fontWeight: "500", flex: "1" }}>
                                {displayInfo.icon} {displayInfo.label}
                              </span>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                                <button
                                  onClick={togglePin({ subCharms, entry })}
                                  style={{
                                    background: "#e0f2fe",
                                    border: "1px solid #7dd3fc",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    color: "#0369a1",
                                  }}
                                  title="Unpin"
                                >
                                  📌
                                </button>
                                <button
                                  onClick={trashSubCharm({ subCharms, trashedSubCharms, entry })}
                                  style={{
                                    background: "transparent",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    color: "#6b7280",
                                  }}
                                  title="Remove"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                            <div style={{ padding: "12px", overflow: "hidden", minHeight: 0 }}>
                              {getCharmUI({ entry })}
                            </div>
                          </div>
                          {/* Drop zone after this item - final one is larger */}
                          <ct-drop-zone
                            accept="module"
                            onct-drop={insertAtPosition({ subCharms, insertAfterEntry: entry, targetPinned: true })}
                          >
                            <div style={{ height: "8px" }} />
                          </ct-drop-zone>
                        </>
                      );
                    })}
                  </div>
                  {/* Right: Unpinned items in rail (1/3 width) */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    {ifElse(
                      hasUnpinned,
                      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                        {/* Drop zone before first item */}
                        <ct-drop-zone
                          accept="module"
                          onct-drop={insertAtPosition({ subCharms, insertAfterEntry: null, targetPinned: false })}
                        >
                          <div style={{ height: "8px", margin: "4px 0", borderRadius: "4px" }} />
                        </ct-drop-zone>
                        {unpinnedEntries.map((entry, index) => {
                          const displayInfo = getModuleDisplay({ type: entry.type });
                          const isLast = index === unpinnedEntries.length - 1;
                          return (
                            <>
                              <div
                                style={{
                                  background: "white",
                                  borderRadius: "8px",
                                  border: "1px solid #e5e7eb",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 12px",
                                    borderBottom: "1px solid #f3f4f6",
                                    background: "#fafafa",
                                  }}
                                >
                                  <ct-drag-source $cell={entry} type="module">
                                    <span style={{ cursor: "grab", padding: "4px", marginRight: "4px", color: "#9ca3af" }}>⋮⋮</span>
                                  </ct-drag-source>
                                  <span style={{ fontSize: "14px", fontWeight: "500", flex: "1" }}>
                                    {displayInfo.icon} {displayInfo.label}
                                  </span>
                                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                                    <button
                                      onClick={togglePin({ subCharms, entry })}
                                      style={{
                                        background: "transparent",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        padding: "4px 8px",
                                        fontSize: "12px",
                                        color: "#6b7280",
                                      }}
                                      title="Pin"
                                    >
                                      📌
                                    </button>
                                    <button
                                      onClick={trashSubCharm({ subCharms, trashedSubCharms, entry })}
                                      style={{
                                        background: "transparent",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "4px",
                                        cursor: "pointer",
                                        padding: "4px 8px",
                                        fontSize: "12px",
                                        color: "#6b7280",
                                      }}
                                      title="Remove"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                                <div style={{ padding: "12px", overflow: "hidden", minHeight: 0 }}>
                                  {getCharmUI({ entry })}
                                </div>
                              </div>
                              {/* Drop zone after this item */}
                              <ct-drop-zone
                                accept="module"
                                onct-drop={insertAtPosition({ subCharms, insertAfterEntry: entry, targetPinned: false })}
                              >
                                <div style={{ height: "8px" }} />
                              </ct-drop-zone>
                            </>
                          );
                        })}
                      </div>,
                      <ct-drop-zone
                        accept="module"
                        onct-drop={insertAtPosition({ subCharms, insertAfterEntry: null, targetPinned: false })}
                      >
                        <div style={{ height: "8px" }} />
                      </ct-drop-zone>
                    )}
                  </div>
                </div>,
                // Grid layout (no pinned items) - use flex column with drop zones between
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  {/* Drop zone before first item */}
                  <ct-drop-zone
                    accept="module"
                    onct-drop={insertAtPosition({ subCharms, insertAfterEntry: null, targetPinned: false })}
                  >
                    <div style={{ height: "8px" }} />
                  </ct-drop-zone>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 500px))",
                      gap: "12px",
                    }}
                  >
                    {allEntries.map((entry) => {
                      const displayInfo = getModuleDisplay({ type: entry.type });
                      return (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <div
                            style={{
                              background: "white",
                              borderRadius: "8px",
                              border: "1px solid #e5e7eb",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "8px 12px",
                                borderBottom: "1px solid #f3f4f6",
                                background: "#fafafa",
                              }}
                            >
                              <ct-drag-source $cell={entry} type="module">
                                <span style={{ cursor: "grab", padding: "4px", marginRight: "4px", color: "#9ca3af" }}>⋮⋮</span>
                              </ct-drag-source>
                              <span style={{ fontSize: "14px", fontWeight: "500", flex: "1" }}>
                                {displayInfo.icon} {displayInfo.label}
                              </span>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                                <button
                                  onClick={togglePin({ subCharms, entry })}
                                  style={{
                                    background: "transparent",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    color: "#6b7280",
                                  }}
                                  title="Pin"
                                >
                                  📌
                                </button>
                                <button
                                  onClick={trashSubCharm({ subCharms, trashedSubCharms, entry })}
                                  style={{
                                    background: "transparent",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    color: "#6b7280",
                                  }}
                                  title="Remove"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                            <div style={{ padding: "12px", overflow: "hidden", minHeight: 0 }}>
                              {getCharmUI({ entry })}
                            </div>
                          </div>
                          {/* Drop zone after this item */}
                          <ct-drop-zone
                            accept="module"
                            onct-drop={insertAtPosition({ subCharms, insertAfterEntry: entry, targetPinned: false })}
                          >
                            <div style={{ height: "8px" }} />
                          </ct-drop-zone>
                        </div>
                      );
                    })}
                  </div>
                  {/* Final drop zone after grid */}
                  <ct-drop-zone
                    accept="module"
                    onct-drop={insertAtPosition({ subCharms, insertAfterEntry: allEntries[allEntries.length - 1], targetPinned: false })}
                  >
                    <div style={{ height: "8px" }} />
                  </ct-drop-zone>
                </div>
              )
            }

            {/* Collapsible Trash Section */}
            {ifElse(
              hasTrash,
              <div
                style={{
                  marginTop: "16px",
                  borderTop: "1px solid #e5e7eb",
                  paddingTop: "12px",
                }}
              >
                <button
                  onClick={toggleTrashExpanded({ expanded: trashExpanded })}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#6b7280",
                    fontSize: "13px",
                    width: "100%",
                    padding: "8px",
                  }}
                >
                  <span
                    style={{
                      transform: trashExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}
                  >
                    ▶
                  </span>
                  🗑️ Trash ({trashCount})
                </button>

                {ifElse(
                  trashExpanded,
                  <div style={{ paddingLeft: "16px", marginTop: "8px" }}>
                    {trashedSubCharms.map(
                      (entry: TrashedSubCharmEntry) => {
                        const displayInfo = getModuleDisplay({ type: entry.type });
                        return (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "8px 12px",
                              background: "#f9fafb",
                              borderRadius: "6px",
                              marginBottom: "4px",
                              opacity: "0.7",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "13px",
                                color: "#6b7280",
                                flex: "1",
                              }}
                            >
                              {displayInfo.icon} {displayInfo.label}
                            </span>
                            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                              <button
                                onClick={restoreSubCharm({
                                  subCharms,
                                  trashedSubCharms,
                                  entry,
                                })}
                                style={{
                                  background: "#e0f2fe",
                                  border: "1px solid #7dd3fc",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  padding: "4px 8px",
                                  fontSize: "12px",
                                  color: "#0369a1",
                                }}
                                title="Restore"
                              >
                                ↩️
                              </button>
                              <button
                                onClick={permanentlyDelete({
                                  trashedSubCharms,
                                  entry,
                                })}
                                style={{
                                  background: "transparent",
                                  border: "1px solid #fecaca",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  padding: "4px 8px",
                                  fontSize: "12px",
                                  color: "#dc2626",
                                }}
                                title="Delete permanently"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        );
                      }
                    )}

                    <button
                      onClick={emptyTrash({ trashedSubCharms })}
                      style={{
                        marginTop: "8px",
                        background: "transparent",
                        border: "1px solid #fecaca",
                        borderRadius: "4px",
                        cursor: "pointer",
                        padding: "6px 12px",
                        fontSize: "12px",
                        color: "#dc2626",
                        width: "100%",
                      }}
                    >
                      Empty Trash
                    </button>
                  </div>,
                  null
                )}
              </div>,
              null
            )}
          </div>
        </ct-vstack>
      ),
      title,
      subCharms,
      trashedSubCharms,
      "#record": true,
    };
  }
);

// Register Record pattern for backlink creation in NotesModule
// This allows [[New Name]] in Notes to create new Record charms
setRecordPattern(Record);

export default Record;
