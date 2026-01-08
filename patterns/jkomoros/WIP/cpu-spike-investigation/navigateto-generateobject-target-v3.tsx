/// <cts-enable />
/**
 * @title Extract Target V3 (changesPreview)
 * @description Test 2: Uses recipe() + changesPreview computed like person.tsx
 *
 * Building on Test 1 (recipe() alone didn't trigger bug).
 * Adding changesPreview computed to see if post-extraction processing triggers it.
 */
import {
  computed,
  Default,
  generateObject,
  handler,
  NAME,
  recipe,
  toSchema,
  UI,
  Writable,
} from "commontools";
// Inline the diff utilities to avoid import issues
type DiffChunk = {
  type: "removed" | "added" | "unchanged";
  word: string;
};

function computeWordDiff(from: string, to: string): DiffChunk[] {
  const fromStr = from || "";
  const toStr = to || "";
  const fromWords = fromStr.split(/(\s+)/);
  const toWords = toStr.split(/(\s+)/);
  const result: DiffChunk[] = [];
  let i = 0, j = 0;

  while (i < fromWords.length || j < toWords.length) {
    if (i >= fromWords.length) {
      result.push({ type: "added", word: toWords[j] });
      j++;
    } else if (j >= toWords.length) {
      result.push({ type: "removed", word: fromWords[i] });
      i++;
    } else if (fromWords[i] === toWords[j]) {
      result.push({ type: "unchanged", word: fromWords[i] });
      i++;
      j++;
    } else {
      const fromLookAhead = toWords.slice(j).indexOf(fromWords[i]);
      const toLookAhead = fromWords.slice(i).indexOf(toWords[j]);
      if (fromLookAhead !== -1 && (toLookAhead === -1 || fromLookAhead <= toLookAhead)) {
        for (let k = 0; k < fromLookAhead; k++) {
          result.push({ type: "added", word: toWords[j] });
          j++;
        }
      } else if (toLookAhead !== -1) {
        for (let k = 0; k < toLookAhead; k++) {
          result.push({ type: "removed", word: fromWords[i] });
          i++;
        }
      } else {
        result.push({ type: "removed", word: fromWords[i] });
        result.push({ type: "added", word: toWords[j] });
        i++;
        j++;
      }
    }
  }
  return result;
}

function compareFields<T extends Record<string, any>>(
  extracted: Partial<T> | null | undefined,
  fieldMappings: { [K in keyof T]?: { current: string; label: string; }; },
): Array<{ field: string; from: string; to: string }> {
  if (!extracted || Object.keys(extracted).length === 0) {
    return [];
  }
  const changes: Array<{ field: string; from: string; to: string }> = [];
  for (const key in fieldMappings) {
    const mapping = fieldMappings[key];
    if (!mapping) continue;
    const extractedValue = extracted[key];
    const currentValue = mapping.current;
    if (extractedValue && extractedValue !== currentValue) {
      changes.push({
        field: mapping.label,
        from: currentValue || "(empty)",
        to: String(extractedValue),
      });
    }
  }
  return changes;
}

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
  { extractTrigger: Writable<string>; startTimeMs: Writable<number> }
