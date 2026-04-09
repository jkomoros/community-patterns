/**
 * Calendar Export Utility
 *
 * Reusable utility for exporting events to multiple calendar targets:
 * - Google Calendar (direct API with batch support)
 * - Apple Calendar (via outbox pattern)
 * - ICS file download (fallback for any calendar app)
 *
 * This module provides conversion functions and export helpers.
 * For the embeddable UI component, see calendar-export-ui.tsx.
 *
 * Usage:
 * ```typescript
 * import {
 *   convertToGoogleEvents,
 *   convertToAppleOutbox,
 *   convertToICS,
 *   exportToGoogle,
 * } from "./util/calendar-export.tsx";
 * ```
 */

import type { Writable } from "commonfabric";
import type { Auth } from "../../../../labs/packages/patterns/google/core/util/google-auth-manager.tsx";
// CalendarWriteClient import temporarily removed: labs's
// calendar-write-client.ts calls getPatternEnvironment() at module scope,
// which the new SES verifier rejects (only trusted builders may be invoked
// at module scope). Re-add once that labs file is patched upstream.
type BatchProgress = {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  percentComplete: number;
  currentEvent?: string;
};
import {
  dayToICalDay,
  generateEventUID,
  generateICS,
  getFirstOccurrenceDate,
  type ICalEvent,
  sanitizeFilename,
} from "./ical-generator.ts";
import type {
  CalendarOutboxEvent,
  DayOfWeek,
  ExportableEvent,
  ExportConfig,
  ExportProgressCallback,
  ExportResult,
  ExportTargetInfo,
  RecurrenceRule,
} from "../../../../labs/packages/patterns/google/core/util/calendar-export-types.ts";

// Re-export types for convenience
export type {
  CalendarOutboxEvent,
  ExportableEvent,
  ExportConfig,
  ExportProgress,
  ExportProgressCallback,
  ExportResult,
  ExportTarget,
  ExportTargetInfo,
} from "../../../../labs/packages/patterns/google/core/util/calendar-export-types.ts";

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_TO_RRULE: Record<DayOfWeek, string> = {
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sunday: "SU",
};

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

/**
 * Convert ExportableEvent time slots to Google Calendar events.
 * Each time slot becomes a separate recurring event.
 *
 * TODO: Return { events, skipped } instead of just events array.
 * Events without timeSlots or startDate/startTime/endTime are silently dropped.
 * Same applies to convertToAppleOutbox and convertToICS.
 */
