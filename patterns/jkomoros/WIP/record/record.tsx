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
  recipe,
  str,
  UI,
} from "commontools";
import {
  createSubCharm,
  getAddableTypes,
  getDefinition,
} from "./sub-charms/registry.ts";
import type { SubCharmEntry, TrashedSubCharmEntry } from "./types/record-types.ts";

// ===== Types =====

interface RecordInput {
  title: Default<string, "">;
  subCharms: Default<SubCharmEntry[], []>;
  trashedSubCharms: Default<TrashedSubCharmEntry[], []>;
}

interface RecordOutput {
  title: Default<string, "">;
  subCharms: Default<SubCharmEntry[], []>;
  trashedSubCharms: Default<TrashedSubCharmEntry[], []>;
}

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

// ===== The Record Pattern =====
const Record = recipe<RecordInput, RecordOutput>(
  "Record",
  ({ title, subCharms, trashedSubCharms }) => {
    // Note: Initialization is handled by showing an "Add Notes" prompt when empty
    // We can't auto-initialize inside computed() since subCharms isn't a Cell there

    // ===== Handlers =====

    // Toggle pin state for a sub-charm
    const togglePin = handler<
      unknown,
      { subCharms: Cell<SubCharmEntry[]>; index: number }
    >((_event, { subCharms: sc, index }) => {
      const current = sc.get() || [];
      const entry = current[index];
      if (!entry) return;

      const updated = [...current];
      updated[index] = { ...entry, pinned: !entry.pinned };
      sc.set(updated);
    });

    // Add a new sub-charm
    const selectedAddType = Cell.of<string>("");
    const addSubCharm = handler<
      { detail: { value: string } },
      { subCharms: Cell<SubCharmEntry[]>; selectedAddType: Cell<string> }
    >(({ detail }, { subCharms: sc, selectedAddType: sat }) => {
      const type = detail?.value;
      if (!type) return;

      // Check if type already exists (singleton modules)
      const current = sc.get() || [];
      if (current.some((e) => e?.type === type)) {
        sat.set("");
        return;
      }

      // Create the sub-charm and add it
      const charm = createSubCharm(type);
      sc.set([...current, { type, pinned: false, charm }]);
      sat.set("");
    });

    // Move sub-charm to trash (soft delete)
    const trashSubCharm = handler<
      unknown,
      { subCharms: Cell<SubCharmEntry[]>; trashedSubCharms: Cell<TrashedSubCharmEntry[]>; index: number }
    >((_event, { subCharms: sc, trashedSubCharms: trash, index }) => {
      const current = sc.get() || [];
      const entry = current[index];
      if (!entry) return;

      // Move to trash with timestamp
      const trashed = trash.get() || [];
      trash.set([...trashed, { ...entry, trashedAt: new Date().toISOString() }]);

      // Remove from active
      sc.set(current.toSpliced(index, 1));
    });

    // Restore sub-charm from trash
    const restoreSubCharm = handler<
      unknown,
      { subCharms: Cell<SubCharmEntry[]>; trashedSubCharms: Cell<TrashedSubCharmEntry[]>; index: number }
    >((_event, { subCharms: sc, trashedSubCharms: trash, index }) => {
      const current = trash.get() || [];
      const entry = current[index];
      if (!entry) return;

      // Restore to active (without trashedAt)
      const { trashedAt: _trashedAt, ...restored } = entry;
      const active = sc.get() || [];
      sc.set([...active, restored]);

      // Remove from trash
      trash.set(current.toSpliced(index, 1));
    });

    // Permanently delete from trash
    const permanentlyDelete = handler<
      unknown,
      { trashedSubCharms: Cell<TrashedSubCharmEntry[]>; index: number }
    >((_event, { trashedSubCharms: trash, index }) => {
      const current = trash.get() || [];
      trash.set(current.toSpliced(index, 1));
    });

    // Empty all trash
    const emptyTrash = handler<
      unknown,
      { trashedSubCharms: Cell<TrashedSubCharmEntry[]> }
    >((_event, { trashedSubCharms: trash }) => {
      trash.set([]);
    });

    // ===== Computed Values =====

    // Display name with fallback
    const displayName = computed(() => {
      const t = title as unknown as string;
      return t?.trim() || "(Untitled Record)";
    });

    // Split sub-charms by pin status, preserving original indices
    // Using lift to avoid closure issues with opaque refs
    type IndexedEntry = { entry: SubCharmEntry; originalIndex: number };

    const pinnedWithIndex = lift(({ sc }: { sc: SubCharmEntry[] }) =>
      (sc || [])
        .map((entry, index) => ({ entry, originalIndex: index }))
        .filter(({ entry }) => entry?.pinned)
    )({ sc: subCharms });

    const unpinnedWithIndex = lift(({ sc }: { sc: SubCharmEntry[] }) =>
      (sc || [])
        .map((entry, index) => ({ entry, originalIndex: index }))
        .filter(({ entry }) => !entry?.pinned)
    )({ sc: subCharms });

    // All subcharms indexed (for grid layout when no split needed)
    const allWithIndex = lift(({ sc }: { sc: SubCharmEntry[] }) =>
      (sc || []).map((entry, index) => ({ entry, originalIndex: index }))
    )({ sc: subCharms });

    // Check layout mode based on pinned count
    // Use lift instead of computed for safer access to lift results
    const pinnedCount = lift(({ arr }: { arr: typeof pinnedWithIndex }) =>
      (arr || []).length
    )({ arr: pinnedWithIndex });

    const hasUnpinned = lift(({ arr }: { arr: typeof unpinnedWithIndex }) =>
      (arr || []).length > 0
    )({ arr: unpinnedWithIndex });

    // Check if record is empty (no sub-charms at all)
    const isEmpty = lift(({ sc }: { sc: SubCharmEntry[] }) =>
      (sc || []).length === 0
    )({ sc: subCharms });

    // Compute hasTypesToAdd directly from subCharms (no intermediate computed)
    const hasTypesToAdd = lift(({ sc }: { sc: SubCharmEntry[] }) => {
      const currentTypes = (sc || []).filter((e) => e?.type).map((e) => e.type);
      const available = getAddableTypes().filter(
        (def) => !currentTypes.some((t) => t === def.type)
      );
      return available.length > 0;
    })({ sc: subCharms });

    // Compute addSelectItems directly from subCharms (no intermediate computed)
    const addSelectItems = lift(({ sc }: { sc: SubCharmEntry[] }) => {
      const currentTypes = (sc || []).filter((e) => e?.type).map((e) => e.type);
      const available = getAddableTypes().filter(
        (def) => !currentTypes.some((t) => t === def.type)
      );
      return available.map((def) => ({
        value: def.type,
        label: `${def.icon} ${def.label}`,
      }));
    })({ sc: subCharms });

    // Handler to quickly add notes
    const addNotes = handler<
      unknown,
      { subCharms: Cell<SubCharmEntry[]> }
    >((_event, { subCharms: sc }) => {
      const current = sc.get() || [];
      if (current.some((e) => e?.type === "notes")) return;
      const notesCharm = createSubCharm("notes");
      sc.set([{ type: "notes", pinned: true, charm: notesCharm }, ...current]);
    });

    // ===== Trash Section Computed Values =====

    // Compute trash count directly
    const trashCount = lift(({ t }: { t: TrashedSubCharmEntry[] }) =>
      (t || []).length
    )({ t: trashedSubCharms });

    // Check if there are any trashed items
    const hasTrash = lift(({ t }: { t: TrashedSubCharmEntry[] }) =>
      (t || []).length > 0
    )({ t: trashedSubCharms });

    // Local state for trash section collapsed/expanded
    const trashExpanded = Cell.of(false);
    const toggleTrashExpanded = handler<unknown, { expanded: Cell<boolean> }>(
      (_event, { expanded }) => expanded.set(!expanded.get())
    );

    // Note: We avoid .map() with callbacks that reference subCharms
    // Instead, we render sub-charms directly inline where needed

    // ===== Main UI =====
    return {
      [NAME]: str`\u{1F4CB} ${displayName}`,
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
            {ifElse(
              hasTypesToAdd,
              <ct-select
                $value={selectedAddType}
                placeholder="+ Add"
                items={addSelectItems}
                onct-change={addSubCharm({ subCharms, selectedAddType })}
                style={{ width: "130px" }}
              />,
              <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                All modules added
              </span>
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
            {ifElse(
              isEmpty,
              // Empty state - show welcome message with Add Notes button
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: "16px",
                  color: "#6b7280",
                }}
              >
                <span style={{ fontSize: "48px" }}>📋</span>
                <span style={{ fontSize: "16px" }}>
                  Start by adding notes to your record
                </span>
                <button
                  onClick={addNotes({ subCharms })}
                  style={{
                    padding: "12px 24px",
                    background: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "16px",
                    cursor: "pointer",
                  }}
                >
                  📝 Add Notes
                </button>
              </div>,
              // Adaptive layout based on pinned count
              ifElse(
                pinnedCount > 0,
                // Primary + Rail layout (when items are pinned)
                <div style={{ display: "flex", gap: "16px" }}>
                  {/* Left: Pinned items (2/3 width) */}
                  <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: "12px" }}>
                    {pinnedWithIndex.map((item: { entry: SubCharmEntry; originalIndex: number }) => {
                      const displayInfo = getModuleDisplay({ type: item.entry.type });
                      return (
                        <div
                          key={item.originalIndex}
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
                            <span style={{ fontSize: "14px", fontWeight: "500", flex: "1" }}>
                              {displayInfo.icon} {displayInfo.label}
                            </span>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                              <button
                                onClick={togglePin({ subCharms, index: item.originalIndex })}
                                style={{
                                  background: "#e0f2fe",
                                  border: "1px solid #7dd3fc",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  padding: "4px 8px",
                                  fontSize: "12px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  color: "#0369a1",
                                }}
                                title="Unpin"
                              >
                                📌 Pinned
                              </button>
                              <button
                                onClick={trashSubCharm({ subCharms, trashedSubCharms, index: item.originalIndex })}
                                style={{
                                  background: "transparent",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  padding: "4px 8px",
                                  fontSize: "12px",
                                  color: "#6b7280",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                                title="Move to trash"
                              >
                                ✕ Remove
                              </button>
                            </div>
                          </div>
                          <div style={{ padding: "12px" }}>
                            {(item.entry.charm as any)?.[UI]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Right: Unpinned items in rail (1/3 width) */}
                  {ifElse(
                    hasUnpinned,
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
                      {unpinnedWithIndex.map((item: { entry: SubCharmEntry; originalIndex: number }) => {
                        const displayInfo = getModuleDisplay({ type: item.entry.type });
                        return (
                          <div
                            key={item.originalIndex}
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
                              <span style={{ fontSize: "14px", fontWeight: "500", flex: "1" }}>
                                {displayInfo.icon} {displayInfo.label}
                              </span>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                                <button
                                  onClick={togglePin({ subCharms, index: item.originalIndex })}
                                  style={{
                                    background: "transparent",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    color: "#6b7280",
                                  }}
                                  title="Pin to top"
                                >
                                  📌 Pin
                                </button>
                                <button
                                  onClick={trashSubCharm({ subCharms, trashedSubCharms, index: item.originalIndex })}
                                  style={{
                                    background: "transparent",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    color: "#6b7280",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                  title="Move to trash"
                                >
                                  ✕ Remove
                                </button>
                              </div>
                            </div>
                            <div style={{ padding: "12px" }}>
                              {(item.entry.charm as any)?.[UI]}
                            </div>
                          </div>
                        );
                      })}
                    </div>,
                    null
                  )}
                </div>,
                // Grid layout (no pinned items)
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 500px))",
                    gap: "12px",
                  }}
                >
                  {allWithIndex.map((item: { entry: SubCharmEntry; originalIndex: number }) => {
                    const displayInfo = getModuleDisplay({ type: item.entry.type });
                    return (
                      <div
                        key={item.originalIndex}
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
                          <span style={{ fontSize: "14px", fontWeight: "500", flex: "1" }}>
                            {displayInfo.icon} {displayInfo.label}
                          </span>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                            <button
                              onClick={togglePin({ subCharms, index: item.originalIndex })}
                              style={{
                                background: "transparent",
                                border: "1px solid #e5e7eb",
                                borderRadius: "4px",
                                cursor: "pointer",
                                padding: "4px 8px",
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                color: "#6b7280",
                              }}
                              title="Pin to top"
                            >
                              📌 Pin
                            </button>
                            <button
                              onClick={trashSubCharm({ subCharms, trashedSubCharms, index: item.originalIndex })}
                              style={{
                                background: "transparent",
                                border: "1px solid #e5e7eb",
                                borderRadius: "4px",
                                cursor: "pointer",
                                padding: "4px 8px",
                                fontSize: "12px",
                                color: "#6b7280",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="Move to trash"
                            >
                              ✕ Remove
                            </button>
                          </div>
                        </div>
                        <div style={{ padding: "12px" }}>
                          {(item.entry.charm as any)?.[UI]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

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
                      (entry: TrashedSubCharmEntry, index: number) => {
                        const displayInfo = getModuleDisplay({ type: entry.type });
                        return (
                          <div
                            key={index}
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
                                  index,
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
                                title="Restore module"
                              >
                                ↩️ Restore
                              </button>
                              <button
                                onClick={permanentlyDelete({
                                  trashedSubCharms,
                                  index,
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

export default Record;
