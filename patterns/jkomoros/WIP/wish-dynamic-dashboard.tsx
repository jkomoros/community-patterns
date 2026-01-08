/// <cts-enable />
import {
  Writable,
  computed,
  Default,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";

/**
 * Dynamic Dashboard
 *
 * The ultimate demo of open-ended wish() capability.
 * Users can type what they want to see, and the AI finds/creates
 * appropriate patterns to display.
 *
 * Each "widget" is created by a wish() call, so the dashboard
 * dynamically composes patterns based on user requests.
 */

interface DashboardWidget {
  id: string;
  query: string;
  addedAt: string;
}

interface DynamicDashboardInput {
  widgets: Default<DashboardWidget[], []>;
}

const addWidget = handler<
  { detail: { message: string } },
  { widgets: Writable<DashboardWidget[]> }
>((event, { widgets }) => {
  const query = event.detail?.message?.trim();
  if (query) {
    const newWidget: DashboardWidget = {
      id: `widget-${Date.now()}`,
      query,
      addedAt: new Date().toISOString(),
    };
    widgets.set([...widgets.get(), newWidget]);
  }
});

const removeWidget = handler<
  unknown,
  { widgets: Writable<DashboardWidget[]>; id: string }
>((_event, { widgets, id }) => {
  const current = widgets.get();
  widgets.set(current.filter(w => w.id !== id));
});

const clearAllWidgets = handler<
  unknown,
  { widgets: Writable<DashboardWidget[]> }
>((_event, { widgets }) => {
  widgets.set([]);
});

// A single widget component that wishes for content
const DashboardWidgetView = pattern<{ widget: DashboardWidget; onRemove: () => void }>(
  ({ widget, onRemove }) => {
    // Each widget has its own wish based on its query
    const wishResult = wish<{ cell: Writable<any> }>({
      query: widget.query,
      context: {
        dashboardWidget: true,
        widgetId: widget.id,
      },
    });

    const isLoading = computed(() => !wishResult || (!wishResult.result && !wishResult.error));

    return {
      [NAME]: computed(() => `Widget: ${widget.query.slice(0, 20)}...`),
      [UI]: (
        <div style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          backgroundColor: "#fff",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: "200px",
        }}>
          {/* Widget header */}
          <div style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#f5f5f5",
            borderBottom: "1px solid #ddd",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{
              fontSize: "0.85rem",
              fontWeight: "600",
              color: "#333",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "80%",
            }}>
              {widget.query}
            </span>
            <button
              onClick={onRemove}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "1.2rem",
                color: "#999",
                padding: "0",
                lineHeight: "1",
              }}
              title="Remove widget"
            >
              ×
            </button>
          </div>

          {/* Widget content */}
          <div style={{
            flex: 1,
            padding: "1rem",
            overflow: "auto",
          }}>
            <ct-cell-context $cell={wishResult} label={widget.query}>
              {ifElse(
                isLoading,
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#666",
                }}>
                  <ct-loader size="md" show-elapsed></ct-loader>
                  <span style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                    Finding patterns...
                  </span>
                </div>,
                computed(() => {
                  const r = wishResult;
                  if (!r) return <span>No result</span>;
                  if (r.error) {
                    return (
                      <div style={{ color: "#dc3545", fontSize: "0.9rem" }}>
                        <strong>Error:</strong> {r.error}
                      </div>
                    );
                  }
                  // Show the result from the wish
                  return r.result ?? r;
                })
              )}
            </ct-cell-context>
          </div>
        </div>
      ),
      wishResult,
    };
  }
);

export default pattern<DynamicDashboardInput>(({ widgets }) => {
  const widgetCount = computed(() => widgets.length);

  return {
    [NAME]: computed(() => `Dynamic Dashboard (${widgetCount} widgets)`),
    [UI]: (
      <div style={{ padding: "1rem", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}>
          <h2 style={{ margin: 0 }}>Dynamic Dashboard</h2>
          {ifElse(
            widgetCount > 0,
            <button
              onClick={clearAllWidgets({ widgets })}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "#dc3545",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Clear All
            </button>,
            null
          )}
        </div>

        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          Type what you want to see. The AI will find or create appropriate patterns to display.
          Each widget runs its own wish() to discover content dynamically.
        </p>

        {/* Add widget input */}
        <div style={{
          marginBottom: "2rem",
          padding: "1rem",
          backgroundColor: "#e7f3ff",
          border: "1px solid #b3d7ff",
          borderRadius: "8px",
        }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>
            Add a widget:
          </label>
          <ct-message-input
            placeholder="Try: a counter, a todo list, a poem about code..."
            onct-send={addWidget({ widgets })}
          />
        </div>

        {/* Widget grid */}
        {ifElse(
          widgetCount === 0,
          <div style={{
            padding: "3rem",
            textAlign: "center",
            color: "#666",
            backgroundColor: "#f9f9f9",
            borderRadius: "8px",
            border: "2px dashed #ddd",
          }}>
            <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
              No widgets yet
            </p>
            <p style={{ fontSize: "0.9rem" }}>
              Type a request above to add your first widget
            </p>
          </div>,
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
            gap: "1rem",
          }}>
            {widgets.map((widget) => (
              <DashboardWidgetView
                widget={widget}
                onRemove={removeWidget({ widgets, id: widget.id })}
              />
            ))}
          </div>
        )}

        {/* Examples */}
        <div style={{
          marginTop: "2rem",
          padding: "1rem",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
        }}>
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Example queries to try:</h3>
          <ul style={{ margin: 0, paddingLeft: "1.5rem", color: "#666" }}>
            <li>"a simple counter"</li>
            <li>"a todo list for my groceries"</li>
            <li>"a note-taking area"</li>
            <li>"show me some inspirational text"</li>
            <li>"a calculator"</li>
          </ul>
        </div>
      </div>
    ),
    widgets,
  };
});
