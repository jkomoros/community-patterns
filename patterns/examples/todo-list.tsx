/// <cts-enable />
import { Cell, Default, NAME, pattern, UI } from "commontools";

/**
 * Example: Todo List Pattern
 *
 * This demonstrates:
 * - Working with arrays
 * - Bidirectional binding with $checked
 * - Adding/removing items
 * - Using Default<> for default values
 * - Using Cell.equals() to find items
 */

interface TodoItem {
  title: string;
  done: Default<boolean, false>;
}

interface TodoListInput {
  items: Cell<TodoItem[]>;
}

interface TodoListOutput {
  items: Cell<TodoItem[]>;
}

export default pattern<TodoListInput, TodoListOutput>(
  ({ items }) => {
    return {
      [NAME]: "Todo List Example",
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "600px", margin: "0 auto" }}>
          <h2 style={{ marginBottom: "1rem" }}>My Tasks</h2>

          {/* List of items */}
          <div style={{ marginBottom: "1rem" }}>
            {items.map((item) => (
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                {/* Bidirectional binding - checkbox automatically updates item.done */}
                <ct-checkbox $checked={item.done}>
                  <span
                    style={
                      item.done
                        ? { textDecoration: "line-through", color: "#999" }
                        : {}
                    }
                  >
                    {item.title}
                  </span>
                </ct-checkbox>

                {/* Remove button */}
                <button
                  onClick={() => {
                    const current = items.get();
                    const index = current.findIndex((el) => Cell.equals(item, el));
                    if (index >= 0) {
                      items.set(current.toSpliced(index, 1));
                    }
                  }}
                  style={{ marginLeft: "auto" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Add new item */}
          <ct-message-input
            placeholder="Add new task..."
            onct-send={(e: { detail: { message: string; }; }) => {
              const title = e.detail?.message?.trim();
              if (title) {
                items.push({ title, done: false });
              }
            }}
          />
        </div>
      ),
      items,
    };
  }
);
