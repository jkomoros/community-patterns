/**
 * Shared types for the Family Hosting Tracker system
 */

// ============================================================================
// HOSTING CATEGORIES
// ============================================================================

export type HostingCategory = "they-hosted" | "we-hosted" | "neutral";

// ============================================================================
// ADDRESS TYPES
// ============================================================================

export interface Address {
  id: string;
  label: string; // "Home", "Beach House", etc.
  fullAddress: string;
  isPrimary: boolean;
}

// ============================================================================
// CALENDAR EVENT TYPES
// ============================================================================

/**
 * Normalized calendar event that works with both Google and Apple calendars
 */
export interface NormalizedCalendarEvent {
  id: string;
  source: "google" | "apple" | "manual";
  title: string;
  description: string;
  location: string;
  startDateTime: string;
  endDateTime: string;
  startDate: string; // YYYY-MM-DD for grouping
  isAllDay: boolean;
  attendees: string[]; // Email addresses
  calendarName: string;
}

// ============================================================================
// CLASSIFICATION RULE TYPES
// ============================================================================

export type RuleType =
  | "title_regex"
  | "description_regex"
  | "location_exact"
  | "location_regex"
  | "attendee_email";

export interface ClassificationRule {
  id: string;
  name: string;
  type: RuleType;
  pattern: string;
  familyId?: string; // Which family this rule matches (null = detect from event)
  category: HostingCategory;
  isNegative: boolean; // Exclusion rule
  priority: number; // Higher = checked first
  enabled: boolean;
  // Effectiveness tracking
  matchCount: number;
  correctCount: number;
  // Examples for LLM training
  positiveExamples: string[];
  negativeExamples: string[];
}

// ============================================================================
// HOSTING EVENT TYPES
// ============================================================================

export type ClassificationMethod = "auto-rule" | "auto-llm" | "manual";

export interface HostingEvent {
  id: string;
  calendarEventId?: string;
  title: string;
  date: string; // YYYY-MM-DD
  location: string;
  familyId: string;
  familyName: string; // Cached for display
  category: HostingCategory;
  classificationMethod: ClassificationMethod;
  confidence: number; // 0-1
  notes: string;
  classifiedAt: string; // ISO timestamp
}

// ============================================================================
// FAMILY HOSTING STATS (COMPUTED)
// ============================================================================

export type HostingStatus = "overdue" | "balanced" | "we-owe" | "they-owe";

export interface FamilyHostingStats {
  familyId: string;
  familyName: string;
  theyHostedCount: number;
  weHostedCount: number;
  neutralCount: number;
  lastTheyHosted: string | null; // ISO date
  lastWeHosted: string | null;
  daysSinceTheyHosted: number | null;
  isOverdue: boolean;
  status: HostingStatus;
}

// ============================================================================
// FAMILY MEMBER TYPES
// ============================================================================

export type FamilyRole = "parent" | "child" | "other";

export interface FamilyMember {
  id: string;
  name: string;
  role: FamilyRole;
  personCharmId?: string; // Optional link to person.tsx charm
}

// ============================================================================
// LLM RULE SUGGESTION TYPES
// ============================================================================

export interface RuleSuggestion {
  type: RuleType;
  pattern: string;
  name: string;
  reasoning: string;
  confidence: number; // 0-1
  potentialFalsePositives: string[];
  category: HostingCategory;
  familyId?: string;
}

export interface RuleSuggestionResponse {
  suggestions: RuleSuggestion[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalize location string for matching
 */
export function normalizeLocation(location: string): string {
  return location
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,#]/g, "")
    .replace(/\b(street|st)\b/gi, "st")
    .replace(/\b(avenue|ave)\b/gi, "ave")
    .replace(/\b(boulevard|blvd)\b/gi, "blvd")
    .replace(/\b(drive|dr)\b/gi, "dr")
    .replace(/\b(lane|ln)\b/gi, "ln")
    .replace(/\b(court|ct)\b/gi, "ct")
    .replace(/\b(road|rd)\b/gi, "rd")
    .trim();
}

/**
 * Check if a location matches an address (flexible matching)
 */
export function locationMatchesAddress(
  location: string,
  address: string
): boolean {
  if (!location || !address) return false;
  const normLocation = normalizeLocation(location);
  const normAddress = normalizeLocation(address);
  return normLocation.includes(normAddress) || normAddress.includes(normLocation);
}

/**
 * Check if a location is a neutral venue
 */
export function isNeutralLocation(
  location: string,
  neutralPatterns: string[]
): boolean {
  const lower = location.toLowerCase();
  return neutralPatterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}

/**
 * Match a regex pattern against text
 */
export function matchRegex(
  text: string,
  pattern: string,
  caseInsensitive: boolean = true
): boolean {
  if (!text || !pattern) return false;
  try {
    const flags = caseInsensitive ? "i" : "";
    const regex = new RegExp(pattern, flags);
    return regex.test(text);
  } catch {
    console.warn(`Invalid regex pattern: ${pattern}`);
    return false;
  }
}

/**
 * Calculate days since a date
 */
export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Compute hosting status based on counts and threshold
 */
export function computeHostingStatus(
  theyHostedCount: number,
  weHostedCount: number,
  daysSinceTheyHosted: number | null,
  overdueThresholdDays: number
): HostingStatus {
  // Check overdue first
  if (daysSinceTheyHosted !== null && daysSinceTheyHosted > overdueThresholdDays) {
    return "overdue";
  }

  // Check balance
  const diff = theyHostedCount - weHostedCount;
  if (Math.abs(diff) <= 1) {
    return "balanced";
  } else if (diff > 1) {
    // They've hosted more - we owe them
    return "we-owe";
  } else {
    // We've hosted more - they owe us
    return "they-owe";
  }
}
