/// <cts-enable />
/**
 * FAVORITES DEBUG
 *
 * Debug pattern to see what's actually in the favorites list
 * Following the same approach as favorites-manager.tsx from labs
 */
import { Writable, computed, NAME, pattern, UI, wish } from "commontools";

// Match the labs favorites-manager type (but use 'tag' since that's what the schema says)
type Favorite = { cell: Writable<{ [NAME]?: string }>; tag: string };

export default pattern<Record<string, never>>((_) => {
  // Wish for the raw favorites list - same as favorites-manager.tsx
  const wishResult = wish<Array<Favorite>>({ query: "#favorites" });

  return {
    [NAME]: "Favorites Debug",
    [UI]: (
      <div style={{ padding: "20px", maxWidth: "800px" }}>
        <h2 style={{ marginTop: 0 }}>Favorites Debug</h2>

        <h3>Favorites (direct access like favorites-manager):</h3>
        <div>
          {wishResult.result?.map((item, i) => (
            <div style={{
              padding: "10px",
              margin: "10px 0",
              backgroundColor: "#f5f5f5",
              borderRadius: "4px",
            }}>
              <div><strong>Entry {i}:</strong></div>
              <div>Cell: <ct-cell-link $cell={item.cell} /></div>
              <div>Tag value: "{item.tag}"</div>
              <div>Tag length: {computed(() => item?.tag?.length ?? 0)}</div>
              <div>Has googleAuth: {computed(() => String(item?.tag?.toLowerCase().includes("googleauth") ?? false))}</div>
              <div>Has note: {computed(() => String(item?.tag?.toLowerCase().includes("note") ?? false))}</div>
            </div>
          ))}
        </div>

        <h3>Error (if any):</h3>
        <pre style={{
          backgroundColor: "#ffeeee",
          padding: "10px",
          borderRadius: "4px",
        }}>
          {wishResult.error ?? "(no error)"}
        </pre>

        <h3>Raw wishResult structure:</h3>
        <pre style={{
          backgroundColor: "#f5f5f5",
          padding: "15px",
          borderRadius: "4px",
          overflow: "auto",
          fontSize: "12px",
          maxHeight: "300px",
        }}>
          {computed(() => {
            try {
              return JSON.stringify(wishResult, (key, value) => {
                // Skip $UI to avoid circular refs
                if (key === "$UI") return "[UI omitted]";
                return value;
              }, 2);
            } catch (e) {
              return `Stringify error: ${e}`;
            }
          })}
        </pre>
      </div>
    ),
  };
});
