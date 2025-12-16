/// <cts-enable />
import { Cell, computed, Default, handler, NAME, patternTool, pattern, UI } from "commontools";

interface ShoppingItem {
  title: string;
  done: Default<boolean, false>;
}

interface InputSchema {
  title: Default<string, "untitled">;
  items: Default<ShoppingItem[], []>;
}

/** Shopping list with checkable items. #shoppingList */
interface Output {
  title: string;
  items: ShoppingItem[];
  totalCount: number;
  doneCount: number;
}

type InputEventType = {
  detail: {
    message: string;
  };
};

interface ListState {
  items: Cell<ShoppingItem[]>;
}

const addItem = handler<InputEventType, ListState>(
  (event: InputEventType, state: ListState) => {
    state.items.push({ title: event.detail.message, done: false });
  },
);

const removeItem = handler<
  unknown,
  { items: Cell<Array<Cell<ShoppingItem>>>; item: Cell<ShoppingItem> }
>((_event, { items, item }) => {
  items.remove(item);
});

const updateItem = handler<
  { detail: { value: string } },
  { items: Cell<ShoppingItem[]>; index: number }
>(({ detail: { value } }, { items, index }) => {
  const itemsCopy = items.get().slice();
  if (index >= 0 && index < itemsCopy.length) {
    itemsCopy[index] = { title: value, done: itemsCopy[index].done };
    items.set(itemsCopy);
  }
});

export default pattern<InputSchema, Output>(
  ({ title, items }) => {
    // Computed values
    const totalCount = computed(() => items.length);
    const doneCount = computed(() => items.filter(item => item.done).length);

    // Create a search tool for omnibot - takes a query parameter
    const searchItems = patternTool(
      ({ items, query }: { items: ShoppingItem[], query: string }) => {
        return computed(() =>
          items.filter((item: ShoppingItem) =>
            item.title.toLowerCase().includes(query.toLowerCase())
          )
        );
      },
      { items }  // Only supply items, query becomes a tool parameter
    );

    // Create an add item tool for omnibot - takes itemText parameter
    const addItemForOmnibot = handler<
      { itemText: string },
      { items: Cell<ShoppingItem[]> }
    >(({ itemText }, { items }) => {
      if (itemText && itemText.trim()) {
        items.push({ title: itemText.trim(), done: false });
      }
    });

    return {
      [NAME]: title,
      [UI]: (
        <div style={{ padding: "1rem", maxWidth: "600px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <span style={{ fontSize: "13px", color: "#666" }}>
              {doneCount} / {totalCount} done
            </span>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {items.map((item, index) => (
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <ct-checkbox $checked={item.done} />
                <div style={{ flex: 1 }}>
                  <ct-input
                    value={item.title}
                    onct-change={updateItem({ items, index })}
                    placeholder="Enter item..."
                  />
                </div>
                <ct-button
                  variant="destructive"
                  size="sm"
                  onClick={removeItem({ items, item })}
                >
                  Remove
                </ct-button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <ct-message-input
              placeholder="Type a message..."
              appearance="rounded"
              onct-send={addItem({ items })}
            />
          </div>
        </div>
      ),
      title,
      items,  // Omnibot can read this directly
      totalCount,
      doneCount,
      addItem: addItem({ items }),
      addItemForOmnibot: addItemForOmnibot({ items }),  // Omnibot can use this to add items
      updateItem,
      searchItems,  // Omnibot can use this as a parametrized tool
    };
  },
);
