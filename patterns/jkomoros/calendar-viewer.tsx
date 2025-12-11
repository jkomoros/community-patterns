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

const nextPage = handler<unknown, { currentPage: Cell<number> }>(
  (_, { currentPage }) => {
    currentPage.set(currentPage.get() + 1);
  },
);

const prevPage = handler<unknown, { currentPage: Cell<number> }>(
  (_, { currentPage }) => {
    const current = currentPage.get();
    if (current > 0) {
      currentPage.set(current - 1);
    }
  },
);

export default pattern<{
  events: Default<Confidential<CalendarEvent[]>, []>;
}>(({ events }) => {
  const hiddenCalendars = cell<string[]>([]);
  const currentPage = cell(0);
  const PAGE_SIZE = 10;

  const eventCount = derive(events, (evts: CalendarEvent[]) => evts?.length ?? 0);

  // Extract unique calendar names for the filter bar
  // Refactored to use filter/map after CT-1102 fix
  const uniqueCalendars = derive(events, (evts: CalendarEvent[]) =>
    [...new Set((evts || []).filter(evt => evt?.calendarName).map(evt => evt.calendarName))].sort()
  );

  // Upcoming events (sorted by start date)
  const upcomingEvents = derive(events, (evts: CalendarEvent[]) => {
    const now = new Date();
    return [...(evts || [])]
      .filter((e: CalendarEvent) => new Date(e.startDate) >= now)
      .sort((a: CalendarEvent, b: CalendarEvent) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
  });

  const totalUpcoming = derive(upcomingEvents, (evts: CalendarEvent[]) => evts.length);
  const maxPageNum = derive(totalUpcoming, (total: number) => Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));

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
          <span style={{ fontSize: "24px" }}>Calendar</span>
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
                uniqueCalendars: calendars,
                hiddenCalendars: hiddenList,
              }: {
                uniqueCalendars: string[];
                hiddenCalendars: string[];
              }) =>
                (calendars || []).map((name: string) => {
                  const isHidden = (hiddenList || []).includes(name);
                  const color = getCalendarColor(name);
                  return (
                    <button
                      // Pass the Cell from outer scope, not the destructured value
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
            /*
             * Paginated event preview - showing 10 events at a time.
             *
             * NOTE: This pagination is intentional due to performance limitations.
             * Rendering 200+ events with reactive cells causes Chrome CPU to spike
             * to 100% for extended periods. Ideally we'd show all events at once,
             * but until the framework supports virtualization or more efficient
             * rendering, we paginate to keep the UI responsive.
             *
             * See: https://linear.app/common-tools/issue/CT-1111/performance-derive-inside-map-causes-8x-more-calls-than-expected-never
             *
             * The full event data is still available via the `events` output for
             * other patterns to access via linking.
             */
            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <div style={{ fontSize: "18px", fontWeight: "bold" }}>
                  Upcoming Events ({totalUpcoming} total)
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  Showing {derive(currentPage, (p: number) => p * PAGE_SIZE + 1)}-{derive({ currentPage, totalUpcoming }, ({ currentPage: p, totalUpcoming: total }: { currentPage: number; totalUpcoming: number }) => Math.min((p + 1) * PAGE_SIZE, total))} of {totalUpcoming}
                </div>
              </div>
              <p style={{ fontSize: "14px", color: "#666", margin: "0 0 16px 0" }}>
                Full event data available for other patterns via linking.
                (Paginated for performance - rendering 200+ items causes CPU issues)
              </p>

              {derive({ upcomingEvents, currentPage }, ({ upcomingEvents: evts, currentPage: page }: { upcomingEvents: CalendarEvent[]; currentPage: number }) => {
                const start = page * PAGE_SIZE;
                const end = Math.min(start + PAGE_SIZE, evts.length);
                const pageEvents = evts.slice(start, end);

                if (pageEvents.length === 0) {
                  return <div style={{ color: "#999" }}>No upcoming events</div>;
                }

                return (
                  <div>
                    {pageEvents.map((evt: CalendarEvent, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: "12px 16px",
                          backgroundColor: "#fff",
                          borderBottom: "1px solid #f0f0f0",
                          display: "flex",
                          gap: "12px",
                        }}
                      >
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
                            {getRelativeLabel(evt.startDate)} {evt.isAllDay ? "(All day)" : formatTime(evt.startDate)}
                          </div>
                          {evt.location && (
                            <div style={{ fontSize: "13px", color: "#999" }}>{evt.location}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Pagination controls */}
              {ifElse(
                derive(totalUpcoming, (t: number) => t > PAGE_SIZE),
                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "12px" }}>
                  <button
                    onClick={prevPage({ currentPage })}
                    disabled={derive(currentPage, (p: number) => p === 0)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    ← Previous
                  </button>
                  <span style={{ padding: "6px 12px", fontSize: "14px" }}>
                    Page {derive(currentPage, (p: number) => p + 1)} of {derive(maxPageNum, (m: number) => m + 1)}
                  </span>
                  <button
                    onClick={nextPage({ currentPage })}
                    disabled={derive({ currentPage, maxPageNum }, ({ currentPage: p, maxPageNum: max }: { currentPage: number; maxPageNum: number }) => p >= max)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Next →
                  </button>
                </div>,
                <div />
              )}
            </div>
          )}
        </div>
      </ct-screen>
    ),
    events,
  };
});
