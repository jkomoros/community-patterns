/// <cts-enable />
/**
 * FAVORITES VIEWER
 *
 * View all your favorited charms across spaces.
 * Shows charm name, tag, and provides links to each charm.
 *
 * Note: Links to charms in other spaces may not work until
 * navigateTo supports multi-space navigation.
 */
import { Cell, derive, NAME, pattern, UI, wish } from "commontools";

// Favorites can have either 'tag' or 'description' field depending on version
type Favorite = { cell: Cell<{ [NAME]?: string }>; tag?: string; description?: string };

// Helper to safely get the tag/description from a favorite
function getTag(fav: Favorite | undefined): string {
  if (!fav) return "";
  return fav.tag ?? fav.description ?? "";
}

// Helper to extract primary hashtag from a tag string
function getPrimaryTag(tagStr: string): string {
  const match = tagStr.match(/#\w+/);
  return match ? match[0] : "(no tag)";
}

export default pattern<Record<string, never>>((_) => {
  const wishResult = wish<Array<Favorite>>({ tag: "#favorites" });

  const favoriteCount = derive(
    wishResult,
    (wr) => wr?.result?.length ?? 0,
  );

  // Simple list - don't group to avoid async issues with tag loading
  const favorites = derive(wishResult, (wr) => wr?.result ?? []);

  return {
    [NAME]: "⭐ Favorites",
    [UI]: (
      <div
        style={{
          padding: "20px",
          maxWidth: "600px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <span style={{ fontSize: "32px" }}>⭐</span>
          <div>
            <h2 style={{ margin: 0 }}>Your Favorites</h2>
            <div style={{ color: "#666", fontSize: "14px" }}>
              {favoriteCount} favorited charm{derive(favoriteCount, (c) => c === 1 ? "" : "s")}
            </div>
          </div>
        </div>

        {derive(wishResult, (wr) =>
          wr?.error
            ? (
              <div
                style={{
                  padding: "15px",
                  backgroundColor: "#fff3cd",
                  border: "1px solid #ffc107",
                  borderRadius: "8px",
                  color: "#856404",
                }}
              >
                ⚠️ {wr.error}
              </div>
            )
            : null
        )}

        {derive(favoriteCount, (count) =>
          count === 0
            ? (
              <div
                style={{
                  padding: "30px",
                  textAlign: "center",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "8px",
                  color: "#666",
                }}
              >
                <div style={{ fontSize: "48px", marginBottom: "10px" }}>☆</div>
                <div>No favorites yet!</div>
                <div style={{ fontSize: "14px", marginTop: "10px" }}>
                  Click the ☆ button on any charm to add it to your favorites.
                </div>
              </div>
            )
            : null
        )}

        {favorites.map((fav) => (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px",
              margin: "8px 0",
              backgroundColor: "#fff",
              border: "1px solid #dee2e6",
              borderRadius: "8px",
            }}
          >
            <span style={{ fontSize: "20px" }}>⭐</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: "500" }}>
                <ct-cell-link $cell={fav.cell} />
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#888",
                  marginTop: "4px",
                  fontFamily: "monospace",
                }}
              >
                {derive(fav, (f) => getPrimaryTag(getTag(f)))}
              </div>
            </div>
          </div>
        ))}

        <div
          style={{
            marginTop: "30px",
            padding: "15px",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#666",
          }}
        >
          <strong>💡 Tip:</strong> Favorites are stored in your home space and
          shared across all your spaces. Patterns can use{" "}
          <code style={{ backgroundColor: "#e9ecef", padding: "2px 6px", borderRadius: "3px" }}>
            wish({"{"} tag: "#tagName" {"}"})
          </code>{" "}
          to discover favorited charms automatically.
        </div>
      </div>
    ),
  };
});
