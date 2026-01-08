/// <cts-enable />
/**
 * LLM Tool Wrappers for Gmail/Calendar Write APIs
 *
 * These tools allow LLM agents to SUGGEST write operations, but never execute them.
 * The actual execution requires user confirmation through the respective UI patterns:
 * - gmail-sender.tsx
 * - gmail-label-manager.tsx
 * - calendar-event-manager.tsx
 *
 * Design principle: "Agents suggest, users confirm"
 *
 * Usage:
 * ```typescript
 * import {
 *   suggestEmailTool,
 *   suggestCalendarEventTool,
 *   suggestLabelChangeTool,
 * } from "./util/write-api-tools.ts";
 *
 * // Create tools bound to cells
 * const suggestEmail = suggestEmailTool(pendingEmailDraft);
 * const suggestEvent = suggestCalendarEventTool(pendingEventDraft);
 * const suggestLabels = suggestLabelChangeTool(pendingLabelOp);
 *
 * // Use in additionalTools for generateObject
 * additionalTools: {
 *   suggestEmail: {
 *     description: "Suggest an email to send. User must confirm before sending.",
 *     handler: suggestEmail,
 *   },
 *   suggestCalendarEvent: {
 *     description: "Suggest a calendar event to create. User must confirm.",
 *     handler: suggestEvent,
 *   },
 * }
 * ```
 */
import { Writable, handler, JSONSchema } from "commontools";

// =============================================================================
// EMAIL SUGGESTION TOOL
// =============================================================================

/**
 * Schema for the suggestEmail tool input.
 * LLM provides these fields, tool writes to pendingDraft cell.
 */
const SUGGEST_EMAIL_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    to: {
      type: "string",
      description: "Recipient email address (required)",
    },
    subject: {
      type: "string",
      description: "Email subject line (required)",
    },
    body: {
      type: "string",
      description: "Plain text email body (required)",
    },
    cc: {
      type: "string",
      description: "CC recipients (comma-separated, optional)",
    },
    bcc: {
      type: "string",
      description: "BCC recipients (comma-separated, optional)",
    },
    replyToMessageId: {
      type: "string",
      description: "Message ID to reply to for threading (optional)",
    },
    replyToThreadId: {
      type: "string",
      description: "Thread ID to reply to for threading (optional)",
    },
    result: { type: "object", asCell: true },
  },
  required: ["to", "subject", "body"],
};

const SUGGEST_EMAIL_STATE_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    pendingDraft: { type: "object", asCell: true },
  },
  required: ["pendingDraft"],
};

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyToMessageId?: string;
  replyToThreadId?: string;
}

/**
 * Creates a tool that suggests an email draft for user confirmation.
 *
 * The tool writes to a pendingDraft cell that the UI can display
 * for user review and confirmation before sending.
 *
 * @param pendingDraft - Cell to write the suggested email to
 * @returns Bound handler ready for use in additionalTools
 */
export function suggestEmailTool(pendingDraft: Writable<EmailDraft | null>) {
  return handler(
    SUGGEST_EMAIL_SCHEMA,
    SUGGEST_EMAIL_STATE_SCHEMA,
    (
      input: EmailDraft & { result?: Writable<any> },
      state: { pendingDraft: Writable<EmailDraft | null> },
    ) => {
      const draft: EmailDraft = {
        to: input.to,
        subject: input.subject,
        body: input.body,
        cc: input.cc || "",
        bcc: input.bcc || "",
        replyToMessageId: input.replyToMessageId || "",
        replyToThreadId: input.replyToThreadId || "",
      };

      state.pendingDraft.set(draft);
      console.log("[suggestEmailTool] Email draft suggested:", {
        to: draft.to,
        subject: draft.subject,
      });

      const result = {
        success: true,
        message: `Email draft prepared for user confirmation. To: ${draft.to}, Subject: "${draft.subject}"`,
        requiresConfirmation: true,
      };

      if (input.result) {
        input.result.set(result);
      }

      return result;
    },
  )({ pendingDraft });
}

// =============================================================================
// CALENDAR EVENT SUGGESTION TOOL
// =============================================================================

/**
 * Schema for the suggestCalendarEvent tool input.
 */
const SUGGEST_CALENDAR_EVENT_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Event title/summary (required)",
    },
    start: {
      type: "string",
      description:
        "Start datetime in ISO format or YYYY-MM-DDTHH:MM format (required)",
    },
    end: {
      type: "string",
      description:
        "End datetime in ISO format or YYYY-MM-DDTHH:MM format (required)",
    },
    description: {
      type: "string",
      description: "Event description (optional)",
    },
    location: {
      type: "string",
      description: "Event location (optional)",
    },
    attendees: {
      type: "string",
      description: "Comma-separated list of attendee email addresses (optional)",
    },
    calendarId: {
      type: "string",
      description:
        "Calendar ID to create event in (optional, defaults to 'primary')",
    },
    result: { type: "object", asCell: true },
  },
  required: ["summary", "start", "end"],
};

const SUGGEST_CALENDAR_EVENT_STATE_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    pendingEvent: { type: "object", asCell: true },
  },
  required: ["pendingEvent"],
};

export interface CalendarEventDraft {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendeesText?: string;
  calendarId?: string;
}

/**
 * Creates a tool that suggests a calendar event for user confirmation.
 *
 * The tool writes to a pendingEvent cell that the UI can display
 * for user review and confirmation before creating.
 *
 * @param pendingEvent - Cell to write the suggested event to
 * @returns Bound handler ready for use in additionalTools
 */
