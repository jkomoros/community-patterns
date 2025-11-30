/// <cts-enable />
import { Cell, computed, Default, handler, ifElse, NAME, OpaqueRef, pattern, UI } from "commontools";

/**
 * Star Chart Pattern
 *
 * A reward calendar for children learning daily habits.
 * Shows a rolling 30-day timeline with gold stars for successful days.
 * Stars appear as magical stickers with random tilts and shimmer effects.
 *
 * ## Debug/Testing Mode
 *
 * The `debugDate` input allows overriding "today" for testing purposes.
 * When empty (default), uses the real current date.
 *
 * To test with different dates, create a linked date picker charm:
 *
 * 1. Deploy this pattern:
 *    deno task ct charm new star-chart.tsx --api-url http://localhost:8000 \
 *      --identity ../../claude.key --space jkomoros-test
 *
 * 2. Note the charm ID from the deployment output (e.g., "bafy...")
 *
 * 3. Create a date picker linked to debugDate:
 *    deno task ct charm new @anthropic/date-picker --api-url http://localhost:8000 \
 *      --identity ../../claude.key --space jkomoros-test \
 *      --argument "date=/jkomoros-test/<charm-id>/debugDate"
 *
 * 4. Open the date picker charm to change the Star Chart's "today"
 *
 * To clear all data for testing, set days to [] via another linked charm
 * or redeploy with fresh state.
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
  awardEnabled: Cell<Default<boolean, false>>;
  // Debug: override "today" for testing (empty string = use real today)
  // Link a date picker charm to this for debugging
  debugDate: Cell<Default<string, "">>;
}

interface StarChartOutput {
  goalName: Cell<Default<string, "Gold Star Goal">>;
  days: Cell<Default<DayRecord[], []>>;
  awardEnabled: Cell<Default<boolean, false>>;
  debugDate: Cell<Default<string, "">>;
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

// Handler for parent to enable award mode
const enableAward = handler<
  unknown,
  { awardEnabled: Cell<boolean> }
>((_, { awardEnabled }) => {
  awardEnabled.set(true);
});

// Handler for child to place the star
const placeStar = handler<
  unknown,
  { days: Cell<DayRecord[]>; awardEnabled: Cell<boolean>; debugDate: Cell<string> }
>((_, { days, awardEnabled, debugDate }) => {
  // Only works if award is enabled
  if (!awardEnabled.get()) return;

  const currentDays = days.get();
  const override = debugDate.get();
  const todayStr = override || getTodayString();

  // Check if today already has a record
  const existingIndex = currentDays.findIndex((d) => d.date === todayStr);
  if (existingIndex >= 0) {
    // Already has a star, just disable award mode
    awardEnabled.set(false);
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
  awardEnabled.set(false);
});

export default pattern<StarChartInput, StarChartOutput>(
  ({ goalName, days, awardEnabled, debugDate }) => {
    // Get effective "today" (real or debug override)
    // debugDate is a Cell, so use .get() inside computed
    const effectiveToday = computed(() => {
      const override = debugDate.get();
      return override || getTodayString();
    });

    // Check if today already has a star
    // days is a Cell, use .get() to get the array, then use array methods
    // effectiveToday is a computed, access it directly (no .get())
    const todayHasStar = computed(() => {
      const todayStr = effectiveToday as unknown as string;
      const allDays = days.get();
      return allDays.some((d) => d.date === todayStr && d.earned);
    });

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

            {/* Today's Section */}
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
                Today - {effectiveToday}
              </div>

              {/* If today already has a star, show celebration */}
              {ifElse(
                todayHasStar,
                <div>
                  <div
                    className="magical-star"
                    style={{
                      fontSize: "100px",
                      lineHeight: "1",
                      filter: "drop-shadow(0 0 12px rgba(251, 191, 36, 0.7))",
                      animation: "shimmer 3s ease-in-out infinite, jiggle 2s ease-in-out infinite",
                    }}
                  >
                    ⭐
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: "bold",
                      color: "#d97706",
                      marginTop: "12px",
                    }}
                  >
                    Great job today!
                  </div>
                </div>,
                <div>
                  {/* Step 1: Parent enables award (small button) */}
                  <button
                    onClick={enableAward({ awardEnabled })}
                    disabled={awardEnabled}
                    style={{
                      fontSize: "14px",
                      background: awardEnabled ? "#e5e7eb" : "#f59e0b",
                      color: awardEnabled ? "#9ca3af" : "white",
                      border: "none",
                      borderRadius: "8px",
                      padding: "8px 16px",
                      cursor: awardEnabled ? "default" : "pointer",
                      marginBottom: "16px",
                    }}
                  >
                    {ifElse(awardEnabled, "Ready for star!", "Award Star")}
                  </button>

                  {/* Step 2: Child places the star (big button, only when enabled) */}
                  <button
                    onClick={placeStar({ days, awardEnabled, debugDate })}
                    disabled={ifElse(awardEnabled, false, true)}
                    style={{
                      fontSize: "80px",
                      background: awardEnabled
                        ? "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)"
                        : "#e5e7eb",
                      border: "none",
                      borderRadius: "50%",
                      width: "150px",
                      height: "150px",
                      cursor: awardEnabled ? "pointer" : "default",
                      boxShadow: awardEnabled
                        ? "0 8px 24px rgba(251, 191, 36, 0.5)"
                        : "none",
                      transition: "all 0.3s ease",
                      transform: awardEnabled ? "scale(1.1)" : "scale(1)",
                    }}
                  >
                    {ifElse(awardEnabled, "⭐", "○")}
                  </button>

                  <div
                    style={{
                      fontSize: "14px",
                      color: "#92400e",
                      marginTop: "12px",
                    }}
                  >
                    {ifElse(
                      awardEnabled,
                      "Tap the star to place it!",
                      "Parent: tap 'Award Star' first"
                    )}
                  </div>
                </div>
              )}
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
                      className="magical-star"
                      style={{
                        fontSize: "32px",
                        lineHeight: "1",
                        filter: "drop-shadow(0 0 8px rgba(251, 191, 36, 0.6))",
                        animation: "shimmer 3s ease-in-out infinite, jiggle 2s ease-in-out infinite",
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

          {/* CSS Animations for magical stars */}
          <style>{`
            @keyframes shimmer {
              0%, 100% {
                filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.6));
              }
              50% {
                filter: drop-shadow(0 0 16px rgba(251, 191, 36, 0.9)) brightness(1.1);
              }
            }

            @keyframes jiggle {
              0%, 100% {
                transform: rotate(-3deg);
              }
              25% {
                transform: rotate(2deg);
              }
              50% {
                transform: rotate(-2deg);
              }
              75% {
                transform: rotate(3deg);
              }
            }

            .magical-star {
              display: inline-block;
            }
          `}</style>
        </ct-screen>
      ),
      goalName,
      days,
      awardEnabled,
      debugDate,
    };
  }
);
