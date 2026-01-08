/// <cts-enable />
import {
  BuiltInLLMMessage,
  Writable,
  writable,
  computed,
  Default,
  derive,
  handler,
  llmDialog,
  NAME,
  navigateTo,
  pattern,
  Stream,
  UI,
} from "commontools";

// Import patterns directly - optional defaults make {} work for all fields
import Note from "./lib/note.tsx";
import Person from "./person.tsx";
import PageCreator from "./page-creator.tsx";
import StoreMapper from "./store-mapper.tsx";
import FoodRecipe from "./food-recipe.tsx";

type Input = {
  instructions: Default<string, "">;
};

type Output = {
  [NAME]: string;
  [UI]: unknown;
  messages: BuiltInLLMMessage[];
  executeSetup: Stream<void>;
};

// Tool: Create a Note charm with given title and content
const createNote = handler<
  { title: string; content: string },
  { createdCharms: Writable<string[]> }
>(({ title, content }, { createdCharms }) => {
  const result = navigateTo(Note({ title, content }));
  createdCharms.push(`Note: "${title}"`);
  return result;
});

// Tool: Create a Person charm - optional defaults handle missing fields
const createPerson = handler<
  {
    displayName: string;
    givenName?: string;
    familyName?: string;
    birthday?: string;
    notes?: string;
  },
  { createdCharms: Writable<string[]> }
>((
  { displayName, givenName, familyName, birthday, notes },
  { createdCharms },
) => {
  const result = navigateTo(Person({
    displayName,
    givenName: givenName || "",
    familyName: familyName || "",
    birthday: birthday || "",
    notes: notes || "",
  }));
  createdCharms.push(`Person: "${displayName}"`);
  return result;
});

// Tool: Create a PageCreator instance
const createPageCreator = handler<
  Record<string, never>,
  { createdCharms: Writable<string[]> }
>((_args, { createdCharms }) => {
  const result = navigateTo(PageCreator(undefined));
  createdCharms.push("Page Creator");
  return result;
});

// Tool: Create a Store Mapper instance - optional defaults handle missing fields
const createStoreMapper = handler<
  {
    storeName?: string;
  },
  { createdCharms: Writable<string[]> }
>(({ storeName }, { createdCharms }) => {
  const result = navigateTo(StoreMapper({
    storeName: storeName || "",
  }));
  createdCharms.push(`Store Mapper: "${storeName || "Unnamed Store"}"`);
  return result;
});

// Tool: Create a Food Recipe charm - optional defaults handle missing fields
const createFoodRecipe = handler<
  {
    name?: string;
    notes?: string;
  },
  { createdCharms: Writable<string[]> }
>(({ name, notes }, { createdCharms }) => {
  const result = navigateTo(FoodRecipe({
    name: name || "",
    notes: notes || "",
  }));
  createdCharms.push(`Recipe: "${name || "Untitled"}"`);
  return result;
});

// Tool: List all charms created so far
const listCreatedCharms = handler<
  Record<string, never>,
  { createdCharms: Writable<string[]> }
>((_args, { createdCharms }) => {
  const charms = createdCharms.get();
  if (charms.length === 0) {
    return "No charms created yet.";
  } else {
    return `Created charms:\n${
      charms.map((c, i) => `${i + 1}. ${c}`).join("\n")
    }`;
  }
});

// Handler to start executing the setup
const startExecution = handler<
  never,
  {
    addMessage: Stream<BuiltInLLMMessage>;
    instructions: string;
    executed: Writable<boolean>;
    cacheBuster: string;
  }
>((_event, { addMessage, instructions, executed, cacheBuster }) => {
  console.log("startExecution - instructions:", instructions?.substring(0, 50), "cacheBuster:", cacheBuster);

  // Guard against undefined/empty instructions
  if (!instructions || instructions.trim() === "") {
    console.error("Instructions are empty or undefined, cannot execute");
    return;
  }

  if (!executed.get()) {
    // Append cache buster to instructions to ensure fresh LLM response
    const cacheBustedInstructions = cacheBuster
      ? `${instructions}\n\n[${cacheBuster}]`
      : instructions;

    console.log("Sending message:", cacheBustedInstructions?.substring(0, 100));
    addMessage.send({
      role: "user",
      content: cacheBustedInstructions,
    });
    executed.set(true);
  }
});

// Handler to reset the setup (clear messages and allow re-execution)
// Adds a cache-busting timestamp to ensure fresh LLM response on retry
const resetExecution = handler<
  never,
  {
    messages: Writable<BuiltInLLMMessage[]>;
    createdCharms: Writable<string[]>;
    executed: Writable<boolean>;
    cacheBuster: Writable<string>;
  }
>((_event, { messages, createdCharms, executed, cacheBuster }) => {
  messages.set([]);
  createdCharms.set([]);
  executed.set(false);
  // Update cache buster to ensure next execution gets fresh LLM response
  cacheBuster.set(`retry-${Date.now()}`);
});

