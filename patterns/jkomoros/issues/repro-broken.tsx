/// <cts-enable />
/**
 * MINIMAL REPRODUCTION - BROKEN VERSION
 *
 * This pattern is broken: generateObject NEVER fires.
 * The ONLY difference from repro-working.tsx is the `schema?: object` line.
 */
import { Cell, Default, derive, generateObject, handler, NAME, pattern, UI } from "commontools";

interface Input {
  trigger?: Cell<Default<string, "">>;
  schema?: object;  // <-- THIS ONE LINE BREAKS generateObject
}

const setTrigger = handler<unknown, { trigger: Cell<string> }>((_, { trigger }) => {
  trigger.set(`test input\n---${Date.now()}---`);
});

export default pattern<Input, {}>((props) => {
  const { trigger, schema } = props;
  const schemaVal = schema ?? { type: "object", properties: { items: { type: "array" } }, required: ["items"] };

  const { result, pending } = generateObject({
    system: "Return {items: [{name: 'test'}]}",
    prompt: trigger,
    schema: schemaVal,
    model: "anthropic:claude-sonnet-4-5",
  });

  return {
    [NAME]: "Repro: Broken",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "monospace" }}>
        <h2>Broken Pattern (has `schema?: object`)</h2>
        <button onClick={setTrigger({ trigger })}>Trigger</button>
        <pre>
          pending: {derive(pending, String)}{"\n"}
          result: {derive(result, (r) => JSON.stringify(r, null, 2) ?? "null")}
        </pre>
        <p style={{ color: "red" }}>
          Expected: pending becomes true, then result populates{"\n"}
          Actual: pending stays false, result stays null
        </p>
      </div>
    ),
  };
});
