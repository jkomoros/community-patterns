/// <cts-enable />
/**
 * Shared Report Handler for LLM Tools
 *
 * A sandbox-safe handler for reporting items to a list with deduplication.
 *
 * Key design decisions:
 * - Input schema is DATA (passed as parameter), not a type parameter
 * - Config is DATA (serializable), not functions - survives sandboxing
 * - LLM receives the explicit schema so it knows what fields to send
 *
 * IMPORTANT: Generic type parameters (handler<T>) don't work for LLM tool schemas!
 * The CTS compiler can't resolve T at compile time, so the generated schema
 * is incomplete. Always pass explicit JSON schemas as DATA.
 *
 * Usage:
 * ```typescript
 * import { createReportHandler } from "./shared/report-handler.ts";
 *
 * // Define the INPUT SCHEMA explicitly (what LLM will send)
 * const MEMBERSHIP_INPUT_SCHEMA = {
 *   type: "object",
 *   properties: {
 *     hotelBrand: { type: "string", description: "Hotel brand name" },
 *     membershipNumber: { type: "string", description: "Membership number" },
 *     result: { type: "object", asCell: true },
 *   },
 *   required: ["hotelBrand", "membershipNumber"],
 * } as const;
 *
 * // Create handler with explicit schema
 * const reportMembershipHandler = createReportHandler(MEMBERSHIP_INPUT_SCHEMA);
 *
 * // In additionalTools:
 * additionalTools: {
 *   reportMembership: {
 *     description: "Report a found membership",
 *     handler: reportMembershipHandler({
 *       items: membershipsCell,
 *       idPrefix: "membership",
 *       dedupeFields: ["hotelBrand", "membershipNumber"],
 *       timestampField: "extractedAt",
 *     }),
 *   },
 * }
 * ```
 *
 * See: community-docs/superstitions/2025-12-04-tool-handler-schemas-not-functions.md
 */
import { Cell, handler, JSONSchema } from "commontools";

/**
 * Config passed when binding the handler (pattern author provides this).
 * All fields are DATA (serializable), no functions.
 */
export interface ReportHandlerConfig {
  /** Cell containing the list of items */
  items: Cell<any[]>;
  /** Prefix for generated IDs (e.g., "membership", "food") */
  idPrefix: string;
  /** Fields that make up the dedup key */
  dedupeFields: string[];
  /** Field name for the timestamp (default: "savedAt") */
  timestampField?: string;
}

// State schema for the handler (bound cells)
const STATE_SCHEMA = {
  type: "object",
  properties: {
    items: { type: "array", items: {}, asCell: true },
    idPrefix: { type: "string" },
    dedupeFields: { type: "array", items: { type: "string" } },
    timestampField: { type: "string" },
  },
  required: ["items", "idPrefix", "dedupeFields"],
} as const satisfies JSONSchema;

/**
 * Creates a report handler for LLM tools with explicit input schema.
 *
 * The handler:
 * - Checks for duplicates using the specified fields
 * - Generates unique IDs with the prefix
 * - Adds timestamp to configured field (default: "savedAt")
 * - Writes to result cell for LLM response
 *
 * @param inputSchema - JSON Schema for what the LLM should send (MUST be explicit, not generic!)
 * @returns A handler factory that takes config and returns a bound handler
 */
export function createReportHandler(inputSchema: JSONSchema) {
  return handler(
    // INPUT SCHEMA - passed explicitly so LLM knows what fields to send
    inputSchema,
    // STATE SCHEMA - bound cells and config
    STATE_SCHEMA,
    // CALLBACK
    (input: Record<string, any>, state: ReportHandlerConfig) => {
      const currentItems = state.items.get() || [];

      // Generate dedup key from configured fields (DATA, not function)
      const dedupeKey = state.dedupeFields
        .map(field => String(input[field] ?? ""))
        .join(":")
        .toLowerCase();

      const existingKeys = new Set(
        currentItems.map((item: Record<string, any>) => {
          return state.dedupeFields
            .map(field => String(item[field] ?? ""))
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
        };

        // Remove the result cell from the saved record (it's not data)
        delete newRecord.result;

        state.items.set([...currentItems, newRecord]);
        console.log(`[ReportHandler:${state.idPrefix}] SAVED: ${dedupeKey}`);
        resultMessage = `Saved: ${dedupeKey}`;
      }

      // Write result if cell provided (for LLM tool response)
      const resultCell = input.result;
      if (resultCell) {
        resultCell.set({ success: true, message: resultMessage });
      }

      return { success: true, message: resultMessage };
    }
  );
}
