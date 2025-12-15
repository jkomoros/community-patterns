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

// Milestone thresholds and their celebration messages
const MILESTONES = [
  { days: 3, message: "3 days! Great start! 🌟", emoji: "🌟" },
  { days: 7, message: "One whole week! Amazing! 🎉", emoji: "🎉" },
  { days: 14, message: "Two weeks! You're on fire! 🔥", emoji: "🔥" },
  { days: 30, message: "ONE MONTH! Incredible! 🏆", emoji: "🏆" },
] as const;

// Get milestone info if current streak hits a milestone
function getMilestoneForStreak(streak: number): typeof MILESTONES[number] | null {
  // Find the highest milestone that matches exactly
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    if (streak === MILESTONES[i].days) {
      return MILESTONES[i];
    }
  }
  return null;
}

interface StarChartInput {
  goalName?: Cell<Default<string, "Gold Star Goal">>;
  // Optional description for the goal (e.g., "No accidents all day!")
  goalDescription?: Cell<Default<string, "">>;
  days?: Cell<Default<DayRecord[], []>>;
  // Best streak ever achieved
  bestStreak?: Cell<Default<number, 0>>;
  // Last milestone that was celebrated (to avoid repeating)
  lastCelebratedMilestone?: Cell<Default<number, 0>>;
  // Trigger for sparkle animation (increments when star placed)
  sparkleKey?: Cell<Default<number, 0>>;
  // Current view mode: main (daily use) or corrections (parent edit mode) or settings (edit goal)
  viewMode?: Cell<Default<"main" | "corrections" | "settings", "main">>;
  // Debug: override "today" for testing (empty string = use real today)
  // Link a date picker charm to this for debugging
  debugDate?: Cell<Default<string, "">>;
}

interface StarChartOutput {
  goalName: Cell<Default<string, "Gold Star Goal">>;
  goalDescription: Cell<Default<string, "">>;
  days: Cell<Default<DayRecord[], []>>;
  bestStreak: Cell<Default<number, 0>>;
  lastCelebratedMilestone: Cell<Default<number, 0>>;
  sparkleKey: Cell<Default<number, 0>>;
  viewMode: Cell<Default<"main" | "corrections" | "settings", "main">>;
  debugDate: Cell<Default<string, "">>;
}

// Helper to format a Date as YYYY-MM-DD in local timezone
function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper to get today's date as YYYY-MM-DD (local timezone)
function getTodayString(): string {
  return formatDateLocal(new Date());
}

// Helper to get previous day's date string
function getPreviousDay(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  date.setDate(date.getDate() - 1);
  return formatDateLocal(date);
}

// Helper to calculate current streak from days array
// Streak = consecutive days with earned OR protected status, going back from today
function calculateStreak(daysArray: readonly DayRecord[], todayStr: string): number {
  let streak = 0;
  let currentDate = todayStr;

  while (true) {
    const dayRecord = daysArray.find((d) => d.date === currentDate);
    // Count if earned or protected
    if (dayRecord && (dayRecord.earned || dayRecord.protected)) {
      streak++;
      currentDate = getPreviousDay(currentDate);
    } else {
      break;
    }
  }

  return streak;
}


// Handler to place a star for today (single tap)
// Also handles streak protection: if yesterday is missed but had 3+ streak before,
// auto-protect yesterday
const placeStar = handler<
  unknown,
  { days: Cell<DayRecord[]>; bestStreak: Cell<number>; lastCelebratedMilestone: Cell<number>; sparkleKey: Cell<number>; debugDate: Cell<string> }
