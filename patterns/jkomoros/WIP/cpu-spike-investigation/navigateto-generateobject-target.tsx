/// <cts-enable />
/**
 * @title Extract Target
 * @description Minimal repro target - shows ~90s CPU spike when created via navigateTo
 *
 * BUG REPRO: This pattern works correctly (~instant) when deployed directly via
 * `deno task ct charm new`. But when created via `navigateTo(ExtractTarget({}))`,
 * the generateObject call causes a ~90 second CPU spike.
 *
 * See: patterns/jkomoros/issues/ISSUE-navigateTo-generateObject-cpu-spike.md
 */
import {
  Writable,
  computed,
  generateObject,
  handler,
  NAME,
  pattern,
  toSchema,
  UI,
} from "commontools";

// 14-field schema to match person.tsx (where the bug was discovered)
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

const triggerExtraction = handler<
  Record<string, never>,
  { trigger: Writable<string>; startTimeMs: Writable<number> }
>(
  (_, { trigger, startTimeMs }) => {
    console.log("[EXTRACT-TARGET] Starting extraction...");
    startTimeMs.set(Date.now());
    trigger.set(`Extract this: Dr. Maya Rodriguez (she/her), goes by Maya. Email: maya.rodriguez@stanford.edu, phone: 650-555-1234. Birthday: March 15, 1985. Twitter: @drmayaR, LinkedIn: maya-rodriguez-phd, GitHub: mayarodriguez, Instagram: maya_explores, Mastodon: @maya@mastodon.social. Additional notes: Researcher at Stanford.\n---EXTRACT-${Date.now()}---`);
  },
);

interface Props {
  notes?: string;
}

export default pattern<Props>(({ notes }) => {
  const trigger = Writable.of<string>("");
  const startTimeMs = Writable.of<number>(0);

  const guardedPrompt = computed(() => {
    const t = trigger.get();
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
      console.log(`[EXTRACT-TARGET] Completed in ${elapsed}ms`);
      return elapsed;
    }
    return null;
  });

  return {
    [NAME]: "Extract Target",
    notes,
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Extract Target (Minimal Repro)</h1>

        <div style={{ backgroundColor: "#fef3c7", padding: "0.5rem", marginBottom: "1rem" }}>
          <strong>BUG:</strong> This is fast when deployed directly, but ~90s when created via navigateTo
        </div>

        <ct-button onClick={triggerExtraction({ trigger, startTimeMs })} disabled={pending}>
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
});