export function suggestCalendarEventTool(
  pendingEvent: Writable<CalendarEventDraft | null>,
) {
  return handler(
    SUGGEST_CALENDAR_EVENT_SCHEMA,
    SUGGEST_CALENDAR_EVENT_STATE_SCHEMA,
    (
      input: {
        summary: string;
        start: string;
        end: string;
        description?: string;
        location?: string;
        attendees?: string;
        calendarId?: string;
        result?: Writable<any>;
      },
      state: { pendingEvent: Writable<CalendarEventDraft | null> },
    ) => {
      const event: CalendarEventDraft = {
        summary: input.summary,
        start: input.start,
        end: input.end,
        description: input.description || "",
        location: input.location || "",
        attendeesText: input.attendees || "",
        calendarId: input.calendarId || "primary",
      };

      state.pendingEvent.set(event);
      console.log("[suggestCalendarEventTool] Event suggested:", {
        summary: event.summary,
        start: event.start,
        end: event.end,
      });

      const result = {
        success: true,
        message: `Calendar event prepared for user confirmation. "${event.summary}" from ${event.start} to ${event.end}`,
        requiresConfirmation: true,
      };

      if (input.result) {
        input.result.set(result);
      }

      return result;
    },
  )({ pendingEvent });
}

// =============================================================================
// LABEL CHANGE SUGGESTION TOOL
// =============================================================================

/**
 * Schema for the suggestLabelChange tool input.
 */
const SUGGEST_LABEL_CHANGE_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    messageIds: {
      type: "string",
      description:
        "Comma-separated list of Gmail message IDs to modify (required)",
    },
    addLabels: {
      type: "string",
      description:
        "Comma-separated list of label IDs to add (e.g., 'STARRED,Label_123')",
    },
    removeLabels: {
      type: "string",
      description:
        "Comma-separated list of label IDs to remove (e.g., 'UNREAD,INBOX')",
    },
    result: { type: "object", asCell: true },
  },
  required: ["messageIds"],
};

const SUGGEST_LABEL_CHANGE_STATE_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    pendingLabelOp: { type: "object", asCell: true },
  },
  required: ["pendingLabelOp"],
};

export interface LabelChangeDraft {
  messageIds: string[];
  labelsToAdd: string[];
  labelsToRemove: string[];
}

/**
 * Creates a tool that suggests label changes for user confirmation.
 *
 * The tool writes to a pendingLabelOp cell that the UI can display
 * for user review and confirmation before applying.
 *
 * @param pendingLabelOp - Cell to write the suggested label operation to
 * @returns Bound handler ready for use in additionalTools
 */
export function suggestLabelChangeTool(
  pendingLabelOp: Writable<LabelChangeDraft | null>,
) {
  return handler(
    SUGGEST_LABEL_CHANGE_SCHEMA,
    SUGGEST_LABEL_CHANGE_STATE_SCHEMA,
    (
      input: {
        messageIds: string;
        addLabels?: string;
        removeLabels?: string;
        result?: Writable<any>;
      },
      state: { pendingLabelOp: Writable<LabelChangeDraft | null> },
    ) => {
      const messageIds = input.messageIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      const labelsToAdd = input.addLabels
        ? input.addLabels
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : [];
      const labelsToRemove = input.removeLabels
        ? input.removeLabels
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : [];

      const op: LabelChangeDraft = {
        messageIds,
        labelsToAdd,
        labelsToRemove,
      };

      state.pendingLabelOp.set(op);
      console.log("[suggestLabelChangeTool] Label change suggested:", {
        messageCount: messageIds.length,
        addLabels: labelsToAdd,
        removeLabels: labelsToRemove,
      });

      const result = {
        success: true,
        message: `Label changes prepared for ${messageIds.length} message(s). Add: [${labelsToAdd.join(", ")}], Remove: [${labelsToRemove.join(", ")}]`,
        requiresConfirmation: true,
      };

      if (input.result) {
        input.result.set(result);
      }

      return result;
    },
  )({ pendingLabelOp });
}

// =============================================================================
// TOOL DESCRIPTIONS (for use in system prompts)
// =============================================================================

/**
 * Standard descriptions for the write API tools.
 * Use these when adding tools to generateObject.
 */
export const TOOL_DESCRIPTIONS = {
  suggestEmail: `Suggest an email to send. The email will NOT be sent automatically - user must review and confirm.
Parameters:
- to: Recipient email (required)
- subject: Email subject (required)
- body: Plain text body (required)
- cc: CC recipients (optional)
- bcc: BCC recipients (optional)
- replyToMessageId: For threading replies (optional)
- replyToThreadId: For threading replies (optional)

Returns: Confirmation that draft is ready for user review.`,

  suggestCalendarEvent: `Suggest a calendar event to create. The event will NOT be created automatically - user must review and confirm.
Parameters:
- summary: Event title (required)
- start: Start datetime in ISO or YYYY-MM-DDTHH:MM format (required)
- end: End datetime in ISO or YYYY-MM-DDTHH:MM format (required)
- description: Event description (optional)
- location: Event location (optional)
- attendees: Comma-separated attendee emails (optional)
- calendarId: Calendar ID, defaults to 'primary' (optional)

Returns: Confirmation that event is ready for user review.`,

  suggestLabelChange: `Suggest label changes for Gmail messages. Changes will NOT be applied automatically - user must review and confirm.
Parameters:
- messageIds: Comma-separated list of Gmail message IDs (required)
- addLabels: Comma-separated label IDs to add (optional)
- removeLabels: Comma-separated label IDs to remove (optional)

Common labels: STARRED, UNREAD, INBOX, IMPORTANT, SPAM, TRASH
Custom labels have IDs like 'Label_123'.

Returns: Confirmation that label changes are ready for user review.`,
};
