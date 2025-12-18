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
    schema: {
      birthDate: { type: "string", description: "Birthday YYYY-MM-DD" },
      birthYear: { type: "number", description: "Birth year" },
    },
    fieldMapping: ["birthDate", "birthYear"],
  },
  rating: {
    type: "rating",
    label: "Rating",
    icon: "\u{2B50}", // ⭐
    schema: {
      rating: { type: "number", minimum: 1, maximum: 5, description: "Rating 1-5" },
    },
    fieldMapping: ["rating"],
  },
  tags: {
    type: "tags",
    label: "Tags",
    icon: "\u{1F3F7}", // 🏷️
    schema: {
      tags: { type: "array", items: { type: "string" }, description: "Tags" },
    },
    fieldMapping: ["tags"],
  },
  contact: {
    type: "contact",
    label: "Contact",
    icon: "\u{1F4E7}", // 📧
    schema: {
      email: { type: "string", description: "Email address" },
      phone: { type: "string", description: "Phone number" },
      website: { type: "string", description: "Website URL" },
    },
    fieldMapping: ["email", "phone", "website"],
  },
  // Wave 2 modules
  status: {
    type: "status",
    label: "Status",
    icon: "\u{1F4CA}", // 📊
    schema: {
      status: { type: "string", enum: ["planned", "active", "blocked", "done", "archived"], description: "Project status" },
    },
    fieldMapping: ["status"],
  },
  address: {
    type: "address",
    label: "Address",
    icon: "\u{1F4CD}", // 📍
    schema: {
      street: { type: "string", description: "Street address" },
      city: { type: "string", description: "City" },
      state: { type: "string", description: "State/Province" },
      zip: { type: "string", description: "ZIP/Postal code" },
    },
    fieldMapping: ["street", "city", "state", "zip"],
  },
  timeline: {
    type: "timeline",
    label: "Timeline",
    icon: "\u{1F4C5}", // 📅
    schema: {
      startDate: { type: "string", format: "date", description: "Start date" },
      targetDate: { type: "string", format: "date", description: "Target completion date" },
      completedDate: { type: "string", format: "date", description: "Actual completion date" },
    },
    fieldMapping: ["startDate", "targetDate", "completedDate"],
  },
  social: {
    type: "social",
    label: "Social",
    icon: "\u{1F517}", // 🔗
    schema: {
      platform: { type: "string", enum: ["twitter", "linkedin", "github", "instagram", "facebook", "youtube", "tiktok", "mastodon", "bluesky"], description: "Social platform" },
      handle: { type: "string", description: "Username/handle" },
      url: { type: "string", format: "uri", description: "Profile URL" },
    },
    fieldMapping: ["platform", "handle"],
  },
  link: {
    type: "link",
    label: "Link",
    icon: "\u{1F310}", // 🌐
    schema: {
      url: { type: "string", format: "uri", description: "URL" },
      linkTitle: { type: "string", description: "Link title" },
      description: { type: "string", description: "Description" },
    },
    fieldMapping: ["url", "linkTitle", "description"],
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
