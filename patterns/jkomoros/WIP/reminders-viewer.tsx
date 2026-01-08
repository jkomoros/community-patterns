/// <cts-enable />
/**
 * Reminders Viewer
 *
 * View your Reminders synced via apple-sync CLI.
 * Reminders are stored in the `reminders` input cell.
 *
 * To sync reminders, run:
 *   ./tools/apple-sync.ts reminders
 */
import {
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  Writable,
} from "commontools";

type CFC<T, C extends string> = T;
type Confidential<T> = CFC<T, "confidential">;

/**
 * A reminder item
 */
export type ReminderItem = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  isCompleted: boolean;
  completionDate: string | null;
  priority: number; // 0 = none, 1 = high, 5 = medium, 9 = low
  listName: string;
};

// Format a date for display
function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDay = new Date(date);
    dueDay.setHours(0, 0, 0, 0);

    const diffDays = Math.round(
      (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) {
      return `Overdue (${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? "s" : ""})`;
    } else if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Tomorrow";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "long" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  } catch {
    return dateStr;
  }
}

// Get priority label
function getPriorityLabel(priority: number): string {
  if (priority === 0) return "";
  if (priority <= 3) return "High";
  if (priority <= 6) return "Medium";
  return "Low";
}

// Get priority color
function getPriorityColor(priority: number): string {
  if (priority === 0) return "transparent";
  if (priority <= 3) return "#FF3B30"; // Red - High
  if (priority <= 6) return "#FF9500"; // Orange - Medium
  return "#007AFF"; // Blue - Low
}

// Get list color based on name
function getListColor(listName: string): string {
  const colors: Record<string, string> = {
    Personal: "#007AFF",
    Work: "#34C759",
    Shopping: "#FF9500",
    Home: "#5856D6",
    Family: "#FF2D55",
  };
  return colors[listName] || "#8E8E93";
}

// Check if date is overdue
function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  try {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  } catch {
    return false;
  }
}

// Group reminders by list
function groupByList(
  reminders: ReminderItem[]
): Map<string, ReminderItem[]> {
  const byList = new Map<string, ReminderItem[]>();
  for (const r of reminders) {
    if (!r || !r.listName) continue;
    const existing = byList.get(r.listName) || [];
    existing.push(r);
    byList.set(r.listName, existing);
  }
  return byList;
}

// Handler to select a reminder
const selectReminder = handler<
  unknown,
  { reminderId: string; selectedReminderId: Writable<string | null> }
>((_, { reminderId, selectedReminderId }) => {
  selectedReminderId.set(reminderId);
});

// Handler to go back to list
const backToList = handler<
  unknown,
  { selectedReminderId: Writable<string | null> }
>((_, { selectedReminderId }) => {
  selectedReminderId.set(null);
});