>(
  (_, { extractTrigger, startTimeMs }) => {
    console.log("[V3-CHANGES] Starting extraction...");
    startTimeMs.set(Date.now());
    extractTrigger.set(`Extract this: Dr. Maya Rodriguez (she/her), goes by Maya. Email: maya.rodriguez@stanford.edu, phone: 650-555-1234. Birthday: March 15, 1985. Twitter: @drmayaR, LinkedIn: maya-rodriguez-phd, GitHub: mayarodriguez, Instagram: maya_explores, Mastodon: @maya@mastodon.social. Additional notes: Researcher at Stanford who works on AI safety.\n---EXTRACT-${Date.now()}---`);
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
const ExtractTargetV3 = recipe<Input, Output>(
  "Extract Target V3",
  ({ notes }) => {
    const extractTrigger = Writable.of<string>("");
    const startTimeMs = Writable.of<number>(0);

    // Existing field values (simulating person.tsx's stored cells)
    const displayName = Writable.of<string>("");
    const givenName = Writable.of<string>("");
    const familyName = Writable.of<string>("");
    const nickname = Writable.of<string>("");
    const pronouns = Writable.of<string>("");
    const email = Writable.of<string>("");
    const phone = Writable.of<string>("");
    const birthday = Writable.of<string>("");
    const twitter = Writable.of<string>("");
    const linkedin = Writable.of<string>("");
    const github = Writable.of<string>("");
    const instagram = Writable.of<string>("");
    const mastodon = Writable.of<string>("");
    const remainingNotes = Writable.of<string>("");

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

    // TEST 2: Add changesPreview computed like person.tsx
    const changesPreview = computed(() => {
      const extractionResult = result as ExtractionResult | null;
      return compareFields(extractionResult, {
        displayName: { current: displayName.get(), label: "Display Name" },
        givenName: { current: givenName.get(), label: "First Name" },
        familyName: { current: familyName.get(), label: "Last Name" },
        nickname: { current: nickname.get(), label: "Nickname" },
        pronouns: { current: pronouns.get(), label: "Pronouns" },
        email: { current: email.get(), label: "Email" },
        phone: { current: phone.get(), label: "Phone" },
        birthday: { current: birthday.get(), label: "Birthday" },
        twitter: { current: twitter.get(), label: "Twitter" },
        linkedin: { current: linkedin.get(), label: "LinkedIn" },
        github: { current: github.get(), label: "GitHub" },
        instagram: { current: instagram.get(), label: "Instagram" },
        mastodon: { current: mastodon.get(), label: "Mastodon" },
        remainingNotes: { current: remainingNotes.get(), label: "Notes" },
      });
    });

    // TEST 2: Add hasExtractionResults computed
    const hasExtractionResults = computed(() => {
      return changesPreview.length > 0;
    });

    // TEST 2: Add notesDiffChunks computed like person.tsx
    const notesDiffChunks = computed(() => {
      const notesChange = changesPreview.find((c) => c.field === "Notes");
      if (!notesChange || !notesChange.from || !notesChange.to ||
          notesChange.from === "(empty)" || notesChange.to === "(empty)") {
        return [];
      }
      return computeWordDiff(notesChange.from, notesChange.to);
    });

    const elapsedMs = computed(() => {
      const start = startTimeMs.get();
      if (!start || pending) return null;
      if (result) {
        const elapsed = Date.now() - start;
        console.log(`[V3-CHANGES] Completed in ${elapsed}ms`);
        return elapsed;
      }
      return null;
    });

    return {
      [NAME]: "Extract Target V3",
      notes,
      [UI]: (
        <div style={{ padding: "1rem", fontFamily: "monospace" }}>
          <h1>Extract Target V3 (changesPreview)</h1>

          <div style={{ backgroundColor: "#fef3c7", padding: "0.5rem", marginBottom: "1rem" }}>
            <strong>TEST 2:</strong> Using recipe() + changesPreview + notesDiffChunks computed
          </div>

          <ct-button onClick={triggerExtraction({ extractTrigger, startTimeMs })} disabled={pending}>
            {pending ? "Extracting..." : "Run Extraction"}
          </ct-button>

          {hasExtractionResults && (
            <div style={{ marginTop: "1rem", padding: "0.5rem", backgroundColor: "#f0fdf4" }}>
              <strong>Changes Preview ({changesPreview.length} changes):</strong>
              <ul>
                {changesPreview.map((change) => (
                  <li>
                    <strong>{change.field}:</strong> {change.from} → {change.to}
                  </li>
                ))}
              </ul>
              {notesDiffChunks.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  <strong>Notes Diff:</strong>
                  <div>
                    {notesDiffChunks.map((chunk: DiffChunk) => (
                      <span style={{
                        color: chunk.type === "removed" ? "red" : chunk.type === "added" ? "green" : "inherit",
                        textDecoration: chunk.type === "removed" ? "line-through" : "none",
                      }}>
                        {chunk.word}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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

export default ExtractTargetV3;
