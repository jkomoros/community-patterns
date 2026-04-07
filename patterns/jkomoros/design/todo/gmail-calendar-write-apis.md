# Gmail/Calendar Write APIs Design

## Overview

Design for adding write operations to Gmail and Calendar with **pattern-level confirmation UI** that can serve as declassification gates when policies are implemented (patterns with verified SHA can be trusted).

## Current State

### Existing Read-Only Implementation
- **gmail-importer.tsx**: Full email fetching with incremental sync via History API
- **google-calendar-importer.tsx**: Calendar listing and event fetching
- **google-auth.tsx**: OAuth authentication with scope management
- **util/gmail-client.ts**: Shared API client with token refresh

### Current Scopes (Read-Only)
```typescript
const SCOPE_MAP = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
};
```

## Proposed Write Operations

### Gmail: Send Email
- **Scope**: `https://www.googleapis.com/auth/gmail.send`
  - More restrictive than `gmail.compose` (which also allows draft access)
  - OAuth consent shows "Send email on your behalf" (less alarming)
- **Endpoint**: `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
- **Request Format**: RFC 2822 MIME message encoded as base64url in `raw` field

### Calendar: Full CRUD + RSVPs
- **Scope**: `https://www.googleapis.com/auth/calendar.events`
- **Operations**:
  - **Create**: `POST /calendars/{calendarId}/events`
  - **Update**: `PATCH /calendars/{calendarId}/events/{eventId}`
  - **Delete**: `DELETE /calendars/{calendarId}/events/{eventId}`
  - **RSVP**: Update `attendees[].responseStatus` on event

---

## Security Design: Pattern-Level Confirmation

### Why Patterns as Declassification Gates?

1. **SHA Verification**: Patterns with a verified SHA can be trusted for declassification
2. **User-land flexibility**: No need to modify labs - patterns can be blessed by SHA
3. **Existing components**: Use ct-card, ct-button, ct-alert for confirmation UI
4. **Auditability**: Pattern source is versioned and auditable

### Core Principle
**User must explicitly see and confirm EXACTLY what will happen before any write operation.**

### Future Policy Integration
```typescript
// Conceptual policy - patterns with verified SHA can declassify
const policy = {
  declassification: {
    "secret": {
      trustedPatterns: [
        "gmail-sender.tsx@sha256:abc123...",
        "calendar-manager.tsx@sha256:def456...",
      ],
      requiresUserConfirmation: true,
    }
  }
};
```

---

## Pattern Designs

### 1. Gmail Sender Pattern

