/// <cts-enable />
/**
 * CPU Spike Whittle-Down Test - STEP 3
 *
 * STEP 1 (40s): Full orchestrator structure with wish() + computed auth states
 * STEP 2 (19s): No wish() - just GoogleAuth instantiation
 * STEP 3 (THIS): No GoogleAuth - just a simple inline pattern
 *
 * If this is fast, the problem is something in GoogleAuth specifically.
 * If this is also slow, the problem is pattern instantiation in handlers.
 */
import {
  computed,
  Default,
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
} from "commontools";

// =============================================================================
// A simple pattern (NOT GoogleAuth) to test if it's pattern instantiation
// =============================================================================

interface SimpleInput {
  message: Default<string, "Hello from simple pattern">;
}

interface SimpleOutput {
  message: string;
  timestamp: number;
}

const SimplePattern = pattern<SimpleInput, SimpleOutput>(({ message }) => {
  const timestamp = computed(() => Date.now());

  return {
    [NAME]: "Simple Test Pattern",
    [UI]: (
      <div style={{ padding: "20px" }}>
        <h2>Simple Pattern</h2>
        <p>Message: {message}</p>
        <p>Created at: {timestamp}</p>
      </div>
    ),
    message,
    timestamp,
  };
});

// =============================================================================
// Types
// =============================================================================

interface Input {
  // No inputs needed
}

/** CPU Spike Whittle Test Step 3 - No GoogleAuth. #cpuSpikeWhittle3 */
interface Output {
  testName: string;
}

// =============================================================================
// Handler - Creates simple pattern instead of GoogleAuth
// =============================================================================

const createSimplePattern = handler<unknown, Record<string, never>>(() => {
  const charm = SimplePattern({
    message: "Created from handler at " + new Date().toISOString(),
  });
  return navigateTo(charm);
});

// =============================================================================
// Pattern
// =============================================================================

export default pattern<Input, Output>(
  () => {
    return {
      [NAME]: "CPU Spike Whittle 3 (No GoogleAuth)",
      [UI]: (
        <div style={{ padding: "20px", maxWidth: "600px" }}>
          <h2>CPU Spike Whittle - Step 3</h2>

          <p style={{ color: "#666", marginBottom: "16px" }}>
            <strong>No GoogleAuth</strong> - Creates a simple inline pattern instead.
          </p>

          <div style={{ fontSize: "13px", marginBottom: "16px" }}>
            <p>Step 1 (wish + GoogleAuth): <strong>40s</strong></p>
            <p>Step 2 (just GoogleAuth): <strong>19s</strong></p>
            <p>Step 3 (simple pattern): <strong>???</strong></p>
          </div>

          <ct-button
            variant="primary"
            onClick={createSimplePattern({})}
          >
            Create Simple Pattern (No GoogleAuth)
          </ct-button>
        </div>
      ),
      testName: "CPU Spike Whittle 3",
    };
  }
);
