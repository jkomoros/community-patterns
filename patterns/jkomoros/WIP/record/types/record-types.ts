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
  | "link"
  // Wave 3
  | "location"
  | "relationship"
  | "giftprefs"
  | "timing";

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

// Wave 3 modules

// Location module (places/venues)
export interface LocationData {
  locationName: Default<string, "">; // renamed to avoid conflict
  locationAddress: Default<string, "">; // full address as text
  coordinates: Default<string, "">; // "lat,lng" or empty
}

// Relationship module (people connections)
export interface RelationshipData {
  relationTypes: Default<string[], []>; // ["friend", "colleague", "family"]
  closeness: Default<string, "">; // "intimate" | "close" | "casual" | "distant"
  howWeMet: Default<string, "">;
  innerCircle: Default<boolean, false>;
}

// Gift preferences module
export interface GiftPrefsData {
  giftTier: Default<string, "">; // "always" | "occasions" | "reciprocal" | "none"
  favorites: Default<string[], []>;
  avoid: Default<string[], []>;
}

// Timing module (cooking/prep times)
export interface TimingData {
  prepTime: Default<number | null, null>; // minutes
  cookTime: Default<number | null, null>;
  restTime: Default<number | null, null>;
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
  // Wave 3 modules
  locationData: Default<LocationData, { locationName: ""; locationAddress: ""; coordinates: "" }>;
  relationshipData: Default<RelationshipData, { relationTypes: []; closeness: ""; howWeMet: ""; innerCircle: false }>;
  giftPrefsData: Default<GiftPrefsData, { giftTier: ""; favorites: []; avoid: [] }>;
  timingData: Default<TimingData, { prepTime: null; cookTime: null; restTime: null }>;
  layout: Default<LayoutConfig, { type: "tabbed" }>;
}

/**
 * RecordContext - Unified read-only view of all Record data.
 *
 * Used by sub-panels for cross-module data access.
 * - Current: Passed via computed() within record.tsx
 * - Future: Exported for charm linking when panels are extracted
 */
export interface RecordContext {
  // Identity
  title: string;
  displayName: string; // title with fallback
  notes: string;
  enabledSubCharms: EnabledSubCharms;

  // All module data (read-only snapshots)
  birthdayData: BirthdayData;
  ratingData: RatingData;
  tagsData: TagsData;
  contactData: ContactData;
  statusData: StatusData;
  addressData: AddressData;
  timelineData: TimelineData;
  socialData: SocialData;
  linkData: LinkData;
  locationData: LocationData;
  relationshipData: RelationshipData;
  giftPrefsData: GiftPrefsData;
  timingData: TimingData;
}