```tsx
// patterns/jkomoros/gmail-sender.tsx
/// <cts-enable />

import {
  Cell, cell, Default, derive, handler, ifElse,
  NAME, pattern, UI, wish
} from "commontools";
import { GmailSendClient } from "./util/gmail-send-client.ts";
import type { Auth } from "./google-auth.tsx";

type EmailDraft = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  // For thread replies
  replyToMessageId?: string;
  replyToThreadId?: string;
};

type SendResult = {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
};

interface Input {
  draft: Default<EmailDraft, { to: ""; subject: ""; body: "" }>;
}

/** Gmail email sender with confirmation. #gmailSender */
export default pattern<Input>(({ draft }) => {
  // Auth via wish
  const authCharm = wish<{ auth: Auth }>("#googleAuth");
  const auth = derive(authCharm, c => c?.auth);
  const senderEmail = derive(auth, a => a?.user?.email || "");
  const hasAuth = derive(auth, a => !!a?.token);

  // Confirmation state
  const showConfirmation = cell(false);
  const sending = cell(false);
  const result = cell<SendResult | null>(null);

  // Handlers
  const prepareToSend = handler<unknown, { showConfirmation: Cell<boolean> }>(
    (_, { showConfirmation }) => {
      showConfirmation.set(true);
    }
  );

  const cancelSend = handler<unknown, { showConfirmation: Cell<boolean> }>(
    (_, { showConfirmation }) => {
      showConfirmation.set(false);
    }
  );

  const confirmAndSend = handler<
    unknown,
    { draft: Cell<EmailDraft>; auth: Cell<Auth>; sending: Cell<boolean>;
      result: Cell<SendResult | null>; showConfirmation: Cell<boolean> }
  >(
    async (_, { draft, auth, sending, result, showConfirmation }) => {
      sending.set(true);
      result.set(null);

      try {
        const client = new GmailSendClient(auth);
        const email = draft.get();
        const response = await client.sendEmail(email);

        result.set({
          success: true,
          messageId: response.id,
          threadId: response.threadId,
        });
        showConfirmation.set(false);
        // Clear draft on success
        draft.set({ to: "", subject: "", body: "" });
      } catch (error) {
        result.set({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        sending.set(false);
      }
    }
  );

  return {
    [NAME]: "Gmail Sender",
    [UI]: (
      <ct-screen>
        <div slot="header">
          <ct-heading level={3}>Send Email</ct-heading>
        </div>

        <ct-vscroll flex showScrollbar>
          <ct-vstack padding="6" gap="4">
            {/* Auth status */}
            {ifElse(
              hasAuth,
              <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #d1fae5; border-radius: 6px;">
                <span>Sending as: <strong>{senderEmail}</strong></span>
              </div>,
              <ct-alert variant="warning">
                <span slot="title">Not authenticated</span>
                <span slot="description">
                  Please create and favorite a Google Auth charm with Gmail Send permission.
                </span>
              </ct-alert>
            )}

            {/* Compose form */}
            <ct-vstack gap="3">
              <div>
                <ct-label>To</ct-label>
                <ct-input $value={draft.to} placeholder="recipient@example.com" />
              </div>
              <div>
                <ct-label>CC (optional)</ct-label>
                <ct-input $value={draft.cc} placeholder="cc@example.com" />
              </div>
              <div>
                <ct-label>Subject</ct-label>
                <ct-input $value={draft.subject} placeholder="Email subject" />
              </div>
              <div>
                <ct-label>Message</ct-label>
                <ct-textarea
                  $value={draft.body}
                  placeholder="Write your message..."
                  style="min-height: 200px;"
                />
              </div>

              <ct-button
                variant="primary"
                onClick={prepareToSend({ showConfirmation })}
                disabled={derive(
                  { hasAuth, draft, sending },
                  ({ hasAuth, draft, sending }) =>
                    !hasAuth || !draft.to || !draft.subject || !draft.body || sending
                )}
              >
                Review & Send
              </ct-button>
            </ct-vstack>

            {/* Result display */}
            {ifElse(
              derive(result, r => r?.success === true),
              <ct-alert variant="success" dismissible>
                <span slot="title">Email sent!</span>
                <span slot="description">Message ID: {derive(result, r => r?.messageId)}</span>
              </ct-alert>,
              null
            )}
            {ifElse(
              derive(result, r => r?.success === false),
              <ct-alert variant="destructive" dismissible>
                <span slot="title">Failed to send</span>
                <span slot="description">{derive(result, r => r?.error)}</span>
              </ct-alert>,
              null
            )}

            {/* CONFIRMATION DIALOG */}
            {ifElse(
              showConfirmation,
              <ct-card style="border: 2px solid #dc2626; margin-top: 16px;">
                <div slot="header" style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 20px;">📧</span>
                  <h3 style="margin: 0; color: #dc2626;">Confirm Send Email</h3>
                </div>

                <div slot="content">
                  <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <div style="margin-bottom: 8px;">
                      <strong style="color: #6b7280; min-width: 60px; display: inline-block;">From:</strong>
                      {senderEmail}
                    </div>
                    <div style="margin-bottom: 8px;">
                      <strong style="color: #6b7280; min-width: 60px; display: inline-block;">To:</strong>
                      <span style="font-weight: 500;">{draft.to}</span>
                    </div>
                    {ifElse(
                      derive(draft.cc, cc => !!cc),
                      <div style="margin-bottom: 8px;">
                        <strong style="color: #6b7280; min-width: 60px; display: inline-block;">CC:</strong>
                        {draft.cc}
                      </div>,
                      null
                    )}
                    <div style="margin-bottom: 12px;">
                      <strong style="color: #6b7280; min-width: 60px; display: inline-block;">Subject:</strong>
                      <span style="font-weight: 500;">{draft.subject}</span>
                    </div>
                    <div style="border-top: 1px solid #e5e7eb; padding-top: 12px;">
                      <strong style="color: #6b7280; display: block; margin-bottom: 8px;">Message:</strong>
                      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; max-height: 200px; overflow-y: auto; white-space: pre-wrap;">
                        {draft.body}
                      </div>
                    </div>
                  </div>

                  <ct-alert variant="warning">
                    <span slot="title">This will send a real email</span>
                    <span slot="description">
                      The recipient will receive this email from your Google account.
                      This action cannot be undone.
                    </span>
                  </ct-alert>
                </div>

                <div slot="footer" style="display: flex; gap: 12px; justify-content: flex-end;">
                  <ct-button
                    variant="outline"
                    onClick={cancelSend({ showConfirmation })}
                    disabled={sending}
                  >
                    Cancel
                  </ct-button>
                  <ct-button
                    variant="destructive"
                    onClick={confirmAndSend({ draft, auth, sending, result, showConfirmation })}
                    disabled={sending}
                  >
                    {ifElse(sending, "Sending...", "Send Email")}
                  </ct-button>
                </div>
              </ct-card>,
              null
            )}
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
    draft,
    result,
  };
});
```

