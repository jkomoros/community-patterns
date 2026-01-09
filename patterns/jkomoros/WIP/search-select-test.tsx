/// <cts-enable />
import { Writable, computed, Default, NAME, pattern, UI } from "commontools";
// TODO: search-select.tsx component doesn't exist yet - create it or remove this test file
// import SearchSelect, { SearchSelectItem } from "./components/search-select.tsx";

// Placeholder types until search-select.tsx is created
type SearchSelectItem = { value: string; label: string; group?: string };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SearchSelect = (_props: {
  items: SearchSelectItem[];
  selected: Writable<string[]>;
  placeholder?: string;
  maxVisible?: number;
}): JSX.Element => <div>SearchSelect component not implemented</div>;

// Test data - relationship types with groups
const RELATIONSHIP_ITEMS: SearchSelectItem[] = [
  // Professional
  { value: "colleague", label: "Colleague", group: "Professional" },
  { value: "manager", label: "Manager", group: "Professional" },
  { value: "mentor", label: "Mentor", group: "Professional" },
  { value: "client", label: "Client", group: "Professional" },
  // Personal
  { value: "friend", label: "Friend", group: "Personal" },
  { value: "acquaintance", label: "Acquaintance", group: "Personal" },
  { value: "neighbor", label: "Neighbor", group: "Personal" },
  // Family
  { value: "spouse", label: "Spouse", group: "Family" },
  { value: "parent", label: "Parent", group: "Family" },
  { value: "sibling", label: "Sibling", group: "Family" },
  { value: "cousin", label: "Cousin", group: "Family" },
];

interface TestInput {
  initialSelected: Default<string[], []>;
}

export default pattern<TestInput>(({ initialSelected }) => {
  // Create the selected cell with initial values
  const selected = Writable.of<string[]>(initialSelected || []);

  // Create the search-select instance
  const relationshipSelector = SearchSelect({
    items: RELATIONSHIP_ITEMS,
    selected: selected,
    placeholder: "Search relationship types...",
    maxVisible: 6,
  });

  // Computed display of current selection for verification
  const selectionDisplay = computed(() => {
    const sel = selected.get();
    return sel.length === 0 ? "None selected" : sel.join(", ");
  });

  return {
    [NAME]: "Search Select Test",
    selected,
    [UI]: (
      <ct-vstack gap="4" style={{ padding: "20px", maxWidth: "600px" }}>
        <ct-card>
          <h2 style={{ margin: "0 0 16px 0" }}>Search Select Component Test</h2>

          <div style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#64748b" }}>
              Relationship Types
            </h3>
            {relationshipSelector}
          </div>

          <div
            style={{
              padding: "12px",
              background: "#f8fafc",
              borderRadius: "6px",
              marginTop: "16px",
            }}
          >
            <strong style={{ fontSize: "13px", color: "#64748b" }}>
              Current Selection:
            </strong>
            <div style={{ marginTop: "4px", fontSize: "14px" }}>
              {selectionDisplay}
            </div>
          </div>
        </ct-card>
      </ct-vstack>
    ),
  };
});
