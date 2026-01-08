/// <cts-enable />
/**
 * CPU Spike Repro - Testing pattern instantiation in handlers
 *
 * INVESTIGATION RESULTS (2024-12-17):
 * - ROUND 1: Simple pattern with single computed() - BOTH WORK ✅
 * - ROUND 2: Complex pattern with 3 computed() iterating over object - BOTH WORK ✅
 * - ROUND 3: Real GoogleAuth pattern import - BOTH WORK ✅
 * - ORCHESTRATOR: The actual google-docs-comment-orchestrator - WORKS ✅
 *
 * CONCLUSION: Could NOT reproduce the CPU spike bug. All test cases passed.
 * The original bug may have been:
 * 1. Fixed in a recent labs update
 * 2. Intermittent and depends on specific conditions
 * 3. Related to stale deployment or dev server state
 *
 * This pattern is kept as a debugging tool for future CPU spike investigations.
 */
import {
  computed,
  Default,
  handler,
  NAME,
  navigateTo,
  pattern,
  UI,
  Writable,
} from "commontools";

// Import actual GoogleAuth pattern
import GoogleAuth from "./google-auth.tsx";

// =============================================================================
// Level 1: Simple Pattern (WORKS - confirmed in Round 1)
// =============================================================================

interface SimpleInput {
  config: Default<{ enabled: boolean }, { enabled: false }>;
}

interface SimpleOutput {
  config: { enabled: boolean };
  status: string;
}

const SimplePattern = pattern<SimpleInput, SimpleOutput>(({ config }) => {
  const status = computed(() => (config.enabled ? "Enabled" : "Disabled"));

  return {
    [NAME]: computed(() => `Simple (${status})`),
    [UI]: (
      <div style={{ padding: "20px" }}>
        <h2>Simple Pattern Instance</h2>
        <p>Status: <strong>{status}</strong></p>
      </div>
    ),
    config,
    status,
  };
});

// =============================================================================
// Level 2: Complex Pattern (GoogleAuth-like)
// - Multiple computed functions that iterate over input properties
// - Complex Default types with many fields
// =============================================================================

type SelectedScopes = {
  gmail: Default<boolean, false>;
  gmailSend: Default<boolean, false>;
  calendar: Default<boolean, false>;
  drive: Default<boolean, false>;
  docs: Default<boolean, false>;
};

interface ComplexInput {
  selectedScopes: Default<SelectedScopes, {
    gmail: true;
    gmailSend: false;
    calendar: true;
    drive: false;
    docs: false;
  }>;
}

interface ComplexOutput {
  selectedScopes: SelectedScopes;
  scopes: string[];
  hasSelectedScopes: boolean;
  scopeCount: number;
}

const SCOPE_MAP: Record<string, string> = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  gmailSend: "https://www.googleapis.com/auth/gmail.send",
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  drive: "https://www.googleapis.com/auth/drive",
  docs: "https://www.googleapis.com/auth/documents.readonly",
};

const ComplexPattern = pattern<ComplexInput, ComplexOutput>(({ selectedScopes }) => {
  // Computed 1: Build scope URLs array (like GoogleAuth's scopes)
  const scopes = computed(() => {
    const base = ["email", "profile"];
    for (const [key, enabled] of Object.entries(selectedScopes)) {
      if (enabled && SCOPE_MAP[key]) {
        base.push(SCOPE_MAP[key]);
      }
    }
    return base;
  });

  // Computed 2: Check if any scope is selected (like GoogleAuth's hasSelectedScopes)
  const hasSelectedScopes = computed(() =>
    Object.values(selectedScopes).some(Boolean)
  );

  // Computed 3: Count selected scopes
  const scopeCount = computed(() =>
    Object.values(selectedScopes).filter(Boolean).length
  );

  return {
    [NAME]: computed(() => `Complex (${scopeCount} scopes)`),
    [UI]: (
      <div style={{ padding: "20px" }}>
        <h2>Complex Pattern Instance</h2>
        <p>Has scopes: <strong>{computed(() => String(hasSelectedScopes))}</strong></p>
        <p>Scope count: <strong>{scopeCount}</strong></p>
        <p>Scopes: <code>{computed(() => scopes.join(", "))}</code></p>
      </div>
    ),
    selectedScopes,
    scopes,
    hasSelectedScopes,
    scopeCount,
  };
});

// =============================================================================
// Test Pattern - CPU Spike Reproduction
// =============================================================================

interface TestInput {
  // Pre-created cells for the "working" cases
  preCreatedSimpleConfig: Default<{ enabled: boolean }, { enabled: true }>;
  preCreatedScopes: Default<SelectedScopes, {
    gmail: true;
    gmailSend: false;
    calendar: true;
    drive: false;
    docs: false;
  }>;
}

/** CPU Spike Repro - Tests pattern instantiation in handlers. #cpuSpikeRepro */
interface TestOutput {
  testName: string;
}

// =============================================================================
// Simple Pattern Handlers (Level 1)
// =============================================================================

// Level 1A: Plain object
const createSimpleWithPlainObject = handler<unknown, Record<string, never>>(() => {
  const charm = SimplePattern({ config: { enabled: true } });
  return navigateTo(charm);
});

// Level 1B: Cell reference
const createSimpleWithCellRef = handler<
  unknown,
  { configCell: Writable<{ enabled: boolean }> }
>((_, { configCell }) => {
  const charm = SimplePattern({ config: configCell });
  return navigateTo(charm);
});

// =============================================================================
// Complex Pattern Handlers (Level 2 - GoogleAuth-like)
// =============================================================================

