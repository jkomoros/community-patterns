/// <cts-enable />
/**
 * Repro: @ Reference with ct-code-editor
 *
 * Tests whether ct-code-editor's onbacklink-create provides actual Cell references.
 * Uses [[ wiki-link syntax (not @).
 *
 * CLAIM: onbacklink-create receives detail.charm as Cell reference
 */
import { Cell, Default, handler, NAME, OpaqueRef, pattern, UI, wish } from "commontools";

interface Item {
  name: string;
}

interface Input {
  items: Default<OpaqueRef<Item>[], []>;
  editorText: Default<string, "">;
  lastAction: Default<string, "none">;
}

interface Output {
  [NAME]: string;
  [UI]: JSX.Element;
  items: Cell<OpaqueRef<Item>[]>;
}

const CodeEditorBacklinkTest = pattern<Input, Output>(
  ({ items, editorText, lastAction }) => {
    // Get mentionable charms for [[ references
    const mentionable = wish<any[]>("#mentionable");
    // Track mentioned items
    const mentioned = Cell.of<any[]>([]);

    // Handler for backlink-create event (ct-code-editor specific)
    const handleBacklinkCreate = handler<
      {
        detail: {
          text: string;
          charmId: any;
          charm: Cell<any>;  // This should be the actual Cell ref
          navigate: boolean;
        };
      },
      {
        items: Cell<OpaqueRef<Item>[]>;
        lastAction: Cell<string>;
      }
    >(({ detail }, { items, lastAction }) => {
      const { text, charmId, charm } = detail;

      lastAction.set(`backlink-create: text="${text}", charmId=${charmId}, hasCharm=${!!charm}`);

      if (charm) {
        const currentItems = items.get();
        // Check if already in list using .equals()
        const alreadyExists = currentItems.some((existing) => {
          if (typeof existing === 'object' && 'equals' in existing) {
            return (existing as any).equals(charm);
          }
          return false;
        });

        if (!alreadyExists) {
          items.set([...currentItems, charm as any]);
          lastAction.set(`Added charm: "${text}"`);
        } else {
          lastAction.set(`Charm "${text}" already in list`);
        }
      }
    });

    return {
      [NAME]: "Code Editor Backlink Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>ct-code-editor Backlink Test</h2>

          <div style={{ marginBottom: "20px", padding: "15px", background: "#f5f5f5", borderRadius: "8px" }}>
            <h3>Instructions:</h3>
            <ol>
              <li>Type <code>[[</code> in the editor below (wiki-link syntax)</li>
              <li>A dropdown should appear with available charms</li>
              <li>Select a charm</li>
              <li>The charm should be added to the list below</li>
            </ol>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <strong>Mentionable count:</strong> {mentionable.length}
          </div>

          <div style={{ marginBottom: "20px", border: "1px solid #ccc", borderRadius: "4px" }}>
            <ct-code-editor
              $value={editorText}
              $mentionable={mentionable}
              $mentioned={mentioned}
              onbacklink-create={handleBacklinkCreate({ items, lastAction })}
              placeholder="Type [[ to mention charms..."
              language="text/markdown"
              theme="light"
              wordWrap
              style="min-height: 100px;"
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <strong>Last action:</strong> {lastAction}
          </div>

          <div>
            <h3>Added Items ({items.length}):</h3>
            {items.length === 0 ? (
              <p style={{ color: "#666" }}>No items yet. Use [[ to add.</p>
            ) : (
              items.map((item, index) => (
                <div
                  key={index}
                  style={{
                    padding: "10px",
                    margin: "5px 0",
                    background: "#e8f5e9",
                    borderRadius: "4px",
                  }}
                >
                  Item {index + 1}: {item.name || "(loading...)"}
                </div>
              ))
            )}
          </div>
        </div>
      ),
      items,
    };
  }
);

export default CodeEditorBacklinkTest;
