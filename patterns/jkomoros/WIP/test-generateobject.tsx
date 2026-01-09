/// <cts-enable />
import { generateObject, pattern, UI, NAME, toSchema } from "commontools";

interface TestResult {
  message: string;
  timestamp: string;
}

export default pattern(() => {
  // Use a static string prompt - simplest possible test
  const result = generateObject({
    system: "You are a test assistant. Generate a simple response.",
    prompt: "Say hello and tell me the current timestamp",
    schema: toSchema<TestResult>()
  });

  return {
    [NAME]: "Test generateObject",
    [UI]: (
      <div style={{ padding: "1rem" }}>
        <h1>Test generateObject</h1>
        <p>Testing with static prompt: "Say hello and tell me the current timestamp"</p>

        {result.pending ? (
          <div style={{ padding: "1rem", backgroundColor: "#fef3c7" }}>
            ⏳ Generating...
          </div>
        ) : result.error ? (
          <div style={{ padding: "1rem", backgroundColor: "#fee2e2" }}>
            ❌ Error: {result.error}
          </div>
        ) : result.result ? (
          <div style={{ padding: "1rem", backgroundColor: "#d1fae5" }}>
            ✅ Success!
            <div>Message: {result.result.message}</div>
            <div>Timestamp: {result.result.timestamp}</div>
          </div>
        ) : <></>}
      </div>
    ),
  };
});
