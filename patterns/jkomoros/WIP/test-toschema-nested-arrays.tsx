/// <cts-enable />
import { generateObject, pattern, UI, NAME, toSchema } from "commontools";

// Test nested arrays with toSchema<T>()
interface NestedItem {
  name: string;
  value: number;
}

interface TestResult {
  items: NestedItem[];  // Nested array of complex objects
  message: string;
}

export default pattern(() => {
  const result = generateObject({
    model: "anthropic:claude-sonnet-4-5",  // Valid model name
    system: "You are a test assistant. Generate structured data with nested arrays.",
    prompt: "Create a test result with 3 items. Each item should have a name and a numeric value.",
    schema: toSchema<TestResult>()  // Testing if this works with nested arrays!
  });

  return {
    [NAME]: "Test toSchema with Nested Arrays",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "system-ui" }}>
        <h1>Testing toSchema&lt;T&gt;() with Nested Arrays</h1>
        <p>Model: anthropic:claude-sonnet-4-5</p>
        <p>Schema: toSchema&lt;TestResult&gt;() with nested NestedItem[] array</p>

        {result.pending ? (
          <div style={{ padding: "1rem", backgroundColor: "#fef3c7", borderRadius: "0.5rem" }}>
            ⏳ Generating...
          </div>
        ) : result.error ? (
          <div style={{ padding: "1rem", backgroundColor: "#fee2e2", borderRadius: "0.5rem" }}>
            ❌ Error: {result.error}
            <div style={{ marginTop: "0.5rem", fontSize: "0.875rem", fontFamily: "monospace" }}>
              {result.error}
            </div>
          </div>
        ) : result.result ? (
          <div style={{ padding: "1rem", backgroundColor: "#d1fae5", borderRadius: "0.5rem" }}>
            <h2>✅ Success! toSchema&lt;T&gt;() WORKS with nested arrays!</h2>

            <div style={{ marginTop: "1rem" }}>
              <strong>Message:</strong> {result.result.message}
            </div>

            <div style={{ marginTop: "1rem" }}>
              <strong>Items ({result.result.items?.length || 0}):</strong>
              {result.result.items?.map((item: NestedItem, idx: number) => (
                <div key={idx} style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem",
                  backgroundColor: "#f0fdf4",
                  borderRadius: "0.25rem"
                }}>
                  {idx + 1}. {item.name}: {item.value}
                </div>
              ))}
            </div>

            <div style={{
              marginTop: "1rem",
              padding: "0.5rem",
              backgroundColor: "#f3f4f6",
              borderRadius: "0.25rem",
              fontSize: "0.75rem",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap"
            }}>
              {JSON.stringify(result.result, null, 2)}
            </div>
          </div>
        ) : null}
      </div>
    ),
  };
});
