/// <cts-enable />
/**
 * @title Extract Target V2 (recipe)
 * @description Test 1: Uses recipe() wrapper instead of pattern()
 *
 * HYPOTHESIS: The ~90s CPU spike is caused by recipe() wrapper + navigateTo,
 * not pattern() wrapper.
 *
 * person.tsx uses recipe(), our minimal repro used pattern().
 * This tests if recipe() alone triggers the bug.
 */
import {
  Cell,
  computed,
  Default,
  generateObject,
  handler,
  NAME,
  recipe,
  toSchema,
  UI,
} from "commontools";

// 14-field schema to match person.tsx
interface ExtractionResult {
  displayName: string;
  givenName: string;
  familyName: string;
  nickname: string;
  pronouns: string;
  email: string;
  phone: string;
  birthday: string;
  twitter: string;
  linkedin: string;
  github: string;
  instagram: string;
  mastodon: string;
  remainingNotes: string;
}

// Handler to trigger extraction
const triggerExtraction = handler<
  Record<string, never>,
  { extractTrigger: Cell<string>; startTimeMs: Cell<number> }
>(
  (_, { extractTrigger, startTimeMs }) => {
    console.log("[V2-RECIPE] Starting extraction...");
    startTimeMs.set(Date.now());
    extractTrigger.set(`Extract this: Dr. Maya Rodriguez (she/her), goes by Maya. Email: maya.rodriguez@stanford.edu, phone: 650-555-1234. Birthday: March 15, 1985. Twitter: @drmayaR, LinkedIn: maya-rodriguez-phd, GitHub: mayarodriguez, Instagram: maya_explores, Mastodon: @maya@mastodon.social. Additional notes: Researcher at Stanford.\n---EXTRACT-${Date.now()}---`);
  },
);

// Input type (what's passed via navigateTo)
interface Input {
  notes: Default<string, "">;
}

// Output type (what's exposed as cells)
interface Output {
  notes: string;
}

// Use recipe() like person.tsx does
const ExtractTargetV2 = recipe<Input, Output>(
  "Extract Target V2",
  ({ notes }) => {
    const extractTrigger = Cell.of<string>("");
    const startTimeMs = Cell.of<number>(0);

    const guardedPrompt = computed(() => {
      const t = extractTrigger.get();
      if (t && t.includes("---EXTRACT-")) {
        return t;
      }
      return undefined;
    });

    const { result, pending } = generateObject({
      system: "Extract profile data from the text. Fill in all 14 fields.",
      prompt: guardedPrompt,
      model: "anthropic:claude-sonnet-4-5",
      schema: toSchema<ExtractionResult>(),
    });

    const elapsedMs = computed(() => {
      const start = startTimeMs.get();
      if (!start || pending) return null;
      if (result) {
        const elapsed = Date.now() - start;
        console.log(`[V2-RECIPE] Completed in ${elapsed}ms`);
        return elapsed;
      }
      return null;
    });

    return {
      [NAME]: "Extract Target V2",
      notes,
      [UI]: (
        <div style={{ padding: "1rem", fontFamily: "monospace" }}>
          <h1>Extract Target V2 (recipe)</h1>

          <div style={{ backgroundColor: "#fef3c7", padding: "0.5rem", marginBottom: "1rem" }}>
            <strong>TEST 1:</strong> Using recipe() wrapper instead of pattern()
          </div>

          <ct-button onClick={triggerExtraction({ extractTrigger, startTimeMs })} disabled={pending}>
            {pending ? "Extracting..." : "Run Extraction"}
          </ct-button>

          {result && (
            <div style={{ marginTop: "1rem", padding: "0.5rem", backgroundColor: "#f0fdf4" }}>
              <strong>Result:</strong> {JSON.stringify(result)}
            </div>
          )}

          {elapsedMs && (
            <div style={{ marginTop: "0.5rem", fontWeight: "bold" }}>
              Time: {elapsedMs}ms ({((elapsedMs as number) / 1000).toFixed(1)}s)
            </div>
          )}
        </div>
      ),
    };
  },
);

export default ExtractTargetV2;
