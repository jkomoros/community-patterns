/// <cts-enable />
// notes-module.tsx - Notes sub-charm for record pattern
import { type Default, NAME, recipe, UI } from "commontools";

interface NotesInput {
  content: Default<string, "">;
}

interface NotesOutput {
  content: Default<string, "">;
  subCharmType: "notes";
}

const NotesModule = recipe<NotesInput, NotesOutput>(
  "NotesModule",
  ({ content }) => {
    return {
      [NAME]: "Notes",
      [UI]: (
        <ct-vstack style={{ height: "100%", gap: "8px" }}>
          <ct-code-editor
            $value={content}
            language="text/markdown"
            theme="light"
            wordWrap
            placeholder="Add notes here. Start dumping data - structure comes later."
            style={{ flex: "1", minHeight: "300px" }}
          />
        </ct-vstack>
      ),
      content,
      subCharmType: "notes" as const,
    };
  },
);

export default NotesModule;
