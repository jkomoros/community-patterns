/// <cts-enable />
/**
 * Repro: @ Reference Support for OpaqueRef Arrays
 *
 * Tests whether wish("#mentionable") + ct-prompt-input enables @ referencing.
 *
 * CLAIM: After page refresh in dev spaces, @ mentions should show dropdown
 * with available charms, and onct-send receives mentions array.
 */
import { Cell, Default, handler, NAME, OpaqueRef, pattern, UI, wish } from "commontools";

interface Item {
  name: string;
}

interface Input {
  items: Default<OpaqueRef<Item>[], []>;
  lastAction: Default<string, "none">;
}

interface Output {
  [NAME]: string;
  [UI]: JSX.Element;
  items: Cell<OpaqueRef<Item>[]>;
}

const AtReferenceTest = pattern<Input, Output>(
  ({ items, lastAction }) => {
    // Get mentionable charms for @ references
    const mentionable = wish<any[]>("#mentionable");

    // Handler for adding via @ mentions
    const addMentions = handler<
      {
        detail: {
          text: string;
          mentions: Array<any>;
        };
      },
      {
        items: Cell<OpaqueRef<Item>[]>;
        lastAction: Cell<string>;
      }
    >(({ detail }, { items, lastAction }) => {
      const { mentions, text } = detail;

      lastAction.set(`Received: text="${text}", mentions=${mentions?.length || 0}`);

      if (mentions && mentions.length > 0) {
        const currentItems = items.get();
        const newItems = mentions.filter((mention: any) => {
          // Dedup using .equals() as superstition describes
          return !currentItems.some((existing) => {
            if (typeof existing === 'object' && 'equals' in existing) {
              return (existing as any).equals(mention);
            }
            return false;
          });
        });

        if (newItems.length > 0) {
          items.set([...currentItems, ...newItems]);
          lastAction.set(`Added ${newItems.length} new item(s)`);
        } else {
          lastAction.set(`All ${mentions.length} mention(s) already in list`);
        }
      }
    });

    return {
      [NAME]: "@ Reference Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>@ Reference Test</h2>

          <div style={{ marginBottom: "20px", padding: "15px", background: "#f5f5f5", borderRadius: "8px" }}>
            <h3>Instructions:</h3>
            <ol>
              <li>Refresh page once after first deploy (BacklinksIndex needs to populate)</li>
              <li>Type "@" in the input below</li>
              <li>A dropdown should appear with available charms</li>
              <li>Select a charm and press Send</li>
              <li>The charm should be added to the list below</li>
            </ol>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <strong>Mentionable count:</strong> {mentionable.length}
            <span style={{ color: "#666", marginLeft: "10px" }}>
              (If 0, refresh the page)
            </span>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <ct-prompt-input
              placeholder="Type @ to mention charms..."
              $mentionable={mentionable}
              onct-send={addMentions({ items, lastAction })}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <strong>Last action:</strong> {lastAction}
          </div>

          <div>
            <h3>Added Items ({items.length}):</h3>
            {items.length === 0 ? (
              <p style={{ color: "#666" }}>No items yet. Use @ mention to add.</p>
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

export default AtReferenceTest;
