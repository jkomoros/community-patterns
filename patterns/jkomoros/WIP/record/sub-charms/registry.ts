// registry.ts - Sub-charm registry with type definitions
// Defines available sub-charm types and their metadata
// Note: Rendering stays in record.tsx (JSX requires recipe context)

import type { SubCharmType } from "../types/record-types.ts";

export interface SubCharmDefinition {
  type: SubCharmType;
  label: string;
  icon: string;
  // For Phase 2 extraction:
  schema?: Record<string, unknown>;
  fieldMapping?: string[];
}

// Static registry - defines available sub-charm types
export const SUB_CHARM_REGISTRY: Record<string, SubCharmDefinition> = {
  birthday: {
    type: "birthday",
    label: "Birthday",
    icon: "\u{1F382}", // 🎂
    // Phase 2: extraction fields
    schema: {
      birthDate: { type: "string", description: "Birthday YYYY-MM-DD" },
      birthYear: { type: "number", description: "Birth year" },
    },
    fieldMapping: ["birthDate", "birthYear"],
  },
};

// Helper functions
export function getAvailableTypes(): SubCharmDefinition[] {
  return Object.values(SUB_CHARM_REGISTRY);
}

export function getDefinition(
  type: SubCharmType
): SubCharmDefinition | undefined {
  return SUB_CHARM_REGISTRY[type];
}

// Phase 2: Build combined extraction schema
export function buildExtractionSchema(): {
  type: "object";
  properties: Record<string, unknown>;
} {
  const properties: Record<string, unknown> = {};
  for (const def of Object.values(SUB_CHARM_REGISTRY)) {
    if (def.schema) {
      Object.assign(properties, def.schema);
    }
  }
  return { type: "object", properties };
}

// Phase 2: Get field to sub-charm type mapping
export function getFieldToTypeMapping(): Record<string, string> {
  const fieldToType: Record<string, string> = {};
  for (const def of Object.values(SUB_CHARM_REGISTRY)) {
    if (def.fieldMapping) {
      for (const field of def.fieldMapping) {
        fieldToType[field] = def.type;
      }
    }
  }
  return fieldToType;
}