### 2. Calendar Event Manager Pattern

```tsx
// patterns/jkomoros/calendar-event-manager.tsx
/// <cts-enable />

import {
  Cell, cell, Default, derive, handler, ifElse,
  NAME, pattern, UI, wish
} from "commontools";
import { CalendarWriteClient } from "./util/calendar-write-client.ts";
import type { Auth } from "./google-auth.tsx";
import type { Calendar, CalendarEvent } from "./google-calendar-importer.tsx";

type CalendarOperation = "create" | "update" | "delete" | "rsvp";
type RSVPStatus = "accepted" | "declined" | "tentative";

type EventDraft = {
  summary: string;
  start: string;  // ISO datetime or YYYY-MM-DD for all-day
  end: string;
  calendarId: string;
  calendarName?: string;
  description?: string;
  location?: string;
  attendees?: string[];  // Email addresses
  isAllDay?: boolean;
};

type PendingOperation = {
  operation: CalendarOperation;
  event: EventDraft;
  existingEventId?: string;  // For update/delete
  rsvpStatus?: RSVPStatus;   // For RSVP
};

type OperationResult = {
  success: boolean;
  operation: CalendarOperation;
  eventId?: string;
  error?: string;
};

interface Input {
  // Pre-populated event (e.g., from calendar importer for edit/delete)
  selectedEvent?: Default<CalendarEvent | null, null>;
}

/** Calendar event manager with create/update/delete/RSVP. #calendarManager */
export default pattern<Input>(({ selectedEvent }) => {
  // Auth via wish
  const authCharm = wish<{ auth: Auth }>("#googleAuth");
  const auth = derive(authCharm, c => c?.auth);
  const userEmail = derive(auth, a => a?.user?.email || "");
  const hasAuth = derive(auth, a => !!a?.token);

  // Calendars list (fetched on load)
  const calendars = cell<Calendar[]>([]);

  // Event draft
  const draft = cell<EventDraft>({
    summary: "",
    start: "",
    end: "",
    calendarId: "primary",
    description: "",
    location: "",
    attendees: [],
  });

  // Confirmation state
  const pendingOp = cell<PendingOperation | null>(null);
  const processing = cell(false);
  const result = cell<OperationResult | null>(null);

  // Format datetime for display
  const formatDateTime = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // Get warning message based on operation
  const getWarning = (op: PendingOperation) => {
    const hasAttendees = op.event.attendees && op.event.attendees.length > 0;
    switch (op.operation) {
      case "create":
        return {
          title: "This will create a real calendar event",
          desc: hasAttendees
            ? `Invitations will be sent to ${op.event.attendees!.length} attendee(s).`
            : "The event will appear on your Google Calendar."
        };
      case "update":
        return {
          title: "This will update the calendar event",
          desc: hasAttendees
            ? "Attendees will be notified of the changes."
            : "The event will be modified on your calendar."
        };
      case "delete":
        return {
          title: "This will permanently delete the event",
          desc: hasAttendees
            ? "Attendees will be notified of the cancellation."
            : "This action cannot be undone."
        };
      case "rsvp":
        return {
          title: `You are responding "${op.rsvpStatus}"`,
          desc: "The organizer will be notified of your response."
        };
    }
  };

  // Handlers
  const prepareOperation = handler<
    { operation: CalendarOperation; rsvpStatus?: RSVPStatus },
    { draft: Cell<EventDraft>; pendingOp: Cell<PendingOperation | null>; selectedEvent: Cell<CalendarEvent | null> }
  >(
    ({ operation, rsvpStatus }, { draft, pendingOp, selectedEvent }) => {
      const event = draft.get();
      const existing = selectedEvent.get();
      pendingOp.set({
        operation,
        event,
        existingEventId: existing?.id,
        rsvpStatus,
      });
    }
  );

  const cancelOperation = handler<unknown, { pendingOp: Cell<PendingOperation | null> }>(
    (_, { pendingOp }) => {
      pendingOp.set(null);
    }
  );

  const confirmOperation = handler<
    unknown,
    { pendingOp: Cell<PendingOperation | null>; auth: Cell<Auth>;
      processing: Cell<boolean>; result: Cell<OperationResult | null>;
      draft: Cell<EventDraft> }
  >(
    async (_, { pendingOp, auth, processing, result, draft }) => {
      const op = pendingOp.get();
      if (!op) return;

      processing.set(true);
      result.set(null);

      try {
        const client = new CalendarWriteClient(auth);
        let eventId: string | undefined;

        switch (op.operation) {
          case "create": {
            const created = await client.createEvent({
              calendarId: op.event.calendarId,
              summary: op.event.summary,
              start: op.event.start,
              end: op.event.end,
              description: op.event.description,
              location: op.event.location,
              attendees: op.event.attendees,
            });
            eventId = created.id;
            break;
          }
          case "update": {
            const updated = await client.updateEvent(
              op.event.calendarId,
              op.existingEventId!,
              {
                summary: op.event.summary,
                start: op.event.start,
                end: op.event.end,
                description: op.event.description,
                location: op.event.location,
                attendees: op.event.attendees,
              }
            );
            eventId = updated.id;
            break;
          }
          case "delete": {
            await client.deleteEvent(op.event.calendarId, op.existingEventId!);
            break;
          }
          case "rsvp": {
            const rsvped = await client.rsvpToEvent(
              op.event.calendarId,
              op.existingEventId!,
              op.rsvpStatus!
            );
            eventId = rsvped.id;
            break;
          }
        }

        result.set({ success: true, operation: op.operation, eventId });
        pendingOp.set(null);

        // Clear draft on create success
        if (op.operation === "create") {
          draft.set({
            summary: "", start: "", end: "", calendarId: "primary",
            description: "", location: "", attendees: []
          });
        }
      } catch (error) {
        result.set({
          success: false,
          operation: op.operation,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        processing.set(false);
      }
    }
  );

  return {
    [NAME]: "Calendar Manager",
    [UI]: (
      <ct-screen>
        <div slot="header">
          <ct-heading level={3}>Calendar Event Manager</ct-heading>
        </div>

        <ct-vscroll flex showScrollbar>
          <ct-vstack padding="6" gap="4">
            {/* Auth status */}
            {ifElse(
              hasAuth,
              <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #d1fae5; border-radius: 6px;">
                <span>Managing calendar for: <strong>{userEmail}</strong></span>
              </div>,
              <ct-alert variant="warning">
                <span slot="title">Not authenticated</span>
                <span slot="description">
                  Please create and favorite a Google Auth charm with Calendar Write permission.
                </span>
              </ct-alert>
            )}

            {/* Event form */}
            <ct-vstack gap="3">
              <div>
                <ct-label>Event Title</ct-label>
                <ct-input $value={draft.summary} placeholder="Meeting with team" />
              </div>
              <ct-hstack gap="3">
                <div style="flex: 1;">
                  <ct-label>Start</ct-label>
                  <ct-input type="datetime-local" $value={draft.start} />
                </div>
                <div style="flex: 1;">
                  <ct-label>End</ct-label>
                  <ct-input type="datetime-local" $value={draft.end} />
                </div>
              </ct-hstack>
              <div>
                <ct-label>Location (optional)</ct-label>
                <ct-input $value={draft.location} placeholder="Conference Room A" />
              </div>
              <div>
                <ct-label>Description (optional)</ct-label>
                <ct-textarea $value={draft.description} placeholder="Event details..." />
              </div>
              <div>
                <ct-label>Attendees (comma-separated emails)</ct-label>
                <ct-input
                  value={derive(draft.attendees, a => (a || []).join(", "))}
                  onchange={(e: any) => {
                    const emails = e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean);
                    draft.update({ attendees: emails });
                  }}
                  placeholder="alice@example.com, bob@example.com"
                />
              </div>

              <ct-hstack gap="3">
                <ct-button
                  variant="primary"
                  onClick={prepareOperation({ operation: "create" }, { draft, pendingOp, selectedEvent })}
                  disabled={derive(
                    { hasAuth, draft, processing },
                    ({ hasAuth, draft, processing }) =>
                      !hasAuth || !draft.summary || !draft.start || !draft.end || processing
                  )}
                >
                  Create Event
                </ct-button>
              </ct-hstack>
            </ct-vstack>

            {/* Result display */}
            {ifElse(
              derive(result, r => r?.success === true),
              <ct-alert variant="success" dismissible>
                <span slot="title">
                  {derive(result, r => {
                    switch (r?.operation) {
                      case "create": return "Event created!";
                      case "update": return "Event updated!";
                      case "delete": return "Event deleted!";
                      case "rsvp": return "RSVP sent!";
                      default: return "Success!";
                    }
                  })}
                </span>
              </ct-alert>,
              null
            )}
            {ifElse(
              derive(result, r => r?.success === false),
              <ct-alert variant="destructive" dismissible>
                <span slot="title">Operation failed</span>
                <span slot="description">{derive(result, r => r?.error)}</span>
              </ct-alert>,
              null
            )}

            {/* CONFIRMATION DIALOG */}
            {ifElse(
              derive(pendingOp, op => op !== null),
              derive(pendingOp, op => {
                if (!op) return null;
                const warning = getWarning(op);
                const isDelete = op.operation === "delete";
                const borderColor = isDelete ? "#dc2626" : "#2563eb";
                const icon = isDelete ? "🗑️" : op.operation === "rsvp" ? "📬" : "📅";

                return (
                  <ct-card style={`border: 2px solid ${borderColor}; margin-top: 16px;`}>
                    <div slot="header" style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 20px;">{icon}</span>
                      <h3 style={`margin: 0; color: ${borderColor};`}>
                        {op.operation === "create" ? "Create Event" :
                         op.operation === "update" ? "Update Event" :
                         op.operation === "delete" ? "Delete Event" : "RSVP to Event"}
                      </h3>
                    </div>

                    <div slot="content">
                      <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                        <div style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">
                          {op.event.summary}
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #4b5563;">
                          <span>🕐</span>
                          <span>{formatDateTime(op.event.start)} - {formatDateTime(op.event.end)}</span>
                        </div>
                        {op.event.location && (
                          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #4b5563;">
                            <span>📍</span>
                            <span>{op.event.location}</span>
                          </div>
                        )}
                        {op.event.attendees && op.event.attendees.length > 0 && (
                          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                            <div style="display: flex; align-items: center; gap: 8px; font-weight: 500; margin-bottom: 8px;">
                              <span>👥</span>
                              <span>Attendees ({op.event.attendees.length})</span>
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                              {op.event.attendees.map(email => (
                                <span style="background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 4px 10px; font-size: 13px;">
                                  {email}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {op.operation === "rsvp" && op.rsvpStatus && (
                          <div style={`margin-top: 12px; padding: 8px 12px; border-radius: 6px; text-align: center; background: ${
                            op.rsvpStatus === "accepted" ? "#d1fae5" :
                            op.rsvpStatus === "declined" ? "#fee2e2" : "#fef3c7"
                          };`}>
                            Your response: <strong>{op.rsvpStatus}</strong>
                          </div>
                        )}
                      </div>

                      <ct-alert variant={isDelete ? "destructive" : "warning"}>
                        <span slot="title">{warning.title}</span>
                        <span slot="description">{warning.desc}</span>
                      </ct-alert>
                    </div>

                    <div slot="footer" style="display: flex; gap: 12px; justify-content: flex-end;">
                      <ct-button
                        variant="outline"
                        onClick={cancelOperation({ pendingOp })}
                        disabled={processing}
                      >
                        Cancel
                      </ct-button>
                      <ct-button
                        variant={isDelete ? "destructive" : "primary"}
                        onClick={confirmOperation({ pendingOp, auth, processing, result, draft })}
                        disabled={processing}
                      >
                        {ifElse(processing, "Processing...",
                          op.operation === "create" ? "Create Event" :
                          op.operation === "update" ? "Update Event" :
                          op.operation === "delete" ? "Delete Event" : "Send RSVP"
                        )}
                      </ct-button>
                    </div>
                  </ct-card>
                );
              }),
              null
            )}
          </ct-vstack>
        </ct-vscroll>
      </ct-screen>
    ),
    draft,
    result,
    calendars,
  };
});
```

