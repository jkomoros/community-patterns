/// <cts-enable />
import { Cell, Default, handler, ifElse, NAME, OpaqueRef, pattern, UI } from "commontools";

/**
 * Star Chart Pattern
 *
 * A reward calendar for children learning daily habits.
 * Shows a rolling 30-day timeline with gold stars for successful days.
 * Stars appear as magical stickers with random tilts and shimmer effects.
 */

interface DayRecord {
  date: string;      // YYYY-MM-DD
  earned: boolean;   // Did they earn a star?
  protected: boolean; // Is this a streak-protected day?
  rotation: number;  // Random rotation for sticker effect (-15 to 15)
}

interface StarChartInput {
  goalName: Cell<Default<string, "Gold Star Goal">>;
  days: Cell<Default<DayRecord[], []>>;
}

interface StarChartOutput {
  goalName: Cell<Default<string, "Gold Star Goal">>;
  days: Cell<Default<DayRecord[], []>>;
}

// Helper to get today's date as YYYY-MM-DD
function getTodayString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

// Helper to format date for display (e.g., "Nov 30")
function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Static list of last 30 days (generated once)
function getLastNDays(n: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dates.push(date.toISOString().split("T")[0]);
  }
  return dates;
}

const last30Days = getLastNDays(30);
const today = getTodayString();

// Handler to add a star for today
const awardStar = handler<
  unknown,
  { days: Cell<DayRecord[]> }
>((_, { days }) => {
  const currentDays = days.get();
  const todayStr = getTodayString();

  // Check if today already has a record
  const existingIndex = currentDays.findIndex((d) => d.date === todayStr);
  if (existingIndex >= 0) {
    // Already has a star, don't add again
    return;
  }

  // Add new record with random rotation
  const rotation = Math.random() * 30 - 15;
  const newRecord: DayRecord = {
    date: todayStr,
    earned: true,
    protected: false,
    rotation,
  };
  days.set([...currentDays, newRecord]);
});

export default pattern<StarChartInput, StarChartOutput>(
  ({ goalName, days }) => {
    return {
      [NAME]: "Star Chart",
      [UI]: (
        <ct-screen style="background: linear-gradient(180deg, #fef3c7 0%, #fef9c3 100%); font-family: system-ui, sans-serif;">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100dvh",
              padding: "20px",
              gap: "16px",
            }}
          >
            {/* Header with goal name */}
            <div style={{ textAlign: "center", paddingTop: "10px" }}>
              <div
                style={{
                  fontSize: "14px",
                  color: "#92400e",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  marginBottom: "4px",
                }}
              >
                Star Chart
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: "bold",
                  color: "#78350f",
                }}
              >
                {goalName}
              </div>
            </div>

            {/* Today's Award Button - always rendered */}
            <div
              style={{
                background: "rgba(255,255,255,0.8)",
                borderRadius: "16px",
                padding: "20px",
                textAlign: "center",
                border: "3px dashed #fbbf24",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "#92400e",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  marginBottom: "12px",
                }}
              >
                Today - {formatDateShort(today)}
              </div>

              <button
                onClick={awardStar({ days })}
                style={{
                  fontSize: "48px",
                  background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                  border: "none",
                  borderRadius: "50%",
                  width: "100px",
                  height: "100px",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(251, 191, 36, 0.4)",
                }}
              >
                ⭐
              </button>

              <div
                style={{
                  fontSize: "14px",
                  color: "#92400e",
                  marginTop: "8px",
                }}
              >
                Tap to award star!
              </div>
            </div>

            {/* Timeline of days */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "#92400e",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  paddingLeft: "4px",
                }}
              >
                Recent Days
              </div>

              {/* Show days that have stars */}
              {days.map((record: OpaqueRef<DayRecord>) => (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.5)",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#78350f",
                      minWidth: "70px",
                    }}
                  >
                    {record.date.substring(5).replace("-", "/")}
                  </div>

                  {ifElse(
                    record.earned,
                    <div
                      style={{
                        fontSize: "32px",
                        lineHeight: "1",
                        filter: "drop-shadow(0 0 6px rgba(251, 191, 36, 0.4))",
                      }}
                    >
                      ⭐
                    </div>,
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        border: "2px solid #d4d4d4",
                        background: "rgba(255,255,255,0.5)",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </ct-screen>
      ),
      goalName,
      days,
    };
  }
);
