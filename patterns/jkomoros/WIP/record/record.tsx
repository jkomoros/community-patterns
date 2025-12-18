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
import type { SubCharmEntry } from "./types/record-types.ts";

// ===== Types =====

interface RecordInput {
  title: Default<string, "">;
  subCharms: Default<SubCharmEntry[], []>;
}

interface RecordOutput {
  title: Default<string, "">;
  subCharms: Default<SubCharmEntry[], []>;
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
  ({ title, subCharms }) => {
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

    // Remove a sub-charm
    const removeSubCharm = handler<
      unknown,
      { subCharms: Cell<SubCharmEntry[]>; index: number }
    >((_event, { subCharms: sc, index }) => {
      const current = sc.get() || [];
      // Don't remove notes
      if (current[index]?.type === "notes") return;
      sc.set(current.toSpliced(index, 1));
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
              // Has sub-charms - display them in a simple list
              // Using subCharms.map() with a simple callback that doesn't reference subCharms
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {subCharms.map((entry: SubCharmEntry, index: number) => {
                  // Use lift helper to get display info from type
                  const displayInfo = getModuleDisplay({ type: entry.type });
                  return (
                    <div
                      key={index}
                      style={{
                        background: "white",
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        overflow: "hidden",
                      }}
                    >
                      {/* Card header */}
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
                        <span style={{ fontSize: "14px", fontWeight: "500" }}>
                          {displayInfo.icon} {displayInfo.label}
                        </span>
                        <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                          {entry.pinned ? "📌" : ""}
                        </span>
                      </div>
                      {/* Card body - render the sub-charm's UI */}
                      <div style={{ padding: "12px" }}>
                        {(entry.charm as any)?.[UI]}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ct-vstack>
      ),
      title,
      subCharms,
      "#record": true,
    };
  }
);

export default Record;