---

## API Clients

### Gmail Send Client

```typescript
// util/gmail-send-client.ts

import { Cell, getRecipeEnvironment } from "commontools";
import type { Auth } from "../google-auth.tsx";

const env = getRecipeEnvironment();

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyToMessageId?: string;
  replyToThreadId?: string;
}

export interface SendEmailResult {
  id: string;
  threadId: string;
  labelIds: string[];
}

export class GmailSendClient {
  private auth: Cell<Auth>;
  private debugMode: boolean;

  constructor(auth: Cell<Auth>, debugMode = false) {
    this.auth = auth;
    this.debugMode = debugMode;
  }

  /**
   * Send an email via Gmail API.
   * Constructs RFC 2822 MIME message and encodes as base64url.
   */
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const token = this.auth.get().token;
    if (!token) throw new Error("No authorization token");

    // Build MIME message
    const messageParts: string[] = [];

    // Headers
    messageParts.push(`To: ${params.to}`);
    if (params.cc) messageParts.push(`Cc: ${params.cc}`);
    if (params.bcc) messageParts.push(`Bcc: ${params.bcc}`);
    messageParts.push(`Subject: ${params.subject}`);
    messageParts.push('Content-Type: text/plain; charset="UTF-8"');
    messageParts.push('MIME-Version: 1.0');

    // Thread reply headers
    if (params.replyToMessageId) {
      messageParts.push(`In-Reply-To: ${params.replyToMessageId}`);
      messageParts.push(`References: ${params.replyToMessageId}`);
    }

    // Empty line between headers and body
    messageParts.push('');
    messageParts.push(params.body);

    const message = messageParts.join('\r\n');

    // Base64url encode
    const encoded = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Build request body
    const requestBody: Record<string, string> = { raw: encoded };
    if (params.replyToThreadId) {
      requestBody.threadId = params.replyToThreadId;
    }

    if (this.debugMode) {
      console.log("[GmailSendClient] Sending email:", {
        to: params.to,
        subject: params.subject,
        bodyLength: params.body.length,
      });
    }

    const res = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(
        `Gmail API error: ${res.status} ${error.error?.message || res.statusText}`
      );
    }

    return await res.json();
  }

  /**
   * Refresh auth token if needed.
   */
  private async refreshAuth(): Promise<void> {
    const refreshToken = this.auth.get().refreshToken;
    if (!refreshToken) throw new Error("No refresh token");

    const res = await fetch(
      new URL("/api/integrations/google-oauth/refresh", env.apiUrl),
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }
    );

    if (!res.ok) throw new Error("Token refresh failed");

    const json = await res.json();
    this.auth.update(json.tokenInfo);
  }
}
```

