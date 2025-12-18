/// <cts-enable />
import {
  cell,
  Default,
  ifElse,
  pattern,
  UI,
} from "commontools";

import { SmartTextInput } from "./lib/smart-text-input.tsx";

/**
 * Test pattern for SmartTextInput
 *
 * Tests:
 * 1. Image upload via ct-image-input
 * 2. Parallel OCR extraction
 * 3. Auto-concatenate to textarea
 * 4. Auto-hide images after commit
 */

interface TestInput {
  notes?: Default<string, "">;
}

interface TestOutput extends TestInput {
  title: string;
}

export default pattern<TestInput, TestOutput>(({ notes }) => {
  // Create SmartTextInput instance
  const smartInput = SmartTextInput({
    $value: notes,
    placeholder: "Upload grocery store images to extract aisle info...",
    ocrPrompt: "Extract all visible text from this grocery store photo. Include aisle numbers and product categories.",
  });

  return {
    title: "SmartTextInput Test",
    notes,
    [UI]: (
      <ct-screen>
        <ct-card>
          <ct-vstack gap={4}>
            <h2>SmartTextInput Test</h2>
            <p>Upload images to test OCR extraction. Text will auto-append to the textarea.</p>

            {/* SmartTextInput complete UI */}
            {smartInput.ui.complete}

            {/* Status display - use ifElse() for OpaqueRefs, not ternary */}
            <div style={{ padding: "8px", background: "#f0f0f0", borderRadius: "4px" }}>
              <strong>Status:</strong>{" "}
              {ifElse(smartInput.anyPending, "Processing...", "Ready")}
              {" | "}
              <strong>Pending:</strong> {smartInput.pendingCount}
            </div>
          </ct-vstack>
        </ct-card>
      </ct-screen>
    ),
  };
});
