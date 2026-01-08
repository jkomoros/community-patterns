/// <cts-enable />
import { Writable, computed, Default, handler, NAME, pattern, UI } from "commontools";

// PII categories for structured input
type PIICategory = "name" | "email" | "phone" | "ssn" | "address" | "custom";

interface PIIEntry {
  category: PIICategory;
  value: string;
}

interface InputSchema {
  title: Default<string, "Simple PII Vault">;
  entries: Default<PIIEntry[], []>;
}

/** Sensitive PII vault for storing personal information. #piiVault */
interface Output {
  title: string;
  entries: PIIEntry[];
  /** Total number of PII entries in the vault */
  entryCount: number;
}

// Category display info
const CATEGORY_INFO: Record<PIICategory, { label: string; placeholder: string }> = {
  name: { label: "Name", placeholder: "John Smith" },
  email: { label: "Email", placeholder: "john@example.com" },
  phone: { label: "Phone", placeholder: "555-123-4567" },
  ssn: { label: "SSN", placeholder: "123-45-6789" },
  address: { label: "Address", placeholder: "123 Main St, Anytown" },
  custom: { label: "Custom", placeholder: "Any sensitive text" },
};

// Handler for adding entries
const addEntry = handler<
  unknown,
  { entries: Writable<PIIEntry[]>; category: Writable<PIICategory>; value: Writable<string> }
>((_event, { entries, category, value }) => {
  const val = value.get().trim();
  if (val) {
    entries.push({ category: category.get(), value: val });
    value.set("");
  }
});

// Handler for removing entries
const removeEntry = handler<
  unknown,
  { entries: Writable<Array<Writable<PIIEntry>>>; entry: Writable<PIIEntry> }
>((_event, { entries, entry }) => {
  entries.remove(entry);
});

export default pattern<InputSchema, Output>(({ title, entries }) => {
  // Local state for the add form
  const newCategory = Writable.of<PIICategory>("name");
  const newValue = Writable.of("");

  // Computed stats
  const entryCount = computed(() => entries.length);
  const entriesByCategory = computed(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries) {
      counts[entry.category] = (counts[entry.category] || 0) + 1;
    }
    return counts;
  });

  // Get placeholder for current category
  const currentPlaceholder = computed(() => {
    const cat = newCategory.get();
    return CATEGORY_INFO[cat]?.placeholder || "Enter value...";
  });

  return {
    [NAME]: title,
    [UI]: (
      <div style={{ padding: "1rem", maxWidth: "800px" }}>
        <h2 style={{ margin: "0 0 1rem 0" }}>{title}</h2>

        {/* Stats bar */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            marginBottom: "1rem",
            fontSize: "13px",
            color: "#666",
          }}
        >
          <span>{entryCount} entries</span>
          {computed(() => {
            const cats = entriesByCategory;
            return Object.entries(cats)
              .map(([cat, count]) => `${count} ${cat}`)
              .join(" | ");
          })}
        </div>

        {/* Add form */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1rem",
            alignItems: "flex-end",
          }}
        >
          <div style={{ minWidth: "120px" }}>
            <label
              style={{
                display: "block",
                marginBottom: "4px",
                fontSize: "12px",
                fontWeight: "500",
              }}
            >
              Category
            </label>
            <ct-select
              $value={newCategory}
              items={[
                { label: "Name", value: "name" },
                { label: "Email", value: "email" },
                { label: "Phone", value: "phone" },
                { label: "SSN", value: "ssn" },
                { label: "Address", value: "address" },
                { label: "Custom", value: "custom" },
              ]}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "block",
                marginBottom: "4px",
                fontSize: "12px",
                fontWeight: "500",
              }}
            >
              Value
            </label>
            <ct-input $value={newValue} placeholder={currentPlaceholder} />
          </div>
          <ct-button
            onClick={addEntry({ entries, category: newCategory, value: newValue })}
          >
            Add
          </ct-button>
        </div>

        {/* Entries list */}
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          {computed(() => {
            if (entries.length === 0) {
              return (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "#999",
                  }}
                >
                  No PII entries yet. Add some above.
                </div>
              );
            }
            return null;
          })}

          {entries.map((entry) => (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: "500",
                  backgroundColor: "#f3f4f6",
                  color: "#374151",
                  minWidth: "60px",
                  textAlign: "center",
                }}
              >
                {entry.category}
              </span>
              <span style={{ flex: 1, fontFamily: "monospace" }}>
                {entry.value}
              </span>
              <ct-button
                variant="destructive"
                size="sm"
                onClick={removeEntry({ entries, entry })}
              >
                Remove
              </ct-button>
            </div>
          ))}
        </div>
      </div>
    ),
    title,
    entries,
    entryCount,
  };
});