>((_, { days, bestStreak, lastCelebratedMilestone, sparkleKey, debugDate }) => {
  const currentDays = days.get();
  const override = debugDate.get();
  const todayStr = override || getTodayString();

  // Check if today already has a record
  const existingIndex = currentDays.findIndex((d) => d.date === todayStr);
  if (existingIndex >= 0) {
    // Already has a star, do nothing
    return;
  }

  let updatedDays = [...currentDays];

  // Check if yesterday needs protection
  const yesterdayStr = getPreviousDay(todayStr);
  const yesterdayRecord = updatedDays.find((d) => d.date === yesterdayStr);

  // If yesterday is missing and we had a 3+ day streak before yesterday,
  // auto-protect yesterday
  if (!yesterdayRecord) {
    // Calculate streak as of 2 days ago (before yesterday's gap)
    const twoDaysAgoStr = getPreviousDay(yesterdayStr);
    const streakBeforeGap = calculateStreak(updatedDays, twoDaysAgoStr);

    if (streakBeforeGap >= 3) {
      // Auto-protect yesterday
      const protectedRecord: DayRecord = {
        date: yesterdayStr,
        earned: false,
        protected: true,
        rotation: 0, // No rotation for protected days
      };
      updatedDays.push(protectedRecord);
    }
  }

  // Add new record for today with random rotation
  const rotation = Math.random() * 30 - 15;
  const newRecord: DayRecord = {
    date: todayStr,
    earned: true,
    protected: false,
    rotation,
  };
  updatedDays.push(newRecord);
  days.set(updatedDays);

  // Calculate new streak and update best if needed
  const newStreak = calculateStreak(updatedDays, todayStr);
  const currentBest = bestStreak.get();
  if (newStreak > currentBest) {
    bestStreak.set(newStreak);
  }

  // Check for milestone celebration
  const milestone = getMilestoneForStreak(newStreak);
  const lastMilestone = lastCelebratedMilestone.get();
  if (milestone && milestone.days > lastMilestone) {
    // New milestone reached!
    lastCelebratedMilestone.set(milestone.days);
  }

  // Trigger sparkle animation
  sparkleKey.set(sparkleKey.get() + 1);
});

// Handler to enter corrections view
const enterCorrections = handler<
  unknown,
  { viewMode: Cell<string> }
>((_, { viewMode }) => {
  viewMode.set("corrections");
});

// Handler to return to main view
const exitCorrections = handler<
  unknown,
  { viewMode: Cell<string> }
>((_, { viewMode }) => {
  viewMode.set("main");
});

// Handler to enter settings view (edit goal name/description)
const enterSettings = handler<
  unknown,
  { viewMode: Cell<string> }
>((_, { viewMode }) => {
  viewMode.set("settings");
});

// Handler to exit settings view
const exitSettings = handler<
  unknown,
  { viewMode: Cell<string> }
>((_, { viewMode }) => {
  viewMode.set("main");
});

// Handler to toggle a star on a past day (for corrections view)
// The date is passed directly in the context since DOM event attributes
// may not be accessible in CommonTools handlers
const toggleDayStar = handler<
  unknown,
  { days: Cell<DayRecord[]>; bestStreak: Cell<number>; dateToToggle: string }
>((_, { days, bestStreak, dateToToggle }) => {
  const date = dateToToggle;
  if (!date) return;
  const currentDays = days.get();
  const existingIndex = currentDays.findIndex((d) => d.date === date);

  let updatedDays: DayRecord[];

  if (existingIndex >= 0) {
    const existing = currentDays[existingIndex];
    if (existing.earned) {
      // Remove the star (set earned to false)
      updatedDays = currentDays.map((d, i) =>
        i === existingIndex ? { ...d, earned: false, protected: false } : d
      );
    } else {
      // Add the star (set earned to true)
      const rotation = Math.random() * 30 - 15;
      updatedDays = currentDays.map((d, i) =>
        i === existingIndex ? { ...d, earned: true, protected: false, rotation } : d
      );
    }
  } else {
    // No record for this day, add one with earned = true
    const rotation = Math.random() * 30 - 15;
    const newRecord: DayRecord = {
      date,
      earned: true,
      protected: false,
      rotation,
    };
    updatedDays = [...currentDays, newRecord];
  }

  // Remove records that are neither earned nor protected (clean up)
  updatedDays = updatedDays.filter((d) => d.earned || d.protected);

  days.set(updatedDays);

  // Recalculate best streak (in case we added stars that create a new best)
  const today = getTodayString();
  const newStreak = calculateStreak(updatedDays, today);
  const currentBest = bestStreak.get();
  if (newStreak > currentBest) {
    bestStreak.set(newStreak);
  }
});

// Interface for timeline display
interface TimelineDay {
  date: string;      // YYYY-MM-DD
  displayDate: string; // "Nov 30" format
  hasStar: boolean;
  isProtected: boolean; // Protected day (dimmed star, counts toward streak)
  rotation: number;
}

