/// <cts-enable />
/**
 * Notes Module - Sub-charm for freeform notes/text
 *
 * This is the built-in default module that's always present in a Record.
 */
import { computed, type Default, NAME, recipe, UI } from "commontools";

export interface NotesModuleInput {
  notes: Default<string, "">;
}

export const NotesModule = recipe<NotesModuleInput, NotesModuleInput>(
  "NotesModule",
  ({ notes }) => {
    const displayText = computed(() => {
      const text = (notes as unknown as string)?.trim() || "";
      const count = text ? text.split(/\s+/).filter(Boolean).length : 0;
      return count > 0 ? `${count} word${count !== 1 ? "s" : ""}` : "Empty";
    });

    return {
      [NAME]: computed(() => `📝 Notes: ${displayText}`),
      [UI]: (
        <ct-vstack style={{ gap: "8px", height: "100%" }}>
          <ct-textarea
            $value={notes}
            placeholder="Add notes..."
            style={{
              flex: "1",
              minHeight: "120px",
              resize: "vertical",
            }}
          />
          <div style={{ fontSize: "12px", color: "#9ca3af", textAlign: "right" }}>
            {displayText}
          </div>
        </ct-vstack>
      ),
      notes,
    };
  }
);

export default NotesModule;
