/// <cts-enable />
import {
  Writable,
  Default,
  NAME,
  pattern,
  UI,
} from "commontools";

interface TestInput {
  value: Default<string, "Hello">;
}

export default pattern<TestInput>(({ value }) => {
  return {
    [NAME]: "Test CT Components",
    [UI]: (
      <div style={{ padding: "16px" }}>
        <h1>Testing CT Components</h1>
        <ct-card>
          <div style={{ padding: "8px" }}>
            <ct-input
              $value={value}
              placeholder="Type something..."
            />
            <ct-button>Click Me</ct-button>
          </div>
        </ct-card>
      </div>
    ),
    value,
  };
});
