/// <cts-enable />
import { Cell, computed, Default, derive, handler, ifElse, NAME, pattern, UI } from "commontools";

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
  // Trigger for sparkle animation (increments when star placed)
  sparkleKey: Cell<Default<number, 0>>;
  // Debug: override "today" for testing (empty string = use real today)
  // Link a date picker charm to this for debugging
  debugDate: Cell<Default<string, "">>;
}

interface StarChartOutput {
  goalName: Cell<Default<string, "Gold Star Goal">>;
  days: Cell<Default<DayRecord[], []>>;
  sparkleKey: Cell<Default<number, 0>>;
  debugDate: Cell<Default<string, "">>;
}

// Helper to get today's date as YYYY-MM-DD
function getTodayString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}


// Handler to place a star for today (single tap)
const placeStar = handler<
  unknown,
  { days: Cell<DayRecord[]>; sparkleKey: Cell<number>; debugDate: Cell<string> }
>((_, { days, sparkleKey, debugDate }) => {
  const currentDays = days.get();
  const override = debugDate.get();
  const todayStr = override || getTodayString();

  // Check if today already has a record
  const existingIndex = currentDays.findIndex((d) => d.date === todayStr);
  if (existingIndex >= 0) {
    // Already has a star, do nothing
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
  // Trigger sparkle animation
  sparkleKey.set(sparkleKey.get() + 1);
});

// Interface for timeline display
interface TimelineDay {
  date: string;      // YYYY-MM-DD
  displayDate: string; // "Nov 30" format
  hasStar: boolean;
  rotation: number;
}

export default pattern<StarChartInput, StarChartOutput>(
  ({ goalName, days, sparkleKey, debugDate }) => {
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

    // Generate timeline: dates from first star to yesterday (today shown separately)
    // Using derive to pre-compute to avoid computed() inside map (causes infinite loops)
    const timeline = derive(
      { days, debugDate },
      ({ days: daysCell, debugDate: debugDateCell }) => {
        const daysArray = daysCell.get();
        const override = typeof debugDateCell === "string" ? debugDateCell : debugDateCell?.get?.() ?? "";
        const todayStr = override || getTodayString();

        // Find the earliest star date
        const starDates = daysArray
          .filter((d: DayRecord) => d.earned)
          .map((d: DayRecord) => d.date)
          .sort();

        // If no stars exist, return empty timeline
        if (starDates.length === 0) {
          return [];
        }

        const earliestStarDate = starDates[0];
        const baseDate = new Date(todayStr + "T12:00:00");
        const earliestDate = new Date(earliestStarDate + "T12:00:00");

        const result: TimelineDay[] = [];
        // Start from today, go back to earliest star date
        let currentDate = new Date(baseDate);

        while (currentDate >= earliestDate) {
          const dateStr = currentDate.toISOString().split("T")[0];
          const displayDate = currentDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

          const dayRecord = daysArray.find((d: DayRecord) => d.date === dateStr);
          result.push({
            date: dateStr,
            displayDate,
            hasStar: dayRecord?.earned ?? false,
            rotation: dayRecord?.rotation ?? 0,
          });

          // Move to previous day
          currentDate.setDate(currentDate.getDate() - 1);
        }

        return result;
      }
    );

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
                position: "relative",
                overflow: "hidden",
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

              {/* If today already has a star, show with celebration animation */}
              {ifElse(
                todayHasStar,
                <div className="star-container" key={sparkleKey}>
                  {/* Sparkle particles */}
                  <div className="sparkle-burst">
                    <div className="sparkle s1">✦</div>
                    <div className="sparkle s2">✦</div>
                    <div className="sparkle s3">✦</div>
                    <div className="sparkle s4">✦</div>
                    <div className="sparkle s5">✦</div>
                    <div className="sparkle s6">✦</div>
                    <div className="sparkle s7">✦</div>
                    <div className="sparkle s8">✦</div>
                  </div>
                  <div
                    className="magical-star star-pop"
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
                  {/* Single tap to add star */}
                  <button
                    onClick={placeStar({ days, sparkleKey, debugDate })}
                    style={{
                      fontSize: "80px",
                      background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                      border: "none",
                      borderRadius: "50%",
                      width: "150px",
                      height: "150px",
                      cursor: "pointer",
                      boxShadow: "0 8px 24px rgba(251, 191, 36, 0.5)",
                      transition: "all 0.2s ease",
                    }}
                    className="tap-star"
                  >
                    ⭐
                  </button>
                  <div
                    style={{
                      fontSize: "14px",
                      color: "#92400e",
                      marginTop: "12px",
                    }}
                  >
                    Tap to earn your star!
                  </div>
                </div>
              )}
            </div>

            {/* Horizontal Timeline */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
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

              {/* Horizontal scroll container */}
              <div
                style={{
                  overflowX: "auto",
                  overflowY: "hidden",
                  paddingBottom: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    paddingLeft: "4px",
                    paddingRight: "4px",
                  }}
                >
                  {timeline.map((day: { date: string; displayDate: string; hasStar: boolean; rotation: number }) => (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "6px",
                        minWidth: "60px",
                        padding: "8px 4px",
                        background: "rgba(255,255,255,0.5)",
                        borderRadius: "12px",
                      }}
                    >
                      {/* Date label */}
                      <div
                        style={{
                          fontSize: "11px",
                          color: "#78350f",
                          fontWeight: "500",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {day.displayDate}
                      </div>

                      {/* Star or empty circle */}
                      {ifElse(
                        day.hasStar,
                        <div
                          className="magical-star"
                          style={{
                            fontSize: "36px",
                            lineHeight: "1",
                            filter: "drop-shadow(0 0 6px rgba(251, 191, 36, 0.5))",
                            animation: "shimmer 3s ease-in-out infinite",
                            transform: `rotate(${day.rotation}deg)`,
                          }}
                        >
                          ⭐
                        </div>,
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            border: "2px dashed #d4d4d4",
                            background: "rgba(255,255,255,0.3)",
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
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

            @keyframes starPop {
              0% {
                transform: scale(0) rotate(-180deg);
                opacity: 0;
              }
              50% {
                transform: scale(1.3) rotate(10deg);
              }
              70% {
                transform: scale(0.9) rotate(-5deg);
              }
              100% {
                transform: scale(1) rotate(0deg);
                opacity: 1;
              }
            }

            @keyframes sparkleOut {
              0% {
                transform: translate(0, 0) scale(1);
                opacity: 1;
              }
              100% {
                opacity: 0;
              }
            }

            .magical-star {
              display: inline-block;
            }

            .star-pop {
              animation: starPop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards,
                         shimmer 3s ease-in-out 0.6s infinite,
                         jiggle 2s ease-in-out 0.6s infinite !important;
            }

            .star-container {
              position: relative;
            }

            .sparkle-burst {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              pointer-events: none;
            }

            .sparkle {
              position: absolute;
              font-size: 24px;
              color: #fbbf24;
              animation: sparkleOut 0.8s ease-out forwards;
              text-shadow: 0 0 10px #fbbf24;
            }

            .s1 { transform: translate(-60px, -60px); animation-delay: 0s; }
            .s2 { transform: translate(60px, -60px); animation-delay: 0.05s; }
            .s3 { transform: translate(-80px, 0px); animation-delay: 0.1s; }
            .s4 { transform: translate(80px, 0px); animation-delay: 0.15s; }
            .s5 { transform: translate(-60px, 60px); animation-delay: 0.2s; }
            .s6 { transform: translate(60px, 60px); animation-delay: 0.25s; }
            .s7 { transform: translate(0px, -80px); animation-delay: 0.1s; }
            .s8 { transform: translate(0px, 80px); animation-delay: 0.15s; }

            .tap-star:active {
              transform: scale(0.95);
            }

            .tap-star:hover {
              transform: scale(1.05);
              box-shadow: 0 12px 32px rgba(251, 191, 36, 0.6);
            }
          `}</style>
        </ct-screen>
      ),
      goalName,
      days,
      sparkleKey,
      debugDate,
    };
  }
);
