/// <cts-enable />
/**
 * Minimal repro #2 for Frame mismatch error
 *
 * This pattern adds llmDialog to see if the combination triggers the error.
 */
import {
  BuiltInLLMMessage,
  Cell,
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

// Simple assumption type
interface Assumption {
  id: string;
  label: string;
}

// Analysis result type
interface AnalysisResult {
  assumptions: Array<{ label: string }>;
}

interface ReproInput {
  messages?: Cell<Default<BuiltInLLMMessage[], []>>;
  assumptions?: Cell<Default<Assumption[], []>>;
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
  const model = Cell.of<string>("anthropic:claude-sonnet-4-5");

  // Set up llmDialog for the main chat
  const { addMessage, cancelGeneration, pending } = llmDialog({
    system: computed(() => "You are a helpful assistant."),
    messages,
    model,
  });

  // Track analyzed count
  const analyzedCount = Cell.of<number>(0);

  // Build prompt from messages
  const analysisPrompt = computed(() => {
    const msgList = messages.get();
    const analyzed = analyzedCount.get();

    // Find last assistant message
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

  // Run analysis
  const analysisResult = generateObject<AnalysisResult>({
    prompt: analysisPrompt,
    system: "Return assumptions",
  });

  // Update when analysis completes
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

    // Mutate assumptions
    if (result.assumptions.length > 0) {
      const current = assumptions.get();
      assumptions.set([
        ...current,
        { id: `a-${Date.now()}`, label: result.assumptions[0].label },
      ]);
    }
  });

  const hasAssumptions = computed(() => assumptions.get().length > 0);

  return {
    [NAME]: "Frame Mismatch Repro 2",
    [UI]: (
      <div style={{ padding: "1rem" }}>
        <h2>Frame Mismatch Repro 2 (with llmDialog)</h2>
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 2 }}>
            <ct-chat $messages={messages} pending={pending} />
          </div>
          <div style={{ flex: 1 }}>
            <h3>Assumptions</h3>
            {hasAssumptions ? (
              assumptions.map((a) => <div key={a.id}>{a.label}</div>)
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
