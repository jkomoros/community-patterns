/// <cts-enable />
import {
  Writable,
  Default,
  NAME,
  pattern,
  UI,
} from "commonfabric";

interface TestInput {
  value: Default<string, "Hello">;
}

export default pattern<TestInput>(({ value }) => {
  return {
    [NAME]: "Test CT Components",
    [UI]: (
      <div style={{ padding: "16px" }}>
        <h1>Testing CT Components</h1>
        <cf-card>
          <div style={{ padding: "8px" }}>
            <cf-input
              $value={value}
              placeholder="Type something..."
            />
            <cf-button>Click Me</cf-button>
          </div>
        </cf-card>
      </div>
    ),
    value,
  };
});
