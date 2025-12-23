/// <cts-enable />
/**
 * iCal/ICS Generator Utility
 *
 * Generates RFC 5545 compliant iCalendar content for calendar events.
 * Supports recurring events with RRULE for weekly schedules.
 *
 * Note: Use <ct-file-download> component to trigger downloads.
 *
 * Usage:
 * ```ts
 * import { generateICS, type ICalEvent } from "./util/ical-generator.ts";
 *
 * const events: ICalEvent[] = [{
 *   uid: "chess-monday-123",
 *   summary: "Chess Club",
 *   location: "Room 101",
 *   description: "Weekly chess practice",
 *   startDate: "2025-01-06",
 *   startTime: "15:00",
 *   endTime: "16:00",
 *   rrule: { freq: "WEEKLY", byday: "MO", until: "2025-05-30" },
 * }];
 *
 * const icsContent = generateICS(events, { prodId: "-//MyApp//EN" });
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/**
 * Recurrence rule for repeating events.
 * Maps to iCal RRULE format.
 */
export interface RRule {
  /** Frequency: DAILY, WEEKLY, MONTHLY, YEARLY */
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  /** Interval between occurrences (e.g., 2 = every 2 weeks) */
  interval?: number;
  /** Days of week (for WEEKLY): MO, TU, WE, TH, FR, SA, SU */
  byday?: string;
  /** End date (YYYYMMDD or YYYY-MM-DD format) */
  until?: string;
  /** Number of occurrences instead of until date */
  count?: number;
}

/**
 * Calendar event for iCal generation.
 */
export interface ICalEvent {
  /** Unique identifier for the event */
  uid: string;
  /** Event title/summary */
  summary: string;
  /** Event location (optional) */
  location?: string;
  /** Event description (optional) */
  description?: string;
  /** Start date in YYYY-MM-DD format */
  startDate: string;
  /** Start time in HH:MM (24h) format */
  startTime: string;
  /** End time in HH:MM (24h) format */
  endTime: string;
  /** Timezone identifier (e.g., "America/Los_Angeles"). Defaults to local. */
  timezone?: string;
  /** Recurrence rule for repeating events */
  rrule?: RRule;
  /** Whether this is an all-day event */
  allDay?: boolean;
}

/**
 * Options for ICS generation.
 */
export interface ICSOptions {
  /** Product identifier (default: "-//CommonTools//Extracurricular//EN") */
  prodId?: string;
  /** Calendar name for X-WR-CALNAME header */
  calendarName?: string;
  /** Default timezone for events */
  timezone?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_MAP: Record<DayOfWeek, string> = {
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sunday: "SU",
};

const DEFAULT_PRODID = "-//CommonTools//Extracurricular//EN";

// Regex patterns for validation
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Escapes special characters for iCal text fields.
 * Per RFC 5545: backslash, semicolon, comma must be escaped.
 * Newlines become literal \n.
 */
function escapeText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
}

/**
 * Validates and formats a date string (YYYY-MM-DD) to iCal date format (YYYYMMDD).
 * @throws Error if date format is invalid
 */
function formatDate(dateStr: string): string {
  if (!dateStr || !DATE_PATTERN.test(dateStr)) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD`);
  }
  return dateStr.replace(/-/g, "");
}

/**
 * Validates and formats a time string (HH:MM) to iCal time format (HHMMSS).
 * @throws Error if time format is invalid
 */
function formatTime(timeStr: string): string {
  if (!timeStr || !TIME_PATTERN.test(timeStr)) {
    throw new Error(`Invalid time format: "${timeStr}". Expected HH:MM`);
  }
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const minute = parseInt(m, 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time value: "${timeStr}". Hours must be 0-23, minutes 0-59`);
  }
  return `${h.padStart(2, "0")}${m.padStart(2, "0")}00`;
}

/**
 * Formats a datetime for iCal (YYYYMMDDTHHMMSS).
 * If timezone is provided, returns local time format (no Z suffix).
 * If no timezone, returns UTC format with Z suffix.
 */
function formatDateTime(
  dateStr: string,
  timeStr: string,
  timezone?: string
): string {
  const date = formatDate(dateStr);
  const time = formatTime(timeStr);
  // When timezone is specified, we use local time format (no Z)
  // The TZID parameter on the property handles the timezone
  return `${date}T${time}`;
}

/**
 * Generates a DTSTAMP in UTC format (required by RFC 5545).
 */
