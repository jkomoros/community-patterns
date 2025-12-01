/// <cts-enable />
import { Cell, Default, handler, ifElse, NAME, pattern, UI } from "commontools";

/**
 * Debug Date Picker
 *
 * A simple date picker for debugging patterns that need date override capability.
 * Exports a `date` string in YYYY-MM-DD format that can be linked to other charms.
 *
 * ## Usage
 *
 * 1. Deploy the charm you want to debug (e.g., Star Chart)
 * 2. Deploy this date picker linked to the target charm's debug input:
 *
 *    deno task ct charm new debug-date-picker.tsx --api-url http://localhost:8000 \
 *      --identity ../../claude.key --space jkomoros-test \
 *      --argument "date=/jkomoros-test/<target-charm-id>/debugDate"
 *
 * 3. Open both charms - changes to the date picker will update the target charm
 *
 * ## Clearing
 *
 * Click "Use Real Date" to clear the override (sets date to empty string).
 */

interface DatePickerInput {
  date: Cell<Default<string, "">>;
}

interface DatePickerOutput {
  date: Cell<Default<string, "">>;
}

// Helper to get today's date as YYYY-MM-DD (local timezone)
function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Handler to set date to today
const setToday = handler<unknown, { date: Cell<string> }>((_, { date }) => {
  date.set(getTodayString());
});

// Handler to clear date (use real date)
const clearDate = handler<unknown, { date: Cell<string> }>((_, { date }) => {
  date.set("");
});

export default pattern<DatePickerInput, DatePickerOutput>(({ date }) => {
  return {
    [NAME]: "Debug Date Picker",
    [UI]: (
      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "20px",
          maxWidth: "300px",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            color: "#374151",
            marginBottom: "12px",
          }}
        >
          Debug Date Override
        </div>

        <ct-input
          type="date"
          $value={date}
          style={{
            width: "100%",
            marginBottom: "12px",
          }}
        />

        <div
          style={{
            display: "flex",
            gap: "8px",
          }}
        >
          <button
            onClick={setToday({ date })}
            style={{
              flex: 1,
              padding: "8px",
              fontSize: "14px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Set Today
          </button>
          <button
            onClick={clearDate({ date })}
            style={{
              flex: 1,
              padding: "8px",
              fontSize: "14px",
              background: "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Use Real Date
          </button>
        </div>

        <div
          style={{
            marginTop: "16px",
            padding: "12px",
            background: "#f3f4f6",
            borderRadius: "6px",
            fontSize: "12px",
            color: "#6b7280",
          }}
        >
          <div style={{ marginBottom: "4px" }}>
            <strong>Current value:</strong>
          </div>
          <code style={{ color: "#1f2937" }}>{ifElse(date, date, "(empty - using real date)")}</code>
        </div>
      </div>
    ),
    date,
  };
});
