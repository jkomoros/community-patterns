/// <cts-enable />
/**
 * FAVORITES DEBUG
 *
 * Debug pattern to see what's actually in the favorites list
 * Following the same approach as favorites-manager.tsx from labs
 */
import { computed, NAME, pattern, UI, wish, Writable } from "commonfabric";

// Match the labs favorites-manager type (but use 'tag' since that's what the schema says)
type Favorite = { cell: Writable<{ [NAME]?: string }>; tag: string };

const containerStyle = { padding: "20px", maxWidth: "800px" };
const entryStyle = {
  padding: "10px",
  margin: "10px 0",
  backgroundColor: "#f5f5f5",
  borderRadius: "4px",
};
const errorStyle = {
  backgroundColor: "#ffeeee",
  padding: "10px",
  borderRadius: "4px",
};
const rawStyle = {
  backgroundColor: "#f5f5f5",
  padding: "15px",
  borderRadius: "4px",
  overflow: "auto",
  fontSize: "12px",
  maxHeight: "300px",
};

// Skip $UI to avoid circular refs when stringifying.
const stringifyReplacer = (key: string, value: unknown) =>
  key === "$UI" ? "[UI omitted]" : value;

const tagIncludes = (item: Favorite | undefined, needle: string) =>
  String(item?.tag?.toLowerCase().includes(needle) ?? false);

export default pattern<Record<string, never>>((_) => {
  // Wish for the raw favorites list - same as favorites-manager.tsx
  const wishResult = wish<Array<Favorite>>({ query: "#favorites" });

  return {
    [NAME]: "Favorites Debug",
    [UI]: (
      <div style={containerStyle}>
        <h2 style={{ marginTop: 0 }}>Favorites Debug</h2>

        <h3>Favorites (direct access like favorites-manager):</h3>
        <div>
          {wishResult.result?.map((item, i) => (
            <div key={i} style={entryStyle}>
              <div>
                <strong>Entry {i}:</strong>
              </div>
              <div>
                Cell: <cf-cell-link $cell={item.cell} />
              </div>
              <div>Tag value: "{item.tag}"</div>
              <div>Tag length: {computed(() => item?.tag?.length ?? 0)}</div>
              <div>
                Has googleAuth:{" "}
                {computed(() => tagIncludes(item, "googleauth"))}
              </div>
              <div>
                Has note: {computed(() => tagIncludes(item, "note"))}
              </div>
            </div>
          ))}
        </div>

        <h3>Error (if any):</h3>
        <pre style={errorStyle}>
          {wishResult.error ?? "(no error)"}
        </pre>

        <h3>Raw wishResult structure:</h3>
        <pre style={rawStyle}>
          {computed(() => {
            try {
              return JSON.stringify(wishResult, stringifyReplacer, 2);
            } catch (e) {
              return `Stringify error: ${e}`;
            }
          })}
        </pre>
      </div>
    ),
  };
});