const StarChart = pattern<StarChartInput, StarChartOutput>(
  ({ goalName, goalDescription, days, bestStreak, lastCelebratedMilestone, sparkleKey, viewMode, debugDate }) => {
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

    // Calculate current streak
    const currentStreak = computed(() => {
      const todayStr = effectiveToday as unknown as string;
      const allDays = days.get();
      return calculateStreak(allDays, todayStr);
    });

    // Check if we just hit a milestone (streak equals a milestone value and > last celebrated)
    const currentMilestone = computed(() => {
      const streak = currentStreak as unknown as number;
      const lastMilestone = lastCelebratedMilestone.get();
      const milestone = getMilestoneForStreak(streak);
      // Show milestone if it matches current streak and is >= last celebrated
      if (milestone && milestone.days >= lastMilestone) {
        return milestone;
      }
      return null;
    });

    // Check if we're in corrections mode
    const isCorrectionsMode = computed(() => {
      return viewMode.get() === "corrections";
    });

    // Check if we're in settings mode
    const isSettingsMode = computed(() => {
      return viewMode.get() === "settings";
    });

    // Generate list for corrections view (last 30 days)
    const correctionsList = computed(() => {
        const daysArray = days.get();
        const override = typeof debugDate === "string" ? debugDate : debugDate?.get?.() ?? "";
        const todayStr = override || getTodayString();

        const result: { date: string; displayDate: string; hasStar: boolean; isProtected: boolean }[] = [];
        const baseDate = new Date(todayStr + "T12:00:00");

        // Generate last 30 days
        for (let i = 0; i < 30; i++) {
          const currentDate = new Date(baseDate);
          currentDate.setDate(baseDate.getDate() - i);
          const dateStr = formatDateLocal(currentDate);
          const displayDate = currentDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

          const dayRecord = daysArray.find((d: DayRecord) => d.date === dateStr);
          result.push({
            date: dateStr,
            displayDate,
            hasStar: dayRecord?.earned ?? false,
            isProtected: dayRecord?.protected ?? false,
          });
        }

        return result;
    });

    // Generate timeline: dates from first recorded day to today
    // Using computed to pre-compute to avoid computed() inside map (causes infinite loops)
    const timeline = computed(() => {
        const daysArray = days.get();
        const override = typeof debugDate === "string" ? debugDate : debugDate?.get?.() ?? "";
        const todayStr = override || getTodayString();

        // Find the earliest recorded date (earned or protected)
        const recordedDates = daysArray
          .filter((d: DayRecord) => d.earned || d.protected)
          .map((d: DayRecord) => d.date)
          .sort();

        // If no records exist, return empty timeline
        if (recordedDates.length === 0) {
          return [];
        }

        const earliestRecordDate = recordedDates[0];
        const baseDate = new Date(todayStr + "T12:00:00");
        const earliestDate = new Date(earliestRecordDate + "T12:00:00");

        const result: TimelineDay[] = [];
        // Start from today, go back to earliest recorded date
        let currentDate = new Date(baseDate);

        while (currentDate >= earliestDate) {
          const dateStr = formatDateLocal(currentDate);
          const displayDate = currentDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

          const dayRecord = daysArray.find((d: DayRecord) => d.date === dateStr);
          result.push({
            date: dateStr,
            displayDate,
            hasStar: dayRecord?.earned ?? false,
            isProtected: dayRecord?.protected ?? false,
            rotation: dayRecord?.rotation ?? 0,
          });

          // Move to previous day
          currentDate.setDate(currentDate.getDate() - 1);
        }

        return result;
    });

    return {
      [NAME]: "Star Chart",
      [UI]: (
        <ct-screen style="background: linear-gradient(180deg, #fef3c7 0%, #fef9c3 100%); font-family: system-ui, sans-serif;">
          {ifElse(
            isSettingsMode,
            /* Settings View - Edit Goal Name & Description */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "20px",
                gap: "20px",
              }}
            >
              {/* Back button */}
              <button
                onClick={exitSettings({ viewMode })}
                style={{
                  background: "none",
                  border: "none",
                  color: "#92400e",
                  fontSize: "16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "0",
                }}
              >
                ← Back
              </button>

              {/* Header */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: "bold",
                    color: "#78350f",
                  }}
                >
                  Edit Goal
                </div>
              </div>

              {/* Goal Name Input */}
              <div
                style={{
                  background: "rgba(255,255,255,0.8)",
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    color: "#92400e",
                    marginBottom: "8px",
                    fontWeight: "500",
                  }}
                >
                  Goal Name
                </div>
                <ct-input
                  type="text"
                  $value={goalName}
                  placeholder="e.g., Dry Night, Big Kid Day"
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: "18px",
                    border: "2px solid #fbbf24",
                    borderRadius: "8px",
                    background: "white",
                  }}
                />
              </div>

              {/* Goal Description Input */}
              <div
                style={{
                  background: "rgba(255,255,255,0.8)",
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "13px",
                    color: "#92400e",
                    marginBottom: "8px",
                    fontWeight: "500",
                  }}
                >
                  Description (optional)
                </div>
                <ct-input
                  type="text"
                  $value={goalDescription}
                  placeholder="e.g., Stay dry all night long!"
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: "16px",
                    border: "2px solid #e5e7eb",
                    borderRadius: "8px",
                    background: "white",
                  }}
                />
                <div
                  style={{
                    fontSize: "12px",
                    color: "#9ca3af",
                    marginTop: "8px",
                  }}
                >
                  A short description to remind what this goal means
                </div>
              </div>

              {/* Done button */}
              <button
                onClick={exitSettings({ viewMode })}
                style={{
                  marginTop: "auto",
                  padding: "16px",
                  fontSize: "18px",
                  fontWeight: "bold",
                  background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                  color: "#78350f",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(251, 191, 36, 0.4)",
                }}
              >
                Done
              </button>
            </div>,
            ifElse(
              isCorrectionsMode,
              /* Corrections View - Parent Edit Mode */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "20px",
                gap: "16px",
              }}
            >
              {/* Back button */}
              <button
                onClick={exitCorrections({ viewMode })}
                style={{
                  background: "none",
                  border: "none",
                  color: "#92400e",
                  fontSize: "16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "0",
                }}
              >
                ← Back
              </button>

              {/* Header */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: "bold",
                    color: "#78350f",
                  }}
                >
                  Edit Past Days
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#92400e",
                    marginTop: "4px",
                  }}
                >
                  Tap to add or remove stars
                </div>
              </div>

              {/* List of days with toggles */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  flex: 1,
                  overflowY: "auto",
                }}
              >
                {correctionsList.map((day: { date: string; displayDate: string; hasStar: boolean; isProtected: boolean }) => (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      background: "rgba(255,255,255,0.8)",
                      borderRadius: "12px",
                      border: day.hasStar ? "2px solid #fbbf24" : "2px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "15px",
                        color: "#78350f",
                        fontWeight: "500",
                      }}
                    >
                      {day.displayDate}
                    </div>
                    <button
                      onClick={toggleDayStar({ days, bestStreak, dateToToggle: day.date })}
                      style={{
                        fontSize: "32px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px 8px",
                        borderRadius: "8px",
                        transition: "transform 0.1s ease",
                      }}
                      className="toggle-star-btn"
                    >
                      {ifElse(
                        day.hasStar,
                        <span style={{ filter: "drop-shadow(0 0 4px rgba(251, 191, 36, 0.5))" }}>⭐</span>,
                        ifElse(
                          day.isProtected,
                          <span style={{ opacity: 0.4, filter: "grayscale(50%)" }}>⭐</span>,
                          <span style={{ opacity: 0.3 }}>○</span>
                        )
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>,
            /* Main View - Daily Use */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "20px",
                gap: "16px",
              }}
            >
              {/* Header with goal name - tappable to edit */}
            <button
              onClick={enterSettings({ viewMode })}
              style={{
                textAlign: "center",
                paddingTop: "10px",
                background: "none",
                border: "none",
                cursor: "pointer",
                width: "100%",
              }}
            >
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                {goalName}
                <span style={{ fontSize: "14px", opacity: 0.5 }}>✏️</span>
              </div>
              {/* Show description if set */}
              {ifElse(
                goalDescription,
                <div
                  style={{
                    fontSize: "14px",
                    color: "#92400e",
                    marginTop: "4px",
                    fontStyle: "italic",
                  }}
                >
                  {goalDescription}
                </div>,
                null
              )}
            </button>

            {/* Streak display */}
            {ifElse(
              currentStreak,
              <div
                style={{
                  textAlign: "center",
                  padding: "12px",
                  background: "rgba(251, 191, 36, 0.2)",
                  borderRadius: "12px",
                  border: "2px solid #fbbf24",
                }}
              >
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: "bold",
                    color: "#d97706",
                  }}
                >
                  🔥 {currentStreak} day{ifElse(computed(() => (currentStreak as unknown as number) === 1), "", "s")}!
                </div>
                {ifElse(
                  bestStreak,
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#92400e",
                      marginTop: "4px",
                    }}
                  >
                    Best: {bestStreak} days
                  </div>,
                  null
                )}
              </div>,
              null
            )}

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
                  {/* Milestone celebration or regular message */}
                  {ifElse(
                    currentMilestone,
                    <div className="milestone-celebration" key={sparkleKey}>
                      <div
                        style={{
                          fontSize: "24px",
                          fontWeight: "bold",
                          color: "#d97706",
                          marginTop: "12px",
                          animation: "bounce 0.5s ease-out",
                        }}
                      >
                        {computed(() => {
                          const milestone = currentMilestone as unknown as { message: string } | null;
                          return milestone?.message || "Great job!";
                        })}
                      </div>
                      {/* Extra confetti sparkles for milestones */}
                      <div className="confetti-burst">
                        <div className="confetti c1">🎊</div>
                        <div className="confetti c2">✨</div>
                        <div className="confetti c3">🎊</div>
                        <div className="confetti c4">✨</div>
                      </div>
                    </div>,
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
                  )}
                </div>,
                <div>
                  {/* Single tap to add star */}
                  <button
                    onClick={placeStar({ days, bestStreak, lastCelebratedMilestone, sparkleKey, debugDate })}
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
                  {timeline.map((day: { date: string; displayDate: string; hasStar: boolean; isProtected: boolean; rotation: number }) => (
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

                      {/* Star (earned), protected star (dimmed), or empty circle */}
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
                        ifElse(
                          day.isProtected,
                          <div
                            style={{
                              fontSize: "36px",
                              lineHeight: "1",
                              opacity: 0.4,
                              filter: "grayscale(50%)",
                            }}
                            title="Protected day (streak saved!)"
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
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Link to corrections view */}
            <div style={{ textAlign: "center", paddingTop: "8px" }}>
              <button
                onClick={enterCorrections({ viewMode })}
                style={{
                  background: "none",
                  border: "none",
                  color: "#92400e",
                  fontSize: "13px",
                  cursor: "pointer",
                  textDecoration: "underline",
                  opacity: 0.7,
                }}
              >
                Edit past days...
              </button>
            </div>
            </div>
            )
          )}

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

            /* Milestone celebration animations */
            @keyframes bounce {
              0%, 100% {
                transform: translateY(0);
              }
              25% {
                transform: translateY(-10px);
              }
              50% {
                transform: translateY(0);
              }
              75% {
                transform: translateY(-5px);
              }
            }

            @keyframes confettiFloat {
              0% {
                transform: translate(0, 0) rotate(0deg) scale(1);
                opacity: 1;
              }
              100% {
                transform: translate(var(--tx), var(--ty)) rotate(360deg) scale(0);
                opacity: 0;
              }
            }

            .milestone-celebration {
              position: relative;
            }

            .confetti-burst {
              position: absolute;
              top: 0;
              left: 50%;
              transform: translateX(-50%);
              pointer-events: none;
            }

            .confetti {
              position: absolute;
              font-size: 20px;
              animation: confettiFloat 1.5s ease-out forwards;
            }

            .c1 { --tx: -40px; --ty: -60px; animation-delay: 0s; }
            .c2 { --tx: 40px; --ty: -50px; animation-delay: 0.1s; }
            .c3 { --tx: -30px; --ty: -70px; animation-delay: 0.2s; }
            .c4 { --tx: 50px; --ty: -40px; animation-delay: 0.3s; }

            /* Corrections view toggle button */
            .toggle-star-btn:active {
              transform: scale(0.9);
            }
          `}</style>
        </ct-screen>
      ),
      goalName,
      goalDescription,
      days,
      bestStreak,
      lastCelebratedMilestone,
      sparkleKey,
      viewMode,
      debugDate,
    };
  }
);

export default StarChart;
