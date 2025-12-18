// record-types.ts - Shared types for the record pattern system
import type { Default } from "commontools";

// Sub-charm types (excluding notes which is built-in)
export type SubCharmType =
  | "birthday"
  | "rating"
  | "tags"
  | "contact"
  | "status"
  | "address"
  | "timeline"
  | "social"
  | "link";

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

// Rating module (ultra-minimal)
export interface RatingData {
  rating: Default<number | null, null>; // 1-5 or null
}

// Tags module (array handling)
export interface TagsData {
  tags: Default<string[], []>;
}

// Contact module (multi-field)
export interface ContactData {
  email: Default<string, "">;
  phone: Default<string, "">;
  website: Default<string, "">;
}

// Status module (project/task tracking)
export interface StatusData {
  status: Default<string, "">; // "planned" | "active" | "blocked" | "done" | "archived"
}

// Address module
export interface AddressData {
  street: Default<string, "">;
  city: Default<string, "">;
  state: Default<string, "">;
  zip: Default<string, "">;
}

// Timeline module (project dates)
export interface TimelineData {
  startDate: Default<string, "">; // ISO date
  targetDate: Default<string, "">; // ISO date
  completedDate: Default<string, "">; // ISO date
}

// Social module (social media links)
export interface SocialData {
  platform: Default<string, "">; // "twitter" | "linkedin" | "github" | etc.
  handle: Default<string, "">;
  url: Default<string, "">;
}

// Link module (web links/resources)
export interface LinkData {
  url: Default<string, "">;
  linkTitle: Default<string, "">; // renamed to avoid conflict with Record title
  description: Default<string, "">;
}

export interface RecordInput {
  title: Default<string, "">;
  notes: Default<string, "">; // Built-in notes content
  enabledSubCharms: Default<EnabledSubCharms, []>; // Which sub-charms are enabled
  // Sub-charm data stored directly (avoids ct-render issues)
  birthdayData: Default<BirthdayData, { birthDate: ""; birthYear: null }>;
  ratingData: Default<RatingData, { rating: null }>;
  tagsData: Default<TagsData, { tags: [] }>;
  contactData: Default<ContactData, { email: ""; phone: ""; website: "" }>;
  // Wave 2 modules
  statusData: Default<StatusData, { status: "" }>;
  addressData: Default<AddressData, { street: ""; city: ""; state: ""; zip: "" }>;
  timelineData: Default<TimelineData, { startDate: ""; targetDate: ""; completedDate: "" }>;
  socialData: Default<SocialData, { platform: ""; handle: ""; url: "" }>;
  linkData: Default<LinkData, { url: ""; linkTitle: ""; description: "" }>;
  layout: Default<LayoutConfig, { type: "tabbed" }>;
}