export function convertToGoogleEvents(
  events: ExportableEvent[],
  dateRange: { startDate: string; endDate: string },
  _timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Array<{
  clientId: string;
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  isAllDay?: boolean;
  recurrence?: string[];
}> {
  const result: Array<{
    clientId: string;
    summary: string;
    start: string;
    end: string;
    description?: string;
    location?: string;
    attendees?: string[];
    isAllDay?: boolean;
    recurrence?: string[];
  }> = [];

  for (const event of events) {
    // Handle recurring events with time slots
    if (event.timeSlots && event.timeSlots.length > 0) {
      for (const slot of event.timeSlots) {
        // Calculate first occurrence date
        const firstDate = getFirstOccurrenceDate(
          dateRange.startDate,
          slot.day as DayOfWeek,
        );

        // Build datetime strings
        const startDateTime = `${firstDate}T${slot.startTime}:00`;
        const endDateTime = `${firstDate}T${slot.endTime}:00`;

        // Build RRULE
        const dayCode = DAY_TO_RRULE[slot.day as DayOfWeek];
        const untilDate = dateRange.endDate.replace(/-/g, "");
        const rrule =
          `RRULE:FREQ=WEEKLY;BYDAY=${dayCode};UNTIL=${untilDate}T235959Z`;

        result.push({
          clientId: `${event.id}-${slot.day}`,
          summary: event.title,
          start: startDateTime,
          end: endDateTime,
          description: event.description,
          location: event.location,
          attendees: event.attendees,
          recurrence: [rrule],
        });
      }
    } else if (event.startDate && event.startTime && event.endTime) {
      // Single event (non-recurring)
      const startDateTime = `${event.startDate}T${event.startTime}:00`;
      const endDateTime = `${event.startDate}T${event.endTime}:00`;

      result.push({
        clientId: event.id,
        summary: event.title,
        start: startDateTime,
        end: endDateTime,
        description: event.description,
        location: event.location,
        attendees: event.attendees,
        isAllDay: event.isAllDay,
      });
    }
  }

  return result;
}

/**
 * Convert ExportableEvent to Apple Calendar outbox format.
 */
export function convertToAppleOutbox(
  events: ExportableEvent[],
  calendarName: string,
  dateRange: { startDate: string; endDate: string },
): CalendarOutboxEvent[] {
  const result: CalendarOutboxEvent[] = [];

  for (const event of events) {
    // Handle recurring events with time slots
    if (event.timeSlots && event.timeSlots.length > 0) {
      for (const slot of event.timeSlots) {
        const firstDate = getFirstOccurrenceDate(
          dateRange.startDate,
          slot.day as DayOfWeek,
        );

        const dayCode = DAY_TO_RRULE[slot.day as DayOfWeek];
        const recurrence: RecurrenceRule = {
          frequency: "WEEKLY",
          byDay: dayCode,
          until: dateRange.endDate,
        };

        result.push({
          id: `${event.id}-${slot.day}`,
          title: event.title,
          calendarName,
          startDate: firstDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          location: event.location,
          notes: event.description,
          recurrence,
        });
      }
    } else if (event.startDate && event.startTime && event.endTime) {
      // Single event
      result.push({
        id: event.id,
        title: event.title,
        calendarName,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        notes: event.description,
      });
    }
  }

  return result;
}

/**
 * Convert ExportableEvent to ICS format string.
 */
export function convertToICS(
  events: ExportableEvent[],
  dateRange: { startDate: string; endDate: string },
  options: {
    calendarName?: string;
    timezone?: string;
  } = {},
): string {
  const timezone = options.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const icalEvents: ICalEvent[] = [];

  for (const event of events) {
    // Handle recurring events with time slots
    if (event.timeSlots && event.timeSlots.length > 0) {
      for (const slot of event.timeSlots) {
        const firstDate = getFirstOccurrenceDate(
          dateRange.startDate,
          slot.day as DayOfWeek,
        );

        const uid = generateEventUID(
          event.title,
          slot.day,
          slot.startTime,
          firstDate,
        );

        icalEvents.push({
          uid,
          summary: event.title,
          location: event.location,
          description: event.description,
          startDate: firstDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          timezone,
          rrule: {
            freq: "WEEKLY",
            byday: dayToICalDay(slot.day as DayOfWeek),
            until: dateRange.endDate,
          },
        });
      }
    } else if (event.startDate && event.startTime && event.endTime) {
      // Single event
      const uid = generateEventUID(
        event.title,
        "single",
        event.startTime,
        event.startDate,
      );

      icalEvents.push({
        uid,
        summary: event.title,
        location: event.location,
        description: event.description,
        startDate: event.startDate,
        startTime: event.startTime,
        endTime: event.endTime,
        timezone,
        allDay: event.isAllDay,
      });
    }
  }

  return generateICS(icalEvents, {
    calendarName: options.calendarName,
    timezone,
  });
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export events to Google Calendar.
 *
 * @param auth - Google auth cell
 * @param events - Events to export
 * @param config - Export configuration
 * @param onProgress - Progress callback
 * @returns Export result
 */
// deno-lint-ignore require-await
export async function exportToGoogle(
  _auth: Writable<Auth>,
  events: ExportableEvent[],
  config: ExportConfig,
  onProgress?: ExportProgressCallback,
): Promise<ExportResult> {
  // Convert to Google format
  const googleEvents = convertToGoogleEvents(events, config.dateRange);

  if (googleEvents.length === 0) {
    return {
      success: true,
      target: "google",
      message: "No events to export",
      timestamp: new Date().toISOString(),
      exportedCount: 0,
    };
  }

  // Report initial progress
  onProgress?.({
    phase: "preparing",
    total: googleEvents.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    percentComplete: 0,
  });

  // CalendarWriteClient is currently unavailable (see import comment above).
  // Returning a runtime failure is honest until labs patches the upstream
  // module-scope getPatternEnvironment() call.
  return {
    success: false,
    target: "google",
    message:
      "Google Calendar export is temporarily unavailable while labs's calendar-write-client.ts is being updated for the SES sandbox.",
    timestamp: new Date().toISOString(),
    exportedCount: 0,
  };
}

/**
 * Export events as ICS content.
 * Returns the ICS content and filename for use with <cf-file-download>.
 *
 * @param events - Events to export
 * @param config - Export configuration
 * @returns Export result with ICS content (use <cf-file-download> for actual download)
 */
export function exportToICS(
  events: ExportableEvent[],
  config: ExportConfig,
): ExportResult {
  const icsContent = convertToICS(events, config.dateRange, {
    calendarName: config.exportTitle || config.calendarName,
  });

  const filename = `${
    sanitizeFilename(
      config.icsFilenamePrefix || config.calendarName || "calendar",
    )
  }-${new Date().toISOString().split("T")[0]}.ics`;

  return {
    success: true,
    target: "ics",
    message: `ICS file ready: ${filename}`,
    timestamp: new Date().toISOString(),
    exportedCount: events.length,
    icsContent,
    icsFilename: filename,
  };
}

/**
 * Check which export targets are available.
 *
 * @param googleAuth - Google auth cell (optional)
 * @returns Array of available export targets with status
 */
export function getAvailableTargets(
  googleAuth?: Writable<Auth> | null,
): ExportTargetInfo[] {
  const targets: ExportTargetInfo[] = [];

  // Google Calendar - requires valid auth
  const hasGoogleAuth = !!googleAuth?.get()?.token;
  targets.push({
    id: "google",
    label: "Google Calendar",
    icon: "📅",
    available: hasGoogleAuth,
    unavailableReason: hasGoogleAuth
      ? undefined
      : "Sign in with Google to enable",
  });

  // Apple Calendar - always available via outbox
  // (actual sync requires CLI tool, but we can always add to outbox)
  targets.push({
    id: "apple",
    label: "Apple Calendar",
    icon: "🍎",
    available: true,
  });

  // ICS download - always available
  targets.push({
    id: "ics",
    label: "Download .ics",
    icon: "📥",
    available: true,
  });

  return targets;
}
