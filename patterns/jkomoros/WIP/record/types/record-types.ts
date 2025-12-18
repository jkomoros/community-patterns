// record-types.ts - Shared types for the record pattern system
import type { Default } from "commontools";

// Sub-charm types (excluding notes which is built-in)
export type SubCharmType = "birthday";

export interface SubCharmMetadata {
  type: SubCharmType;
  label: string;
  icon: string;
}

// Simplified: Just track which sub-charm types are enabled
export type EnabledSubCharms = SubCharmType[];

export type LayoutConfig = { type: "tabbed" }; // Start simple

// Birthday data stored directly in Record
export interface BirthdayData {
  birthDate: Default<string, "">;
  birthYear: Default<number | null, null>;
}

export interface RecordInput {
  title: Default<string, "">;
  notes: Default<string, "">; // Built-in notes content
  enabledSubCharms: Default<EnabledSubCharms, []>; // Which sub-charms are enabled
  // Sub-charm data stored directly (avoids ct-render issues)
  birthdayData: Default<BirthdayData, { birthDate: "", birthYear: null }>;
  layout: Default<LayoutConfig, { type: "tabbed" }>;
}
