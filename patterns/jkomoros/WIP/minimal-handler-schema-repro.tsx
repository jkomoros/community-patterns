/// <cts-enable />
/**
 * MINIMAL REPRO: Handler Generic Type Schema Bug
 *
 * This pattern demonstrates that generic type parameters in handler<T>()
 * produce incomplete schemas when compiled by CTS.
 *
 * To see the issue:
 *   cd ~/Code/labs
 *   deno task ct dev ../community-patterns-3/patterns/jkomoros/WIP/minimal-handler-schema-repro.tsx --show-transformed
 *
 * Look for the generated schemas - the generic handler's input schema
 * will be missing fields that only exist in the type parameter.
 */
import { Writable, generateObject, handler, NAME, pattern, UI } from "commontools";

// ============================================================================
// ISSUE: Generic type parameters produce incomplete schemas
// ============================================================================

// Define a record type
interface MyRecord {
  id: string;
  name: string;
  category: string;
  priority: number;
}

// This generic factory function creates handlers
// BUT: The CTS compiler can't resolve T at compile time!
function createGenericHandler<T extends { id: string }>() {
  return handler<
    Omit<T, "id"> & { result?: Writable<any> },  // T is unknown to compiler!
    { items: Writable<T[]> }
  >((input, state) => {
    // This works at RUNTIME - input has the fields
    // But LLM never gets the schema to know what fields to send!
    const items = state.items.get() || [];
    const id = `item-${Date.now()}`;
    const newItem = { ...input, id } as unknown as T;
    state.items.set([...items, newItem]);

    if ((input as any).result) {
      (input as any).result.set({ success: true });
    }
    return { success: true };
  });
}

// ============================================================================
// SOLUTION: Use explicit JSON schema (not generic types)
// ============================================================================

// This handler uses explicit schema - WORKS!
const explicitSchemaHandler = handler(
  // INPUT SCHEMA - what LLM will send
  {
    type: "object",
    properties: {
      name: { type: "string", description: "Name of the item" },
      category: { type: "string", description: "Category of the item" },
      priority: { type: "number", description: "Priority 1-10" },
      result: { type: "object", asCell: true },
    },
    required: ["name", "category", "priority"],
  },
  // STATE SCHEMA - bound cells
  {
    type: "object",
    properties: {
      items: { type: "array", items: {}, asCell: true },
    },
    required: ["items"],
  },
  // CALLBACK
  (input: { name: string; category: string; priority: number; result?: Writable<any> },
   state: { items: Writable<MyRecord[]> }) => {
    const items = state.items.get() || [];
    const id = `item-${Date.now()}`;
    const newItem: MyRecord = {
      id,
      name: input.name,
      category: input.category,
      priority: input.priority,
    };
    state.items.set([...items, newItem]);

    if (input.result) {
      input.result.set({ success: true });
    }
    return { success: true };
  },
);

// ============================================================================
// PATTERN: Compare both approaches
// ============================================================================

interface Input {
  itemsGeneric: Writable<MyRecord[]>;
  itemsExplicit: Writable<MyRecord[]>;
  testPrompt: string;
}

export default pattern<Input>(({ itemsGeneric, itemsExplicit, testPrompt }) => {
  // Create handlers
  const genericHandler = createGenericHandler<MyRecord>();

  // Agent using GENERIC handler - WON'T WORK (incomplete schema)
  const agentGeneric = generateObject({
    prompt: testPrompt,
    system: "You are a test agent. Call the addItem tool with test data.",
    schema: { type: "object", properties: { done: { type: "boolean" } } },
    tools: {
      addItem: {
        description: "Add a new item with name, category, and priority",
        handler: genericHandler({ items: itemsGeneric }),
        // ^^^ Schema will only have "result", missing name/category/priority!
      },
    },
  });

  // Agent using EXPLICIT schema handler - WORKS
  const agentExplicit = generateObject({
    prompt: testPrompt,
    system: "You are a test agent. Call the addItem tool with test data.",
    schema: { type: "object", properties: { done: { type: "boolean" } } },
    tools: {
      addItem: {
        description: "Add a new item with name, category, and priority",
        handler: explicitSchemaHandler({ items: itemsExplicit }),
        // ^^^ Schema correctly includes name, category, priority!
      },
    },
  });

  return {
    [NAME]: "Handler Schema Bug Repro",
    itemsGeneric,
    itemsExplicit,
    [UI]: (
      <div style={{ padding: "16px" }}>
        <h2>Handler Generic Type Schema Bug</h2>
        <p>This demonstrates that generic handlers produce incomplete LLM tool schemas.</p>

        <h3>Generic Handler Items:</h3>
        <pre>{itemsGeneric}</pre>

        <h3>Explicit Schema Handler Items:</h3>
        <pre>{itemsExplicit}</pre>
      </div>
    ),
  };
});
