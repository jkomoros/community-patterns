/// <cts-enable />
/**
 * MINIMAL REPRO: Self-Referential Wish + Merge Loop (CT-1098)
 *
 * This is a minimal reproduction of the infinite loop issue discovered
 * in hotel-membership-gmail-agent.tsx on 2025-12-04.
 *
 * The problematic pattern:
 * 1. Pattern exports `items` which gets tagged #selfWishRepro
 * 2. Pattern wishes for #selfWishRepro (matches own export)
 * 3. Pattern merges local items with wished items
 *
 * Framework author hypothesis: "we keep merging the local list with
 * the merged list (that also includes the locals after one run) and
 * maybe the result is unstable and so not idempotent"
 *
 * IMPORTANT: This is the ACTUAL code structure from the problematic
 * pattern, simplified only by removing Gmail-specific logic.
 */
import {
  Default,
  derive,
  NAME,
  pattern,
  UI,
  wish,
} from "commontools";

// ============================================================================
// DATA STRUCTURES (simplified from MembershipRecord)
// ============================================================================
interface ItemRecord {
  id: string;
  name: string;
  source: string;
  extractedAt: number;
}

interface SelfWishReproInput {
  items?: Default<ItemRecord[], []>;
  lastScanAt?: Default<number, 0>;
}

interface SelfWishReproOutput {
  items: ItemRecord[];
  lastScanAt: number;
  count: number;
}

// ============================================================================
// PATTERN
// ============================================================================

const SelfWishRepro = pattern<SelfWishReproInput, SelfWishReproOutput>(
  ({ items, lastScanAt }) => {
    // ========================================================================
    // WISH IMPORT: Find existing items from other charms
    // THIS IS THE SELF-REFERENTIAL WISH - matches our own export
    // ========================================================================

    // Wish for existing items - but this pattern ALSO exports items!
    const wishedItemsCharm = wish<SelfWishReproOutput>({ query: "#selfWishRepro" });

    // Extract wished items (if any)
    // EXACT CODE from hotel-membership-gmail-agent.tsx line 141-143
    const wishedItems = derive(wishedItemsCharm, (wishState: { result?: SelfWishReproOutput; error?: any }) =>
      wishState?.result?.items || []
    );

    // Merge local items with wished items (deduplicated)
    // EXACT CODE STRUCTURE from hotel-membership-gmail-agent.tsx lines 146-172
    const allItems = derive(
      [items, wishedItems],
      ([local, wished]: [ItemRecord[], ItemRecord[]]) => {
        const seen = new Set<string>();
        const merged: ItemRecord[] = [];

        // Add local items first (they take precedence)
        for (const item of (local || [])) {
          const key = `${item.name}:${item.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }

        // Add wished items that we don't already have
        for (const item of (wished || [])) {
          const key = `${item.name}:${item.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push({ ...item, _fromWish: true } as ItemRecord & { _fromWish?: boolean });
          }
        }

        return merged;
      }
    );

    // Track counts
    const localItemCount = derive(items, (list) => list?.length || 0);
    const wishedItemCount = derive(wishedItems, (list) => list?.length || 0);

    // ========================================================================
    // DERIVED VALUES
    // ========================================================================
    const totalItems = derive(allItems, (list) => list?.length || 0);

    // ========================================================================
    // UI
    // ========================================================================

    return {
      [NAME]: "Self-Referential Wish Repro",

      // THIS IS THE SELF-REFERENCE: exports items which matches wish("#selfWishRepro")
      items,
      lastScanAt,
      count: totalItems,

      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>Self-Referential Wish Repro (CT-1098)</h2>

          <div style={{
            padding: "16px",
            background: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            marginBottom: "16px",
          }}>
            <strong>Warning:</strong> This pattern may cause an infinite loop!
            <br />
            It wishes for #selfWishRepro but also exports data matching that query.
          </div>

          <div style={{ marginBottom: "16px" }}>
            <div>Local items: {localItemCount}</div>
            <div>Wished items: {wishedItemCount}</div>
            <div>Total (merged): {totalItems}</div>
          </div>

          <h3>Items</h3>
          {derive(allItems, (list) => {
            if (!list || list.length === 0) {
              return <div style={{ color: "#999" }}>No items yet</div>;
            }
            return (
              <ul>
                {list.map((item: ItemRecord & { _fromWish?: boolean }) => (
                  <li key={item.id} style={{
                    background: (item as any)._fromWish ? "#e0f2fe" : "#f8f9fa",
                    padding: "8px",
                    marginBottom: "4px",
                    borderRadius: "4px",
                  }}>
                    {item.name} ({item.source})
                    {(item as any)._fromWish && <span style={{ color: "#0ea5e9" }}> [imported]</span>}
                  </li>
                ))}
              </ul>
            );
          })}
        </div>
      ),
    };
  },
);

export default SelfWishRepro;