export default pattern<Input, Output>(
  ({ instructions }) => {
    const model = Writable.of<string>("anthropic:claude-sonnet-4-5");
    const messages = Writable.of<BuiltInLLMMessage[]>([]);
    const createdCharms = Writable.of<string[]>([]);
    const executed = Writable.of(false);
    const cacheBuster = Writable.of<string>(""); // For cache busting on reset

    // Define tools for the LLM
    const tools = {
      createNote: {
        description:
          "Create a new Note charm with a title and markdown content",
        handler: createNote({ createdCharms }),
      },
      createPerson: {
        description:
          "Create a new Person charm with displayName, givenName, familyName, birthday (MM/DD/YY format), and notes fields",
        handler: createPerson({ createdCharms }),
      },
      createPageCreator: {
        description:
          "Instantiate the Page Creator pattern to allow launching person and counter pages",
        handler: createPageCreator({ createdCharms }),
      },
      createStoreMapper: {
        description:
          "Create a new Store Mapper charm with optional storeName to map grocery store layouts",
        handler: createStoreMapper({ createdCharms }),
      },
      createFoodRecipe: {
        description:
          "Create a new Food Recipe charm with name and notes fields for recipe data extraction demo",
        handler: createFoodRecipe({ createdCharms }),
      },
      listCreatedCharms: {
        description: "List all charms that have been created during this setup",
        handler: listCreatedCharms({ createdCharms }),
      },
    };

    const llmState = llmDialog({
      system:
        `You are a space setup orchestrator. Execute setup instructions by calling tools.

CRITICAL RULES:
1. ALWAYS call tools - never just describe what you'll do
2. Call tools IMMEDIATELY in your first response
3. Do NOT say "I'll..." or "I will..." - just call the tools
4. Use ONLY the tools provided to you
5. Call tools with EXACT parameters specified in instructions
6. After calling all tools, respond with: "Setup complete! All charms created successfully."

Available tools:
- createPageCreator() - creates Page Creator
- createPerson({displayName, givenName, familyName, birthday, notes}) - creates Person
- createStoreMapper({storeName}) - creates Store Mapper for grocery store layouts
- createFoodRecipe({name, notes}) - creates Food Recipe
- createNote({title, content}) - creates Note
- listCreatedCharms() - lists what you created

Execute the instructions by calling the appropriate tools immediately, then confirm completion.`,
      messages,
      tools,
      model,
    });

    const { addMessage, pending } = llmState;

    const executeButton = (
      <ct-button
        onClick={startExecution({ addMessage, instructions, executed, cacheBuster })}
        disabled={computed(() => {
          // Disable if instructions are empty/undefined or if already executing
          const hasInstructions = instructions && typeof instructions === "string" && instructions.trim() !== "";
          return !hasInstructions || llmState.pending;
        })}
      >
        {computed(() => {
          const exec = executed.get();
          const pend = llmState.pending;
          const hasInstructions = instructions && typeof instructions === "string" && instructions.trim() !== "";

          if (pend) return "Executing...";
          if (exec) return "Setup Complete";
          if (!hasInstructions) return "Loading...";
          return "Execute Setup";
        })}
      </ct-button>
    );

    return {
      [NAME]: "Space Setup",
      [UI]: (
        <ct-screen>
          <div slot="header">
            <ct-heading level={3}>Space Setup Orchestrator</ct-heading>
          </div>

          <ct-vscroll flex showScrollbar>
            <ct-vstack style="padding: 12px;" gap="2">
              <ct-vstack gap="1">
                <ct-heading level={5} style="margin: 0; font-size: 13px; font-weight: 600;">Setup Instructions</ct-heading>
                <ct-text style="
                    white-space: pre-wrap;
                    background: #f5f5f5;
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 11px;
                    lineHeight: 1.4;
                  ">
                  {instructions}
                </ct-text>
              </ct-vstack>

              <ct-hstack gap="2">
                {executeButton}
                <ct-button
                  onClick={resetExecution({ messages, createdCharms, executed, cacheBuster })}
                  variant="secondary"
                >
                  Reset
                </ct-button>
              </ct-hstack>

              <ct-vstack gap="1">
                <ct-heading level={6} style="margin: 0; font-size: 12px; font-weight: 600;">Created Charms</ct-heading>
                {computed(() => {
                  const charms = createdCharms.get();
                  if (charms.length === 0) {
                    return <ct-text style="color: #666;">None yet</ct-text>;
                  }
                  return (
                    <ct-vstack gap="1">
                      {charms.map((charm) => <ct-text>• {charm}</ct-text>)}
                    </ct-vstack>
                  );
                })}
              </ct-vstack>

              <ct-vstack gap="1">
                <ct-heading level={6} style="margin: 0; font-size: 12px; font-weight: 600;">Execution Log</ct-heading>
                <div style="min-height: 150px;">
                  <ct-chat
                    $messages={messages}
                    pending={pending}
                  />
                </div>
              </ct-vstack>
            </ct-vstack>
          </ct-vscroll>
        </ct-screen>
      ),
      messages,
      executeSetup: startExecution({ addMessage, instructions, executed, cacheBuster }),
    };
  },
);