export default pattern<{
  reminders: Default<Confidential<ReminderItem[]>, []>;
}>(({ reminders }) => {
  const selectedReminderId = Writable.of<string | null>(null);

  const reminderCount = derive(
    reminders,
    (r: ReminderItem[]) => r?.filter((item) => item && !item.isCompleted)?.length ?? 0
  );

  // Get reminders grouped by list
  const remindersByList = derive(reminders, (r: ReminderItem[]) => {
    const byList = groupByList((r || []).filter((item) => item && !item.isCompleted));
    const groups: Array<{ listName: string; reminders: ReminderItem[] }> = [];

    for (const [listName, listReminders] of byList) {
      groups.push({
        listName,
        reminders: listReminders,
      });
    }

    // Sort groups alphabetically
    groups.sort((a, b) => a.listName.localeCompare(b.listName));

    return groups;
  });

  // Get selected reminder details
  const selectedReminder = derive(
    { reminders, selectedReminderId },
    ({
      reminders,
      selectedReminderId,
    }: {
      reminders: ReminderItem[];
      selectedReminderId: string | null;
    }) => {
      if (!selectedReminderId || !reminders) return null;
      return (
        reminders.find((r: ReminderItem) => r && r.id === selectedReminderId) || null
      );
    }
  );

  return {
    [NAME]: derive(
      reminderCount,
      (count: number) => `Reminders (${count} items)`
    ),
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
            derive(selectedReminderId, (id: string | null) => id !== null),
            <button
              onClick={backToList({ selectedReminderId })}
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
            <span style={{ fontSize: "24px" }}>Reminders</span>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {ifElse(
            derive(reminderCount, (c: number) => c === 0),
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
                Reminders
              </div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  marginBottom: "8px",
                }}
              >
                No Reminders Yet
              </div>
              <div style={{ fontSize: "14px", maxWidth: "300px" }}>
                Run the apple-sync CLI to import your reminders:
                <pre
                  style={{
                    backgroundColor: "#e0e0e0",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    marginTop: "12px",
                    fontSize: "12px",
                  }}
                >
                  ./tools/apple-sync.ts reminders
                </pre>
              </div>
            </div>,
            // Has reminders
            ifElse(
              derive(selectedReminderId, (id: string | null) => id === null),
              // Reminder list view (grouped by list)
              <div>
                {derive(remindersByList, (groups) =>
                  groups.map((group, groupIdx: number) => (
                    <div key={groupIdx}>
                      {/* List header */}
                      <div
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#e8e8e8",
                          fontWeight: "600",
                          fontSize: "14px",
                          color: "#666",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "4px",
                            backgroundColor: getListColor(group.listName),
                          }}
                        />
                        {group.listName} ({group.reminders.length})
                      </div>
                      {/* Reminders for this list */}
                      {group.reminders.map((r, idx: number) => (
                        <div
                          key={idx}
                          onClick={selectReminder({
                            reminderId: r.id,
                            selectedReminderId,
                          })}
                          style={{
                            padding: "12px 16px",
                            backgroundColor: "#fff",
                            borderBottom: "1px solid #f0f0f0",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "12px",
                          }}
                        >
                          {/* Checkbox circle */}
                          <div
                            style={{
                              width: "22px",
                              height: "22px",
                              borderRadius: "11px",
                              border: `2px solid ${getListColor(r.listName)}`,
                              flexShrink: 0,
                              marginTop: "2px",
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: "500",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              {r.title}
                              {r.priority > 0 && (
                                <span
                                  style={{
                                    fontSize: "11px",
                                    color: getPriorityColor(r.priority),
                                    fontWeight: "600",
                                  }}
                                >
                                  {getPriorityLabel(r.priority)}
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: "13px",
                                color: "#666",
                                marginTop: "2px",
                              }}
                            >
                              {r.notes && r.notes.length > 50 ? r.notes.substring(0, 50) + "..." : (r.notes || "")}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: isOverdue(r.dueDate)
                                  ? "#FF3B30"
                                  : "#999",
                                marginTop: "4px",
                              }}
                            >
                              {r.dueDate ? formatDueDate(r.dueDate) : ""}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>,
              // Reminder detail view
              <div style={{ padding: "20px", backgroundColor: "#fff" }}>
                {derive(selectedReminder, (r: ReminderItem | null) =>
                  r ? (
                    <div>
                      {/* List indicator */}
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
                            backgroundColor: getListColor(r.listName),
                          }}
                        />
                        <span style={{ color: "#666" }}>{r.listName}</span>
                        {r.priority > 0 && (
                          <span
                            style={{
                              fontSize: "12px",
                              color: getPriorityColor(r.priority),
                              fontWeight: "600",
                              marginLeft: "auto",
                            }}
                          >
                            {getPriorityLabel(r.priority)} Priority
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <div
                        style={{
                          margin: "0 0 16px 0",
                          fontSize: "24px",
                          fontWeight: "bold",
                        }}
                      >
                        {r.title}
                      </div>

                      {/* Due Date */}
                      <div style={{ marginBottom: "16px" }}>
                        <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                          Due Date
                        </div>
                        <div
                          style={{
                            color: r.dueDate && isOverdue(r.dueDate) ? "#FF3B30" : "#666",
                          }}
                        >
                          {r.dueDate
                            ? formatDueDate(r.dueDate)
                            : "No due date"}
                        </div>
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
                          {r.notes || "No notes"}
                        </div>
                      </div>

                      {/* Status */}
                      <div style={{ marginBottom: "16px" }}>
                        <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                          Status
                        </div>
                        <div style={{ color: "#666" }}>
                          {r.isCompleted ? "Completed" : "Incomplete"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>Reminder not found</div>
                  )
                )}
              </div>
            )
          )}
        </div>
      </ct-screen>
    ),
    reminders,
  };
});
