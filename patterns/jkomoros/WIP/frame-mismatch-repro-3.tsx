/// <cts-enable />
/**
 * Minimal repro #3 for Frame mismatch error
 *
 * This pattern uses nested types (Alternative inside Assumption) to see if
 * that triggers the Frame mismatch error.
 */
import {
  BuiltInLLMMessage,
  Writable,
  computed,
  Default,
  generateObject,
  handler,
  llmDialog,
  NAME,
  pattern,
  Stream,
  UI,
} from "commontools";

// Nested type structure matching the original
interface Alternative {
  value: string;
  description?: string;
}

interface Assumption {
  id: string;
  label: string;
  description?: string;
  alternatives: Alternative[];
  selectedIndex: number;
  messageId: string;
  status: "active" | "resolved" | "dismissed";
}

// Analysis result with nested alternatives
interface AnalyzedAssumption {
  label: string;
  description?: string;
  alternatives: Array<{ value: string; description?: string }>;
  selectedIndex: number;
}

interface AnalysisResult {
  assumptions: AnalyzedAssumption[];
}

interface ReproInput {
  messages?: Writable<Default<BuiltInLLMMessage[], []>>;
  assumptions?: Writable<Default<Assumption[], []>>;
}

interface ReproOutput {
  messages: BuiltInLLMMessage[];
  assumptions: Assumption[];
}

const sendMessage = handler<
  { detail: { text: string } },
  { addMessage: Stream<BuiltInLLMMessage> }
>((event, { addMessage }) => {
  const { text } = event.detail;
  if (!text.trim()) return;
  addMessage.send({
    role: "user",
    content: [{ type: "text" as const, text }],
  });
});

export default pattern<ReproInput, ReproOutput>(({ messages, assumptions }) => {
  const model = Writable.of<string>("anthropic:claude-sonnet-4-5");

  const { addMessage, cancelGeneration, pending } = llmDialog({
    system: computed(() => "You are a helpful assistant."),
    messages,
    model,
  });

  const analyzedCount = Writable.of<number>(0);

  const analysisPrompt = computed(() => {
    const msgList = messages.get();
    const analyzed = analyzedCount.get();

    let lastAssistantIdx = -1;
    for (let i = msgList.length - 1; i >= 0; i--) {
      if (msgList[i].role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }

    if (lastAssistantIdx < 0 || lastAssistantIdx < analyzed) {
      return "";
    }

    return `Analyze this message for assumptions`;
  });

  const analysisResult = generateObject<AnalysisResult>({
    prompt: analysisPrompt,
    system: "Return assumptions with alternatives",
  });

  // Update with NESTED structure mutation
  const _update = computed(() => {
    const prompt = analysisPrompt;
    if (!prompt) return;

    const result = analysisResult.result;
    if (analysisResult.pending || analysisResult.error || !result) return;

    const msgList = messages.get();
    let lastAssistantIdx = -1;
    for (let i = msgList.length - 1; i >= 0; i--) {
      if (msgList[i].role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }

    if (lastAssistantIdx < 0) return;
    analyzedCount.set(lastAssistantIdx + 1);

    // Create full Assumption objects with nested alternatives
    const newAssumptions: Assumption[] = result.assumptions.map((a, idx) => ({
      id: `assumption-${Date.now()}-${idx}`,
      label: a.label,
      description: a.description,
      alternatives: a.alternatives,
      selectedIndex: a.selectedIndex,
      messageId: `msg-${lastAssistantIdx}`,
      status: "active" as const,
    }));

    if (newAssumptions.length > 0) {
      const current = assumptions.get();
      assumptions.set([...current, ...newAssumptions]);
    }
  });

  const hasAssumptions = computed(() => assumptions.get().length > 0);

  return {
    [NAME]: "Frame Mismatch Repro 3",
    [UI]: (
      <div style={{ padding: "1rem" }}>
        <h2>Frame Mismatch Repro 3 (nested types)</h2>
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 2 }}>
            <ct-chat $messages={messages} pending={pending} />
          </div>
          <div style={{ flex: 1 }}>
            <h3>Assumptions</h3>
            {hasAssumptions ? (
              assumptions.map((a) => (
                <div key={a.id}>
                  <strong>{a.label}</strong>
                  <div>
                    {a.alternatives.map((alt, i) => (
                      <span key={i}>
                        {i === a.selectedIndex ? "* " : ""}
                        {alt.value}
                        {i < a.alternatives.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p>No assumptions yet</p>
            )}
          </div>
        </div>
        <ct-prompt-input
          placeholder="Ask a question..."
          pending={pending}
          onct-send={sendMessage({ addMessage })}
          onct-stop={cancelGeneration}
        />
      </div>
    ),
    messages,
    assumptions,
  };
});
