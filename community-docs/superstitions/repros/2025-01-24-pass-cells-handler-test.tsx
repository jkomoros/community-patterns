/// <cts-enable />
/**
 * Repro: Pass Cells as Handler Params vs Closure
 *
 * Testing with `pattern` and default items
 */
import { Cell, Default, handler, NAME, pattern, UI } from "commontools";

interface Item {
  id: number;
  name: string;
}

interface Input {
  selectedId: Default<number, 0>;
  items: Default<Item[], [
    { id: 1, name: "Apple" },
    { id: 2, name: "Banana" },
    { id: 3, name: "Cherry" }
  ]>;
}

interface Output {
  [NAME]: string;
  [UI]: JSX.Element;
}

const CellHandlerTest = pattern<Input, Output>(
  ({ selectedId, items }) => {
    // CRITICAL: Save Cell reference BEFORE entering .map() context
    const selectedIdCell = selectedId;

    // Handler that takes the saved Cell reference
    const selectItem = handler<
      unknown,
      { id: number; selectedCell: Cell<number> }
    >((_, { id, selectedCell }) => {
      selectedCell.set(id);
    });

    return {
      [NAME]: "Cell Handler Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>Cell Handler Parameter Test</h2>
          <p>
            Current selection: <strong>{selectedId}</strong>
          </p>

          <div>
            <h3>Click to Select:</h3>
            {items.map((item) => (
              <button
                key={item.id}
                onClick={selectItem({ id: item.id, selectedCell: selectedIdCell })}
                style={{
                  display: "block",
                  margin: "8px 0",
                  padding: "12px 24px",
                  backgroundColor: "#f0f0f0",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "16px",
                }}
              >
                {item.name} (id: {item.id})
              </button>
            ))}
          </div>

          <p style={{ marginTop: "20px", color: "#666" }}>
            Click buttons and watch "Current selection" above change
          </p>
        </div>
      ),
    };
  }
);

export default CellHandlerTest;
