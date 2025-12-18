/// <cts-enable />
/**
 * MINIMAL REPRODUCTION - WORKING VERSION
 *
 * This pattern works correctly: generateObject fires when trigger changes.
 */
import { Cell, Default, derive, generateObject, handler, NAME, pattern, UI } from "commontools";

interface Input {
  trigger?: Cell<Default<string, "">>;
  // No other optional inputs - this works
}

const setTrigger = handler<unknown, { trigger: Cell<string> }>((_, { trigger }) => {
  trigger.set(`test input\n---${Date.now()}---`);
});

export default pattern<Input, {}>((props) => {
  const { trigger } = props;

  const { result, pending } = generateObject({
    system: "Return {items: [{name: 'test'}]}",
    prompt: trigger,
    schema: { type: "object", properties: { items: { type: "array" } }, required: ["items"] },
    model: "anthropic:claude-sonnet-4-5",
  });

  return {
    [NAME]: "Repro: Working",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "monospace" }}>
        <h2>Working Pattern (no optional non-Cell inputs)</h2>
        <button onClick={setTrigger({ trigger })}>Trigger</button>
        <pre>
          pending: {derive(pending, String)}{"\n"}
          result: {derive(result, (r) => JSON.stringify(r, null, 2) ?? "null")}
        </pre>
      </div>
    ),
  };
});
