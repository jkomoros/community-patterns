/// <cts-enable />
/**
 * WISH DEBUG
 *
 * Debug pattern to understand why wish({ tag: "#googleAuth" }) fails
 * even when favorites-debug shows the tag is present
 */
import { Writable, computed, NAME, pattern, UI, wish } from "commontools";

type Favorite = { cell: Writable<unknown>; tag: string };

export default pattern<Record<string, never>>((_) => {
  // Try to wish for #googleAuth - this is what wish-auth-test does
  const googleAuthWish = wish<{ auth: unknown }>({ query: "#googleAuth" });

  // Also get the raw favorites list for comparison
  const favoritesWish = wish<Array<Favorite>>({ query: "#favorites" });

  return {
    [NAME]: "Wish Debug",
    [UI]: (
      <div style={{ padding: "20px", maxWidth: "800px" }}>
        <h2 style={{ marginTop: 0 }}>Wish Debug</h2>

        <h3>1. wish for #googleAuth:</h3>
        <div style={{
          padding: "15px",
          backgroundColor: "#f5f5f5",
          borderRadius: "4px",
          marginBottom: "20px",
        }}>
          <div>Error: {googleAuthWish.error ?? "(none)"}</div>
          <div>Has result: {computed(() => googleAuthWish?.result ? "YES" : "NO")}</div>
          <pre style={{ fontSize: "12px", overflow: "auto" }}>
            {computed(() => JSON.stringify(googleAuthWish, (k, v) => k === "$UI" ? "[omit]" : v, 2))}
          </pre>
        </div>

        <h3>2. Favorites list (for comparison):</h3>
        <div style={{
          padding: "15px",
          backgroundColor: "#f5f5f5",
          borderRadius: "4px",
        }}>
          <div>Count: {computed(() => favoritesWish?.result?.length ?? 0)}</div>
          <div>
            {favoritesWish.result?.map((fav, i) => (
              <div style={{ margin: "10px 0", padding: "10px", backgroundColor: "#e0e0e0", borderRadius: "4px" }}>
                <div><strong>Favorite {i}:</strong></div>
                <div>Tag contains "googleauth": {computed(() => String(fav?.tag?.toLowerCase().includes("googleauth") ?? false))}</div>
                <div>Tag length: {computed(() => fav?.tag?.length ?? 0)}</div>
              </div>
            ))}
          </div>
        </div>

        <h3>3. Analysis:</h3>
        <div style={{
          padding: "15px",
          backgroundColor: "#ffffcc",
          borderRadius: "4px",
        }}>
          {computed(() => {
            try {
              const favorites = favoritesWish?.result;
              if (!favorites) return "No favorites result";
              if (!Array.isArray(favorites)) return `Favorites is not array: ${typeof favorites}`;

              // Check each favorite
              const checks = favorites.map((f, i) => {
                if (!f) return `[${i}] null`;
                const tag = f?.tag;
                if (typeof tag !== 'string') return `[${i}] tag not string: ${typeof tag}`;
                const hasGoogleAuth = tag.toLowerCase().includes("googleauth");
                return `[${i}] tag is string (${tag.length} chars), includes googleauth: ${hasGoogleAuth}`;
              });

              const matchingFav = favorites.find((f) => {
                if (!f) return false;
                const tag = f?.tag;
                if (typeof tag !== 'string') return false;
                return tag.toLowerCase().includes("googleauth");
              });

              if (matchingFav) {
                return `FOUND! Tag starts with: ${matchingFav.tag?.substring(0, 100)}...\n\nAll checks:\n${checks.join('\n')}`;
              }
              return `NOT FOUND. All checks:\n${checks.join('\n')}`;
            } catch (e) {
              return `Error: ${e}`;
            }
          })}
        </div>
      </div>
    ),
  };
});