function generateDTStamp(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const seconds = String(now.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Generates an RRULE string from RRule object.
 */
function formatRRule(rrule: RRule): string {
  const parts: string[] = [`FREQ=${rrule.freq}`];

  if (rrule.interval && rrule.interval > 1) {
    parts.push(`INTERVAL=${rrule.interval}`);
  }

  if (rrule.byday) {
    parts.push(`BYDAY=${rrule.byday}`);
  }

  if (rrule.until) {
    // Format until date - ensure it's in YYYYMMDD format
    const until = rrule.until.replace(/-/g, "");
    parts.push(`UNTIL=${until}T235959Z`);
  } else if (rrule.count) {
    parts.push(`COUNT=${rrule.count}`);
  }

  return parts.join(";");
}

/**
 * Folds long lines per RFC 5545 (max 75 octets).
 * Continuation lines start with a space.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;

  const result: string[] = [];
  let remaining = line;

  // First line can be up to 75 chars
  result.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);

  // Continuation lines start with space, so max content is 74 chars
  while (remaining.length > 0) {
    result.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }

  return result.join("\r\n");
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generates iCal/ICS content from an array of events.
 *
 * @param events - Array of calendar events
 * @param options - Generation options
 * @returns ICS file content as a string
 */
export function generateICS(
  events: ICalEvent[],
  options: ICSOptions = {}
): string {
  const prodId = options.prodId || DEFAULT_PRODID;
  const defaultTz = options.timezone || "America/Los_Angeles";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  if (options.calendarName) {
    lines.push(`X-WR-CALNAME:${escapeText(options.calendarName)}`);
  }

  // Add default timezone
  lines.push(`X-WR-TIMEZONE:${defaultTz}`);

  // Generate each event
  for (const event of events) {
    const tz = event.timezone || defaultTz;
    const dtstamp = generateDTStamp();

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);

    // Start/end times with timezone
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(event.startDate)}`);
      // For all-day events, DTEND is the next day
      const endDate = new Date(event.startDate);
      endDate.setDate(endDate.getDate() + 1);
      const endDateStr = endDate.toISOString().split("T")[0];
      lines.push(`DTEND;VALUE=DATE:${formatDate(endDateStr)}`);
    } else {
      const dtstart = formatDateTime(event.startDate, event.startTime, tz);
      const dtend = formatDateTime(event.startDate, event.endTime, tz);
      lines.push(`DTSTART;TZID=${tz}:${dtstart}`);
      lines.push(`DTEND;TZID=${tz}:${dtend}`);
    }

    // Summary (title)
    lines.push(foldLine(`SUMMARY:${escapeText(event.summary)}`));

    // Location
    if (event.location) {
      lines.push(foldLine(`LOCATION:${escapeText(event.location)}`));
    }

    // Description
    if (event.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeText(event.description)}`));
    }

    // Recurrence rule
    if (event.rrule) {
      lines.push(`RRULE:${formatRRule(event.rrule)}`);
    }

    lines.push("STATUS:CONFIRMED");
    lines.push("TRANSP:OPAQUE");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // Join with CRLF as required by RFC 5545
  return lines.join("\r\n");
}

/**
 * Converts a day of week to iCal BYDAY format.
 */
export function dayToICalDay(day: DayOfWeek): string {
  return DAY_MAP[day] || "MO";
}

/**
 * Generates a deterministic unique ID for an event based on its properties.
 * This allows duplicate detection - same event properties = same UID.
 *
 * Format: {name-slug}-{day}-{time}-{startDate}@commontools.app
 *
 * @param name - Event name/summary
 * @param day - Day of week (e.g., "monday")
 * @param startTime - Start time in HH:MM format
 * @param startDate - First occurrence date in YYYY-MM-DD format
 */
export function generateEventUID(
  name: string,
  day: string,
  startTime: string,
  startDate: string
): string {
  const slug = `${name}-${day}-${startTime}-${startDate}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") // trim leading/trailing dashes
    .slice(0, 60);
  return `${slug}@commontools.app`;
}

/**
 * Legacy UID generator for backwards compatibility.
 * @deprecated Use generateEventUID(name, day, startTime, startDate) instead
 */
export function generateEventUIDLegacy(name: string, index: number = 0): string {
  const timestamp = Date.now();
  const nameSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30);
  return `${nameSlug}-${index}-${timestamp}@commontools`;
}

/**
 * Gets the first occurrence date for a weekly event.
 * Given a start date and target day of week, returns the first date
 * on or after startDate that falls on the target day.
 */
export function getFirstOccurrenceDate(
  startDate: string,
  targetDay: DayOfWeek
): string {
  const dayMap: Record<DayOfWeek, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const date = new Date(startDate + "T00:00:00");
  const currentDay = date.getDay();
  const targetDayNum = dayMap[targetDay];

  let daysToAdd = targetDayNum - currentDay;
  if (daysToAdd < 0) {
    daysToAdd += 7;
  }

  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().split("T")[0];
}

/**
 * Sanitizes a string for use in a filename.
 * Removes filesystem-unsafe characters and limits length.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "-") // Remove filesystem-unsafe chars
    .replace(/\s+/g, "-")          // Replace spaces with dashes
    .replace(/-+/g, "-")           // Collapse multiple dashes
    .replace(/^-|-$/g, "")         // Trim leading/trailing dashes
    .slice(0, 100);                // Limit length
}

