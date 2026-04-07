/// <cts-enable />
// STUBBED during the commonfabric port. The original 1600+ line pattern
// uses computed() inside standalone helper functions that the new compiler
// rejects ("Standalone functions cannot capture reactive closures"). Owner
// needs to inline processArticleUrls/processUrlSlot into the pattern body
// or convert them to patternTool() factories.
//
// Original preserved as prompt-injection-tracker.tsx.broken for restoration.
import { NAME, pattern, UI } from "commonfabric";

const PromptInjectionTracker = pattern<
  Record<string, never>,
  { [NAME]: string }
>(() => ({
  [NAME]: "Prompt Injection Tracker (stub)",
  [UI]: (
    <div style={{ padding: "1rem" }}>
      <h2>Prompt Injection Tracker</h2>
      <p>
        This pattern is temporarily stubbed during the commonfabric framework
        rename. See prompt-injection-tracker.tsx.broken for the original
        implementation.
      </p>
    </div>
  ),
}));

export default PromptInjectionTracker;
