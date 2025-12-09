/// <cts-enable />
/**
 * Calendar Viewer
 *
 * View your Calendar events synced via apple-sync CLI.
 * Events are stored in the `events` input cell.
 *
 * To sync events, run:
 *   ./tools/apple-sync.ts calendar
 */
import {
  cell,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  Cell,
} from "commontools";

type CFC<T, C extends string> = T;
type Confidential<T> = CFC<T, "confidential">;

/**
 * A calendar event
 */
export type CalendarEvent = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
  notes: string | null;
  calendarName: string;
  isAllDay: boolean;
};

// Format a date for display
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// Format time for display
function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Get relative date label
function getRelativeLabel(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(date);
    eventDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1 && diffDays < 7) return formatDate(dateStr);
    return formatDate(dateStr);
  } catch {
    return dateStr;
  }
}

// Group events by date
function groupEventsByDate(
  events: CalendarEvent[]
): Map<string, CalendarEvent[]> {
  const byDate = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    if (!evt || !evt.startDate) continue;
    const dateKey = new Date(evt.startDate).toDateString();
    const existing = byDate.get(dateKey) || [];
    existing.push(evt);
    byDate.set(dateKey, existing);
  }
  return byDate;
}

// Calendar color based on name
function getCalendarColor(calendarName: string): string {
  const colors: Record<string, string> = {
    Work: "#007AFF",
    Personal: "#34C759",
    Family: "#FF9500",
    Health: "#FF2D55",
    Home: "#5856D6",
  };
  return colors[calendarName] || "#8E8E93";
}

// Handler to select an event
const selectEvent = handler<
  unknown,
  { eventId: string; selectedEventId: Cell<string | null> }
>((_, { eventId, selectedEventId }) => {
  selectedEventId.set(eventId);
});

// Handler to toggle calendar visibility
const toggleCalendar = handler<
  unknown,
  { calendarName: string; hiddenCalendars: Cell<string[]> }
>((_, { calendarName, hiddenCalendars }) => {
  const current = hiddenCalendars.get() || [];
  if (current.includes(calendarName)) {
    hiddenCalendars.set(current.filter((c) => c !== calendarName));
  } else {
    hiddenCalendars.set([...current, calendarName]);
  }
});

// Handler to go back to event list
const backToList = handler<unknown, { selectedEventId: Cell<string | null> }>(
  (_, { selectedEventId }) => {
    selectedEventId.set(null);
  }
);

