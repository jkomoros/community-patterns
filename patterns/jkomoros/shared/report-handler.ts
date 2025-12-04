/// <cts-enable />
/**
 * Shared Report Handler for LLM Tools
 *
 * A generic, sandbox-safe handler for reporting items to a list with deduplication.
 *
 * Key design decisions:
 * - Config is DATA (serializable), not functions - survives sandboxing
 * - Type parameter provides TypeScript checking on dedupeFields
 * - LLM just provides domain data, doesn't see config
 *
 * Usage:
 * ```typescript
 * import { createReportHandler } from "./lib/report-handler.ts";
 *
 * interface MyRecord {
 *   id: string;
 *   name: string;
 *   category: string;
 *   savedAt: number;
 * }
 *
 * const reportItem = createReportHandler<MyRecord>();
 *
 * // In additionalTools:
 * additionalTools: {
 *   reportItem: {
 *     description: "Report a found item",
 *     handler: reportItem({
 *       items: myItemsCell,
 *       idPrefix: "item",
 *       dedupeFields: ["name", "category"],  // TS-checked!
 *     }),
 *   },
 * }
 * ```
 *
 * See: community-docs/superstitions/2025-12-04-tool-handler-schemas-not-functions.md
 */
import { Cell, handler } from "commontools";

/**
 * Config passed when binding the handler (pattern author provides this).
 * All fields are DATA (serializable), no functions.
 *
 * Note: Using string[] instead of (keyof T)[] for dedupeFields because
 * the framework's TypeScript compiler has issues with keyof in handler state.
 * TypeScript will still catch most typos at the call site.
 */
export interface ReportHandlerConfig<T> {
  /** Cell containing the list of items */
  items: Cell<T[]>;
  /** Prefix for generated IDs (e.g., "membership", "food") */
  idPrefix: string;
  /** Fields that make up the dedup key */
  dedupeFields: string[];
  /** Field name for the timestamp (default: "savedAt") */
  timestampField?: string;
}

/**
 * Creates a type-safe report handler for LLM tools.
 *
 * The handler:
 * - Checks for duplicates using the specified fields
 * - Generates unique IDs with the prefix
 * - Adds timestamp to configured field (default: "savedAt")
 * - Writes to result cell for LLM response
 *
 * @returns A handler factory that takes config and returns a bound handler
 */
export function createReportHandler<T extends { id: string }>() {
  return handler<
    Omit<T, "id"> & { result?: Cell<any> },
    ReportHandlerConfig<T>
  >((input, state) => {
    const currentItems = state.items.get() || [];
    const inputRecord = input as Record<string, any>;

    // Generate dedup key from configured fields (DATA, not function)
    const dedupeKey = state.dedupeFields
      .map(field => String(inputRecord[field] ?? ""))
      .join(":")
      .toLowerCase();

    const existingKeys = new Set(
      currentItems.map(item => {
        const itemRecord = item as Record<string, any>;
        return state.dedupeFields
          .map(field => String(itemRecord[field] ?? ""))
          .join(":")
          .toLowerCase();
      })
    );

    let resultMessage: string;

    if (existingKeys.has(dedupeKey)) {
      console.log(`[ReportHandler:${state.idPrefix}] Duplicate skipped: ${dedupeKey}`);
      resultMessage = `Duplicate: ${dedupeKey} already saved`;
    } else {
      // Generate unique ID
      const id = `${state.idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = Date.now();

      // Create record: spread input + add id and timestamp
      const timestampField = state.timestampField || "savedAt";
      const newRecord = {
        ...input,
        id,
        [timestampField]: timestamp,
      } as unknown as T;

      state.items.set([...currentItems, newRecord]);
      console.log(`[ReportHandler:${state.idPrefix}] SAVED: ${dedupeKey}`);
      resultMessage = `Saved: ${dedupeKey}`;
    }

    // Write result if cell provided (for LLM tool response)
    const resultCell = (input as any).result;
    if (resultCell) {
      resultCell.set({ success: true, message: resultMessage });
    }

    return { success: true, message: resultMessage };
  });
}
