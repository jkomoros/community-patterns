/// <cts-enable />
import {
  Writable,
  computed,
  type Default,
  generateText,
  handler,
  NAME,
  navigateTo,
  patternTool,
  recipe,
  str,
  Stream,
  UI,
  wish,
} from "commontools";
import { type MentionableCharm } from "./backlinks-index.tsx";
type Input = {
  title?: Writable<Default<string, "Untitled Note">>;
  content?: Writable<Default<string, "">>;
};

/** Represents a small #note a user took to remember some text. */
type Output = {
  mentioned: Default<Array<MentionableCharm>, []>;
  backlinks: MentionableCharm[];

  content: Default<string, "">;
  grep: Stream<{ query: string }>;
  translate: Stream<{ language: string }>;
  editContent: Stream<{ detail: { value: string } }>;
};

const _updateTitle = handler<
  { detail: { value: string } },
  { title: Writable<string> }
>(
  (event, state) => {
    state.title.set(event.detail?.value ?? "");
  },
);

const _updateContent = handler<
  { detail: { value: string } },
  { content: Writable<string> }
>(
  (event, state) => {
    state.content.set(event.detail?.value ?? "");
  },
);

const handleCharmLinkClick = handler<
  {
    detail: {
      charm: Writable<MentionableCharm>;
    };
  },
  Record<string, never>
>(({ detail }, _) => {
  return navigateTo(detail.charm);
});

const handleNewBacklink = handler<
  {
    detail: {
      text: string;
      charmId: any;
      charm: Writable<MentionableCharm>;
      navigate: boolean;
    };
  },
  {
    mentionable: Writable<MentionableCharm[]>;
  }
>(({ detail }, { mentionable }) => {
  console.log("new charm", detail.text, detail.charmId);

  if (detail.navigate) {
    return navigateTo(detail.charm);
  } else {
    mentionable.push(detail.charm as unknown as MentionableCharm);
  }
});

/** This edits the content */
const handleEditContent = handler<
  { detail: { value: string }; result?: Writable<string> },
  { content: Writable<string> }
>(
  ({ detail, result }, { content }) => {
    content.set(detail.value);
    result?.set("test!");
  },
);

const handleCharmLinkClicked = handler<void, { charm: Writable<MentionableCharm> }>(
  (_, { charm }) => {
    return navigateTo(charm);
  },
);

const Note = recipe<Input, Output>(
  "Note",
  ({ title, content }) => {
    const mentionable = wish<Default<MentionableCharm[], []>>(
      "#mentionable",
    );
    const mentioned = Cell.of<MentionableCharm[]>([]);

    // populated in backlinks-index.tsx
    const backlinks = Cell.of<MentionableCharm[]>([]);

    // The only way to serialize a pattern, apparently?
    const pattern = computed(() => JSON.stringify(Note));

    return {
      [NAME]: title,
      [UI]: (
        <ct-screen>
          <div slot="header">
            <ct-input
              $value={title}
              placeholder="Enter title..."
            />
          </div>

          <ct-code-editor
            $value={content}
            $mentionable={mentionable}
            $mentioned={mentioned}
            $pattern={pattern}
            onbacklink-click={handleCharmLinkClick({})}
            onbacklink-create={handleNewBacklink({ mentionable })}
            language="text/markdown"
            theme="light"
            wordWrap
            tabIndent
            lineNumbers
          />

          <ct-hstack slot="footer">
            {backlinks?.map((charm) => (
              <ct-button
                onClick={handleCharmLinkClicked({ charm })}
              >
                {charm?.[NAME]}
              </ct-button>
            ))}
          </ct-hstack>
        </ct-screen>
      ),
      title,
      content,
      mentioned,
      backlinks,
      grep: patternTool(
        ({ query, content }: { query: string; content: string }) => {
          return computed(() => {
            return content.split("\n").filter((c) => c.includes(query));
          });
        },
        { content },
      ),
      translate: patternTool(
        (
          { language, content }: {
            language: string;
            content: string;
          },
        ) => {
          const result = generateText({
            system: str`Translate the content to ${language}.`,
            prompt: str`<to_translate>${content}</to_translate>`,
          });

          return computed(() => {
            if (result?.pending) return undefined;
            if (result?.result == null) return "Error occured";
            return result.result;
          });
        },
        { content },
      ),
      editContent: handleEditContent({ content }),
    };
  },
);

export default Note;