### Calendar Write Client

```typescript
// util/calendar-write-client.ts

import { Cell, getRecipeEnvironment } from "commontools";
import type { Auth } from "../google-auth.tsx";
import type { CalendarEvent } from "../google-calendar-importer.tsx";

const env = getRecipeEnvironment();

export interface CreateEventParams {
  calendarId: string;
  summary: string;
  start: string | Date;
  end: string | Date;
  description?: string;
  location?: string;
  attendees?: string[];
  sendUpdates?: "all" | "externalOnly" | "none";
}

export interface UpdateEventParams {
  summary?: string;
  start?: string | Date;
  end?: string | Date;
  description?: string;
  location?: string;
  attendees?: string[];
}

export class CalendarWriteClient {
  private auth: Cell<Auth>;
  private debugMode: boolean;

  constructor(auth: Cell<Auth>, debugMode = false) {
    this.auth = auth;
    this.debugMode = debugMode;
  }

  private formatDateTime(dt: string | Date): { dateTime: string; timeZone: string } {
    const date = typeof dt === 'string' ? new Date(dt) : dt;
    return {
      dateTime: date.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /**
   * Create a new calendar event.
   */
  async createEvent(params: CreateEventParams): Promise<CalendarEvent> {
    const token = this.auth.get().token;
    if (!token) throw new Error("No authorization token");

    const body: Record<string, any> = {
      summary: params.summary,
      start: this.formatDateTime(params.start),
      end: this.formatDateTime(params.end),
    };

    if (params.description) body.description = params.description;
    if (params.location) body.location = params.location;
    if (params.attendees?.length) {
      body.attendees = params.attendees.map(email => ({ email }));
    }

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(params.calendarId)}/events`
    );
    if (params.sendUpdates) {
      url.searchParams.set('sendUpdates', params.sendUpdates);
    }

    if (this.debugMode) {
      console.log("[CalendarWriteClient] Creating event:", body);
    }

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(
        `Calendar API error: ${res.status} ${error.error?.message || res.statusText}`
      );
    }

    return await res.json();
  }

  /**
   * Update an existing calendar event.
   */
  async updateEvent(
    calendarId: string,
    eventId: string,
    params: UpdateEventParams,
    sendUpdates: "all" | "externalOnly" | "none" = "all"
  ): Promise<CalendarEvent> {
    const token = this.auth.get().token;
    if (!token) throw new Error("No authorization token");

    const body: Record<string, any> = {};
    if (params.summary !== undefined) body.summary = params.summary;
    if (params.description !== undefined) body.description = params.description;
    if (params.location !== undefined) body.location = params.location;
    if (params.start !== undefined) body.start = this.formatDateTime(params.start);
    if (params.end !== undefined) body.end = this.formatDateTime(params.end);
    if (params.attendees !== undefined) {
      body.attendees = params.attendees.map(email => ({ email }));
    }

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    );
    url.searchParams.set('sendUpdates', sendUpdates);

    if (this.debugMode) {
      console.log("[CalendarWriteClient] Updating event:", eventId, body);
    }

    const res = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(
        `Calendar API error: ${res.status} ${error.error?.message || res.statusText}`
      );
    }

    return await res.json();
  }

  /**
   * Delete a calendar event.
   */
  async deleteEvent(
    calendarId: string,
    eventId: string,
    sendUpdates: "all" | "externalOnly" | "none" = "all"
  ): Promise<void> {
    const token = this.auth.get().token;
    if (!token) throw new Error("No authorization token");

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    );
    url.searchParams.set('sendUpdates', sendUpdates);

    if (this.debugMode) {
      console.log("[CalendarWriteClient] Deleting event:", eventId);
    }

    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok && res.status !== 204) {
      const error = await res.json().catch(() => ({}));
      throw new Error(
        `Calendar API error: ${res.status} ${error.error?.message || res.statusText}`
      );
    }
  }

  /**
   * RSVP to a calendar event (update own attendee status).
   */
  async rsvpToEvent(
    calendarId: string,
    eventId: string,
    status: "accepted" | "declined" | "tentative"
  ): Promise<CalendarEvent> {
    const token = this.auth.get().token;
    if (!token) throw new Error("No authorization token");

    const userEmail = this.auth.get().user?.email;
    if (!userEmail) throw new Error("No user email for RSVP");

    // First, get the current event to find attendee list
    const getUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    );

    const getRes = await fetch(getUrl.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!getRes.ok) {
      throw new Error(`Failed to fetch event: ${getRes.status}`);
    }

    const event = await getRes.json();

    // Update own attendee status
    const attendees = (event.attendees || []).map((a: any) => {
      if (a.email.toLowerCase() === userEmail.toLowerCase()) {
        return { ...a, responseStatus: status };
      }
      return a;
    });

    // Patch the event
    return this.updateEvent(calendarId, eventId, { attendees: attendees.map((a: any) => a.email) });
  }
}
```

---

## Implementation Plan

### Phase 1: Auth Scope Extension
1. [ ] Add `gmailSend` scope to google-auth.tsx SCOPE_MAP
2. [ ] Add `calendarWrite` scope (calendar.events)
3. [ ] Update UI to show new scope options

### Phase 2: API Clients
1. [ ] Create `util/gmail-send-client.ts`
2. [ ] Create `util/calendar-write-client.ts` with full CRUD + RSVP
3. [ ] Test clients with manual API calls

### Phase 3: Patterns
1. [ ] Create `gmail-sender.tsx` with confirmation UI
2. [ ] Create `calendar-event-manager.tsx` with CRUD + RSVP
3. [ ] Test with real accounts

### Phase 4: Integration
1. [ ] Add LLM tool wrappers (suggestEmail, suggestEvent)
2. [ ] Test agent integration (agents suggest, users confirm)

---

## Open Questions

1. **Recurring events**: Support RRULE? (Complex - Phase 2)

2. **Attachments**: Gmail attachments via multipart MIME? (Phase 2)

3. **Thread replies**: Full thread context UI for email replies?

4. **Calendar selection**: Dropdown to pick which calendar to use?

---

## References

- [Gmail API Send Guide](https://developers.google.com/gmail/api/guides/sending)
- [Calendar Events API](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [Existing google-auth.tsx](../google-auth.tsx)
- [Existing gmail-client.ts](../util/gmail-client.ts)
