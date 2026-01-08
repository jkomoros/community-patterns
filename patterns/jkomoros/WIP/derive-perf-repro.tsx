/// <cts-enable />
import {
  Writable,
  computed,
  Default,
  handler,
  pattern,
  UI,
  NAME,
} from "commontools";

// Minimal event type
type FakeEvent = {
  id: string;
  summary: string;
  startDateTime: string;
  endDateTime: string;
  isAllDay: boolean;
};

// Date formatting function (same as calendar importer)
function formatEventDate(startDateTime: string, endDateTime: string, isAllDay: boolean): string {
  if (isAllDay) {
    return startDateTime;
  }
  const start = new Date(startDateTime);
  const end = new Date(endDateTime);
  const dateStr = start.toLocaleDateString();
  const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${startTime} - ${endTime}`;
}

// Generate fake events
function generateFakeEvents(count: number): FakeEvent[] {
  const events: FakeEvent[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + Math.floor(i / 5));
    startDate.setHours(9 + (i % 8), (i % 4) * 15, 0, 0);

    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 1);

    events.push({
      id: `fake-event-${i}`,
      summary: `Event ${i + 1}: Meeting about topic ${i}`,
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
      isAllDay: i % 20 === 0,
    });
  }

  return events;
}

// Handler definitions (will be instantiated inside pattern)
const generateEventsHandler = handler<
  unknown,
  { events: Writable<FakeEvent[]>; count: Writable<number> }
>((_event, { events, count }) => {
  const numEvents = count.get();
  console.log(`Generating ${numEvents} fake events...`);
  const fakeEvents = generateFakeEvents(numEvents);
  events.set(fakeEvents);
  console.log(`Generated ${fakeEvents.length} events`);
});

const clearEventsHandler = handler<unknown, { events: Writable<FakeEvent[]> }>(
  (_event, { events }) => {
    events.set([]);
    console.log("Cleared events");
  }
);

interface DerivePerfReproInput {
  count?: Default<number, 250>;
}

/**
 * Minimal reproduction of derive performance issue.
 *
 * The problem: Using derive() inside .map() for rendering causes
 * excessive derive calls and CPU spikes with 200+ items.
 *
 * Expected: ~N derive calls for N events (one per row)
 * Actual: 8x+ more derive calls, never stabilizes
 *
 * To reproduce:
 * 1. Open browser console
 * 2. Click "Generate Events" with 250 events
 * 3. Watch CPU spike and console logs
 */
const DerivePerfRepro = pattern<DerivePerfReproInput, { events: FakeEvent[]; eventCount: number }>(
  ({ count }) => {
    const events = Writable.of<FakeEvent[]>([]);
    const eventCount = computed(() => events.get().length);

    return {
      [NAME]: "Derive Perf Repro",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
          <h1>Derive Performance Reproduction</h1>

          <p style={{ color: "#666", marginBottom: "20px" }}>
            This demonstrates excessive derive calls when using derive() inside .map().
            Open browser console to watch for issues.
          </p>

          <div style={{ marginBottom: "20px" }}>
            <label>
              Number of events: {count}
            </label>
            <br />
            <button
              onClick={generateEventsHandler({ events, count })}
              style={{ marginRight: "10px", padding: "8px 16px", marginTop: "10px" }}
            >
              Generate 250 Events
            </button>
            <button
              onClick={clearEventsHandler({ events })}
              style={{ padding: "8px 16px" }}
            >
              Clear
            </button>
          </div>

          <div style={{ marginBottom: "20px", padding: "10px", backgroundColor: "#f0f0f0" }}>
            <strong>Event count:</strong> {eventCount}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #ccc" }}>
                  DATE/TIME (via derive)
                </th>
                <th style={{ padding: "10px", textAlign: "left", borderBottom: "2px solid #ccc" }}>
                  EVENT
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr>
                  <td style={{ padding: "10px", borderBottom: "1px solid #eee" }}>
                    {/* THIS IS THE PROBLEMATIC PATTERN - computed inside map */}
                    {computed(() => {
                      return formatEventDate(event.startDateTime, event.endDateTime, event.isAllDay);
                    })}
                  </td>
                  <td style={{ padding: "10px", borderBottom: "1px solid #eee" }}>
                    {event.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
      events,
      eventCount,
    };
  }
);

export default DerivePerfRepro;