export default pattern<{
  events: Default<Confidential<CalendarEvent[]>, []>;
}>(({ events }) => {
  const selectedEventId = cell<string | null>(null);
  const hiddenCalendars = cell<string[]>([]);

  const eventCount = derive(events, (evts: CalendarEvent[]) => evts?.length ?? 0);

  // Extract unique calendar names for the filter bar
  const uniqueCalendars = derive(events, (evts: CalendarEvent[]) => {
    const names = new Set<string>();
    for (const evt of evts || []) {
      if (evt?.calendarName) names.add(evt.calendarName);
    }
    return Array.from(names).sort();
  });

  // Get events grouped by date, filtered by hidden calendars
  const eventsByDate = derive(
    { events, hiddenCalendars },
    ({
      events,
      hiddenCalendars,
    }: {
      events: CalendarEvent[];
      hiddenCalendars: string[];
    }) => {
      const hidden = hiddenCalendars || [];
      const filtered = (events || []).filter(
        (evt) => evt && !hidden.includes(evt.calendarName)
      );
      const byDate = groupEventsByDate(filtered);
      const groups: Array<{
        date: string;
        label: string;
        events: CalendarEvent[];
      }> = [];

      for (const [dateKey, dateEvents] of byDate) {
        // Sort events within the day by start time
        dateEvents.sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );
        groups.push({
          date: dateKey,
          label: getRelativeLabel(dateEvents[0].startDate),
          events: dateEvents,
        });
      }

      // Sort groups by date
      groups.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      return groups;
    }
  );

  // Get selected event details
  const selectedEvent = derive(
    { events, selectedEventId },
    ({
      events,
      selectedEventId,
    }: {
      events: CalendarEvent[];
      selectedEventId: string | null;
    }) => {
      if (!selectedEventId || !events) return null;
      return events.find((e: CalendarEvent) => e && e.id === selectedEventId) || null;
    }
  );

  return {
    [NAME]: derive(eventCount, (count: number) => `Calendar (${count} events)`),
    [UI]: (
      <ct-screen
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f5f5f5",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#fff",
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {ifElse(
            derive(selectedEventId, (id: string | null) => id !== null),
            <button
              onClick={backToList({ selectedEventId })}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: "18px",
                padding: "4px 8px",
              }}
            >
              Back
            </button>,
            <span style={{ fontSize: "24px" }}>Calendar</span>
          )}
        </div>

        {/* Calendar Filter Bar */}
        {ifElse(
          derive(eventCount, (c: number) => c > 0),
          <div
            style={{
              padding: "8px 16px",
              backgroundColor: "#fff",
              borderBottom: "1px solid #e0e0e0",
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            {derive(
              { uniqueCalendars, hiddenCalendars },
              ({
                uniqueCalendars,
                hiddenCalendars,
              }: {
                uniqueCalendars: string[];
                hiddenCalendars: string[];
              }) =>
                (uniqueCalendars || []).map((name: string) => {
                  const isHidden = (hiddenCalendars || []).includes(name);
                  const color = getCalendarColor(name);
                  return (
                    <button
                      onClick={toggleCalendar({ calendarName: name, hiddenCalendars })}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "16px",
                        border: "1px solid #ddd",
                        backgroundColor: isHidden ? "#f5f5f5" : "#fff",
                        opacity: isHidden ? 0.5 : 1,
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "4px",
                          backgroundColor: color,
                        }}
                      />
                      {name}
                    </button>
                  );
                })
            )}
          </div>,
          null
        )}

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {ifElse(
            derive(eventCount, (c: number) => c === 0),
            // Empty state
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#666",
                padding: "20px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                Calendar
              </div>
              <div
                style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "8px" }}
              >
                No Events Yet
              </div>
              <div style={{ fontSize: "14px", maxWidth: "300px" }}>
                Run the apple-sync CLI to import your calendar events:
                <pre
                  style={{
                    backgroundColor: "#e0e0e0",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    marginTop: "12px",
                    fontSize: "12px",
                  }}
                >
                  ./tools/apple-sync.ts calendar
                </pre>
              </div>
            </div>,
            // Has events
            ifElse(
              derive(selectedEventId, (id: string | null) => id === null),
              // Event list view (grouped by date)
              <div>
                {derive(eventsByDate, (groups) =>
                  groups.map((group, groupIdx: number) => (
                    <div key={groupIdx}>
                      {/* Date header */}
                      <div
                        style={{
                          padding: "8px 16px",
                          backgroundColor:
                            group.label === "Today" ? "#e3f2fd" : "#e8e8e8",
                          borderLeft:
                            group.label === "Today"
                              ? "4px solid #2196f3"
                              : "none",
                          fontWeight: "600",
                          fontSize: "14px",
                          color: group.label === "Today" ? "#1976d2" : "#666",
                          position: "sticky",
                          top: 0,
                        }}
                      >
                        {group.label}
                      </div>
                      {/* Events for this date */}
                      {group.events.map((evt, idx: number) => (
                        <div
                          key={idx}
                          onClick={selectEvent({ eventId: evt.id, selectedEventId })}
                          style={{
                            padding: "12px 16px",
                            backgroundColor: "#fff",
                            borderBottom: "1px solid #f0f0f0",
                            cursor: "pointer",
                            display: "flex",
                            gap: "12px",
                          }}
                        >
                          {/* Calendar color indicator */}
                          <div
                            style={{
                              width: "4px",
                              backgroundColor: getCalendarColor(evt.calendarName),
                              borderRadius: "2px",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: "600" }}>{evt.title}</div>
                            <div style={{ fontSize: "14px", color: "#666" }}>
                              {evt.isAllDay
                                ? "All day"
                                : `${formatTime(evt.startDate)} - ${formatTime(evt.endDate)}`}
                            </div>
                            <div style={{ fontSize: "13px", color: "#999" }}>
                              {evt.location || ""}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#999",
                              flexShrink: 0,
                            }}
                          >
                            {evt.calendarName}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>,
              // Event detail view
              <div style={{ padding: "20px", backgroundColor: "#fff" }}>
                {derive(selectedEvent, (evt: CalendarEvent | null) =>
                  evt ? (
                    <div>
                      {/* Calendar indicator */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "16px",
                        }}
                      >
                        <div
                          style={{
                            width: "12px",
                            height: "12px",
                            borderRadius: "6px",
                            backgroundColor: getCalendarColor(evt.calendarName),
                          }}
                        />
                        <span style={{ color: "#666" }}>{evt.calendarName}</span>
                      </div>

                      {/* Title */}
                      <div style={{ margin: "0 0 16px 0", fontSize: "24px", fontWeight: "bold" }}>
                        {evt.title}
                      </div>

                      {/* Date & Time */}
                      <div style={{ marginBottom: "16px" }}>
                        <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                          Date and Time
                        </div>
                        <div style={{ color: "#666" }}>
                          {formatDate(evt.startDate)}
                          {evt.isAllDay
                            ? " (All day)"
                            : `, ${formatTime(evt.startDate)} - ${formatTime(evt.endDate)}`}
                        </div>
                      </div>

                      {/* Location */}
                      <div style={{ marginBottom: "16px" }}>
                        <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                          Location
                        </div>
                        <div style={{ color: "#666" }}>{evt.location || "Not specified"}</div>
                      </div>

                      {/* Notes */}
                      <div style={{ marginBottom: "16px" }}>
                        <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                          Notes
                        </div>
                        <div
                          style={{
                            color: "#666",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {evt.notes || "No notes"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>Event not found</div>
                  )
                )}
              </div>
            )
          )}
        </div>
      </ct-screen>
    ),
    events,
  };
});
