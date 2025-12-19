/// <cts-enable />
/**
 * Notes Module - Sub-charm for freeform notes/text with backlinks support
 *
 * Uses ct-code-editor with wiki-link syntax ([[) for linking to other charms.
 */
import {
  Cell,
  computed,
  type Default,
  handler,
  NAME,
  navigateTo,
  recipe,
  UI,
  wish,
} from "commontools";

// Define MentionableCharm type inline (matches backlinks-index.tsx)
// to avoid import path resolution issues
type MentionableCharm = {
  [NAME]?: string;
  mentioned: MentionableCharm[];
  backlinks: MentionableCharm[];
};

export interface NotesModuleInput {
  notes: Default<string, "">;
}

export interface NotesModuleOutput extends NotesModuleInput {
  mentioned: Default<MentionableCharm[], []>;
}

// Handler for clicking on existing wiki links
const handleCharmLinkClick = handler<
  { detail: { charm: Cell<MentionableCharm> } },
  Record<string, never>
>(({ detail }, _) => {
  return navigateTo(detail.charm);
});

// Handler for creating new wiki links
const handleNewBacklink = handler<
  {
    detail: {
      text: string;
      charmId: unknown;
      charm: Cell<MentionableCharm>;
      navigate: boolean;
    };
  },
  { mentionable: Cell<MentionableCharm[]> }
>(({ detail }, { mentionable }) => {
  if (detail.navigate) {
    return navigateTo(detail.charm);
  } else {
    mentionable.push(detail.charm as unknown as MentionableCharm);
  }
});

export const NotesModule = recipe<NotesModuleInput, NotesModuleOutput>(
  "NotesModule",
  ({ notes }) => {
    // Backlink infrastructure
    const mentionable = wish<Default<MentionableCharm[], []>>("#mentionable");
    const mentioned = Cell.of<MentionableCharm[]>([]);
    const pattern = computed(() => JSON.stringify(NotesModule));

    // Word count display
    const displayText = computed(() => {
      const text = (notes as unknown as string)?.trim() || "";
      const count = text ? text.split(/\s+/).filter(Boolean).length : 0;
      return count > 0 ? `${count} word${count !== 1 ? "s" : ""}` : "Empty";
    });

    return {
      [NAME]: computed(() => `📝 Notes: ${displayText}`),
      [UI]: (
        <ct-vstack style={{ gap: "8px", height: "100%" }}>
          <ct-code-editor
            $value={notes}
            $mentionable={mentionable}
            $mentioned={mentioned}
            $pattern={pattern}
            onbacklink-click={handleCharmLinkClick({})}
            onbacklink-create={handleNewBacklink({ mentionable })}
            language="text/markdown"
            theme="light"
            wordWrap
            style="flex: 1; min-height: 120px;"
          />
          <div style={{ fontSize: "12px", color: "#9ca3af", textAlign: "right" }}>
            {displayText}
          </div>
        </ct-vstack>
      ),
      notes,
      mentioned,
    };
  }
);

export default NotesModule;
