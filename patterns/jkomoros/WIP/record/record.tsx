/// <cts-enable />
/**
 * Record Pattern - A data-up meta-container for accumulating data.
 *
 * Start with just notes, add structure over time. A record becomes a
 * person record, project record, etc. by adding relevant sub-charms.
 *
 * Goals:
 * - G1: Stable entity handle (charm ID stays same as sub-charms change)
 * - G2: Bottom-up data accumulation (start minimal, grow structure)
 * - G3: Layout management (tabbed for now, more layouts later)
 *
 * #record
 */

import {
  Cell,
  computed,
  type Default,
  handler,
  ifElse,
  NAME,
  recipe,
  str,
  UI,
} from "commontools";
import {
  getAvailableTypes,
  getDefinition,
  type SubCharmDefinition,
} from "./sub-charms/registry.ts";
import type {
  BirthdayData,
  EnabledSubCharms,
  RecordInput,
  SubCharmType,
} from "./types/record-types.ts";

interface RecordOutput {
  title: Default<string, "">;
  notes: Default<string, "">;
  enabledSubCharms: Default<EnabledSubCharms, []>;
  birthdayData: Default<BirthdayData, { birthDate: ""; birthYear: null }>;
}

const Record = recipe<RecordInput, RecordOutput>(
  "Record",
  ({ title, notes, enabledSubCharms, birthdayData }) => {
    // Active tab - "notes" is always first, then sub-charm types
    const activeTab = Cell.of<string>("notes");

    // Selected type for the "Add" dropdown
    const selectedAddType = Cell.of<string>("");

    // Add sub-charm handler - just adds to enabledSubCharms list
    const addSubCharm = handler<
      { detail: { value: string } },
      {
        enabledSubCharms: Cell<EnabledSubCharms>;
        activeTab: Cell<string>;
        selectedAddType: Cell<string>;
      }
    >(({ detail }, { enabledSubCharms, activeTab, selectedAddType }) => {
      const type = detail?.value as SubCharmType;
      if (!type) return;

      const current = enabledSubCharms.get();

      // Check if type already exists (singleton sub-charms)
      if (current.includes(type)) {
        return;
      }

      enabledSubCharms.set([...current, type]);

      // Switch to the new tab
      activeTab.set(type);

      // Reset the select
      selectedAddType.set("");
    });

    // Handler for birthday year input (number conversion)
    const updateBirthYear = handler<
      { detail: { value: string } },
      { birthdayData: Cell<BirthdayData> }
    >(({ detail }, { birthdayData }) => {
      const val = detail?.value;
      const current = birthdayData.get();
      birthdayData.set({
        ...current,
        birthYear: val ? parseInt(val, 10) : null,
      });
    });

    // Handler for birthday date input
    const updateBirthDate = handler<
      { detail: { value: string } },
      { birthdayData: Cell<BirthdayData> }
    >(({ detail }, { birthdayData }) => {
      const val = detail?.value ?? "";
      const current = birthdayData.get();
      birthdayData.set({
        ...current,
        birthDate: val,
      });
    });

    // Display name
    const displayName = computed(() =>
      (title as unknown as string).trim() || "(Untitled Record)"
    );

    // Check if birthday sub-charm is enabled
    const hasBirthday = computed(() =>
      (enabledSubCharms as unknown as EnabledSubCharms).includes("birthday")
    );

    // Get birthday display values
    const birthDateValue = computed(
      () => (birthdayData as unknown as BirthdayData).birthDate
    );
    const birthYearValue = computed(
      () => (birthdayData as unknown as BirthdayData).birthYear
    );

    // Available types for [+] dropdown (exclude already-added types)
    const availableToAdd = computed(() => {
      const current = enabledSubCharms as unknown as EnabledSubCharms;
      return getAvailableTypes().filter((def) => !current.includes(def.type));
    });

    // Check if we have types available to add
    const hasTypesToAdd = computed(
      () => (availableToAdd as unknown as SubCharmDefinition[]).length > 0
    );

    // Get items for the select dropdown
    const addSelectItems = computed(() =>
      (availableToAdd as unknown as SubCharmDefinition[]).map((def) => ({
        value: def.type,
        label: `${def.icon} ${def.label}`,
      }))
    );

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
                onct-change={addSubCharm({
                  enabledSubCharms,
                  activeTab,
                  selectedAddType,
                })}
                style={{ width: "130px" }}
              />,
              null
            )}
          </ct-hstack>

          {/* Tabbed Layout using ct-tabs */}
          <ct-tabs $value={activeTab} style={{ flex: "1" }}>
            <ct-tab-list>
              {/* Notes tab is always first (built-in) */}
              <ct-tab value="notes">{"\u{1F4DD}"} Notes</ct-tab>
              {/* Birthday tab (shown if enabled) */}
              {ifElse(
                hasBirthday,
                <ct-tab value="birthday">{"\u{1F382}"} Birthday</ct-tab>,
                null
              )}
            </ct-tab-list>

            {/* Notes panel (built-in) */}
            <ct-tab-panel value="notes">
              <ct-vstack
                style={{ height: "100%", gap: "8px", padding: "12px" }}
              >
                <ct-code-editor
                  $value={notes}
                  language="text/markdown"
                  theme="light"
                  wordWrap
                  placeholder="Add notes here. Start dumping data - structure comes later."
                  style={{ flex: "1", minHeight: "300px" }}
                />
              </ct-vstack>
            </ct-tab-panel>

            {/* Birthday panel (always rendered, tab visibility controlled above) */}
            <ct-tab-panel value="birthday">
              <ct-vstack style={{ padding: "16px", gap: "16px" }}>
                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Birth Date
                  </label>
                  <ct-input
                    value={birthDateValue}
                    onct-input={updateBirthDate({ birthdayData })}
                    placeholder="YYYY-MM-DD (e.g., 1990-03-15)"
                  />
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    Enter the full date if known
                  </span>
                </ct-vstack>

                <ct-vstack style={{ gap: "4px" }}>
                  <label style={{ fontWeight: "600", fontSize: "14px" }}>
                    Birth Year
                  </label>
                  <ct-input
                    type="number"
                    value={birthYearValue ?? ""}
                    onct-input={updateBirthYear({ birthdayData })}
                    placeholder="1990"
                  />
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    Used for age calculation
                  </span>
                </ct-vstack>
              </ct-vstack>
            </ct-tab-panel>
          </ct-tabs>
        </ct-vstack>
      ),
      title,
      notes,
      enabledSubCharms,
      birthdayData,
      "#record": true, // Discoverable via wish({ query: "#record" })
    };
  }
);

export default Record;