// Level 2A: Plain object with complex nested structure
const createComplexWithPlainObject = handler<unknown, Record<string, never>>(() => {
  const charm = ComplexPattern({
    selectedScopes: {
      gmail: true,
      gmailSend: false,
      calendar: true,
      drive: false,
      docs: false,
    },
  });
  return navigateTo(charm);
});

// Level 2B: Cell reference
const createComplexWithCellRef = handler<
  unknown,
  { scopesCell: Writable<SelectedScopes> }
>((_, { scopesCell }) => {
  const charm = ComplexPattern({ selectedScopes: scopesCell });
  return navigateTo(charm);
});

// =============================================================================
// Real GoogleAuth Handlers (Level 3 - THE REAL TEST)
// =============================================================================

// Level 3A: Plain object - THIS IS WHAT THE ORCHESTRATOR DOES
const createGoogleAuthWithPlainObject = handler<unknown, Record<string, never>>(() => {
  // deno-lint-ignore no-explicit-any
  const charm = (GoogleAuth as any)({
    selectedScopes: {
      gmail: false,
      gmailSend: false,
      gmailModify: false,
      calendar: false,
      calendarWrite: false,
      drive: true,
      docs: false,
      contacts: false,
    },
  });
  return navigateTo(charm);
});

// Level 3B: Cell reference
const createGoogleAuthWithCellRef = handler<
  unknown,
  { scopesCell: Writable<SelectedScopes> }
>((_, { scopesCell }) => {
  // deno-lint-ignore no-explicit-any
  const charm = (GoogleAuth as any)({ selectedScopes: scopesCell });
  return navigateTo(charm);
});

export default pattern<TestInput, TestOutput>(({ preCreatedSimpleConfig, preCreatedScopes }) => {
  return {
    [NAME]: "CPU Spike Repro",
    [UI]: (
      <div
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          maxWidth: "700px",
        }}
      >
        <h2 style={{ margin: 0 }}>CPU Spike Repro - Testing Pattern Complexity</h2>

        <p style={{ color: "#666", margin: 0 }}>
          Round 1 showed simple patterns work. Now testing GoogleAuth-like complexity.
        </p>

        {/* LEVEL 1: Simple Pattern */}
        <div style={{ background: "#f3f4f6", padding: "16px", borderRadius: "8px" }}>
          <h3 style={{ margin: "0 0 12px 0" }}>Level 1: Simple Pattern (1 computed)</h3>
          <p style={{ fontSize: "13px", margin: "0 0 12px 0", color: "#059669" }}>
            ✅ CONFIRMED WORKING in Round 1
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <ct-button onClick={createSimpleWithPlainObject({})}>
              1A: Plain Object
            </ct-button>
            <ct-button onClick={createSimpleWithCellRef({ configCell: preCreatedSimpleConfig })}>
              1B: Cell Ref
            </ct-button>
          </div>
        </div>

        {/* LEVEL 2: Complex Pattern */}
        <div style={{ background: "#d1fae5", padding: "16px", borderRadius: "8px", border: "1px solid #10b981" }}>
          <h3 style={{ margin: "0 0 8px 0", color: "#047857" }}>
            Level 2: Complex Pattern (3 computed, iterating over object)
          </h3>
          <p style={{ fontSize: "13px", margin: "0 0 12px 0", color: "#059669" }}>
            ✅ CONFIRMED WORKING - Both work fine
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <ct-button onClick={createComplexWithPlainObject({})}>
              2A: Plain Object
            </ct-button>
            <ct-button onClick={createComplexWithCellRef({ scopesCell: preCreatedScopes })}>
              2B: Cell Ref
            </ct-button>
          </div>
        </div>

        {/* LEVEL 3: Real GoogleAuth */}
        <div style={{ background: "#fee2e2", padding: "16px", borderRadius: "8px", border: "2px solid #ef4444" }}>
          <h3 style={{ margin: "0 0 8px 0", color: "#b91c1c" }}>
            Level 3: REAL GoogleAuth Pattern
          </h3>
          <p style={{ fontSize: "13px", margin: "0 0 8px 0" }}>
            Actually imports and instantiates the GoogleAuth pattern from google-auth.tsx
          </p>
          <p style={{ fontSize: "13px", margin: "0 0 12px 0", color: "#b91c1c", fontWeight: "bold" }}>
            ⚠️ Test 3A may cause CPU spike - this is the REAL test
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <ct-button variant="destructive" onClick={createGoogleAuthWithPlainObject({})}>
              3A: GoogleAuth + Plain ⚠️
            </ct-button>
            <ct-button onClick={createGoogleAuthWithCellRef({ scopesCell: preCreatedScopes })}>
              3B: GoogleAuth + Cell Ref
            </ct-button>
          </div>
        </div>

        {/* Test Results Section */}
        <div style={{ background: "#f9fafb", padding: "16px", borderRadius: "8px", border: "1px solid #d1d5db" }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Test Results</h4>
          <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "13px" }}>
            <li><strong>1A (Simple + Plain):</strong> ✅ Works</li>
            <li><strong>1B (Simple + Cell):</strong> ✅ Works</li>
            <li><strong>2A (Complex + Plain):</strong> ✅ Works</li>
            <li><strong>2B (Complex + Cell):</strong> ✅ Works</li>
            <li><strong>3A (GoogleAuth + Plain):</strong> 🧪 THE REAL TEST</li>
            <li><strong>3B (GoogleAuth + Cell):</strong> 🧪 Testing...</li>
          </ul>
        </div>
      </div>
    ),
    testName: "CPU Spike Repro",
  };
});
