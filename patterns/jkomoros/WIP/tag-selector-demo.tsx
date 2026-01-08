/// <cts-enable />

/**
 * Tag Selector Demo - Demonstrates ct-autocomplete with a tag/chip list
 *
 * This pattern shows how to wire ct-autocomplete to a userland tag display,
 * creating a multi-select experience from the single-select autocomplete component.
 */

import { Writable, computed, Default, NAME, pattern, UI, equals } from "commontools";

// Sample relationship types for demo
const RELATIONSHIP_ITEMS = [
  { value: "colleague", label: "Colleague", group: "Professional" },
  { value: "manager", label: "Manager", group: "Professional" },
  { value: "mentor", label: "Mentor", group: "Professional", searchAliases: ["advisor", "guide"] },
  { value: "report", label: "Direct Report", group: "Professional" },
  { value: "friend", label: "Friend", group: "Personal" },
  { value: "close-friend", label: "Close Friend", group: "Personal", searchAliases: ["bestie", "bff"] },
  { value: "acquaintance", label: "Acquaintance", group: "Personal" },
  { value: "parent", label: "Parent", group: "Family", searchAliases: ["mom", "dad", "mother", "father"] },
  { value: "sibling", label: "Sibling", group: "Family", searchAliases: ["sister", "brother", "bro", "sis"] },
  { value: "child", label: "Child", group: "Family", searchAliases: ["son", "daughter", "kid"] },
  { value: "spouse", label: "Spouse", group: "Family", searchAliases: ["husband", "wife", "partner"] },
  { value: "extended", label: "Extended Family", group: "Family", searchAliases: ["aunt", "uncle", "cousin", "grandparent"] },
  { value: "neighbor", label: "Neighbor", group: "Community" },
  { value: "classmate", label: "Classmate", group: "Community", searchAliases: ["schoolmate"] },
  { value: "teammate", label: "Teammate", group: "Community" },
];

interface TagItem {
  value: string;
}

type Input = {
  selectedTags: Writable<Default<TagItem[], []>>;
};

type Result = {
  selectedTags: TagItem[];
};

// Get label for a value
const getLabel = (value: string) => {
  const item = RELATIONSHIP_ITEMS.find(i => i.value === value);
  return item?.label || value;
};

export default pattern<Input, Result>(
  ({ selectedTags }) => {
    // Use computed to compute available items reactively
    const availableItems = computed(() => {
      const selectedValues = (selectedTags || []).map(t => t.value);
      return RELATIONSHIP_ITEMS.filter(item => !selectedValues.includes(item.value as any));
    });

    return {
      [NAME]: "Tag Selector Demo",
      [UI]: (
        <ct-vstack gap="4" style={{ padding: "1rem", maxWidth: "500px" }}>
          <h2>Tag Selector Demo</h2>
          <p style={{ color: "#666", fontSize: "0.875rem" }}>
            This demonstrates using <code>ct-autocomplete</code> with a userland
            tag display to create a multi-select experience.
          </p>

          <ct-card>
            <ct-vstack gap="3">
              <label style={{ fontWeight: "500" }}>Relationship Types</label>

              {/* Selected tags display - using Cell.map() */}
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                minHeight: "2rem",
              }}>
                {selectedTags.map((tag) => (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      padding: "0.25rem 0.5rem",
                      backgroundColor: "#e0e7ff",
                      color: "#3730a3",
                      borderRadius: "9999px",
                      fontSize: "0.875rem",
                    }}
                  >
                    {getLabel(tag.value)}
                    <button
                      onClick={() => {
                        const current = selectedTags.get();
                        const index = current.findIndex((el) => equals(tag, el));
                        if (index >= 0) {
                          selectedTags.set(current.toSpliced(index, 1));
                        }
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "1rem",
                        height: "1rem",
                        padding: "0",
                        border: "none",
                        background: "transparent",
                        color: "#6366f1",
                        cursor: "pointer",
                        borderRadius: "50%",
                        fontSize: "1rem",
                        lineHeight: "1",
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Autocomplete for adding */}
              <ct-autocomplete
                items={availableItems}
                placeholder="Search to add..."
                onct-select={(e: { detail: { value: string } }) => {
                  const value = e.detail?.value;
                  if (value) {
                    const current = selectedTags.get() || [];
                    const exists = current.some(t => t.value === value);
                    if (!exists) {
                      selectedTags.push({ value });
                    }
                  }
                }}
                allowCustom={true}
              />
            </ct-vstack>
          </ct-card>

          {/* Debug output */}
          <ct-card>
            <ct-vstack gap="2">
              <label style={{ fontWeight: "500", fontSize: "0.875rem" }}>Selected Values (debug)</label>
              <code style={{
                padding: "0.5rem",
                backgroundColor: "#f3f4f6",
                borderRadius: "0.25rem",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
              }}>
                {computed(() => JSON.stringify(selectedTags || [], null, 2))}
              </code>
            </ct-vstack>
          </ct-card>

          <p style={{ color: "#666", fontSize: "0.75rem" }}>
            Try typing "sister" to find "Sibling" (via searchAliases), or type
            a custom value and press Enter to add it.
          </p>
        </ct-vstack>
      ),
      selectedTags,
    };
  }
);
