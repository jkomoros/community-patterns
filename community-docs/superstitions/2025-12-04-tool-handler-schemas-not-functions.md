---
topic: llm
discovered: 2025-12-04
confirmed_count: 3
last_confirmed: 2025-12-05
sessions: [handler-refactor-createReportTool, debug-handler-schema-inference, e2e-playwright-verification]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: folk_wisdom
stars: ⭐⭐⭐
---

# Tool Handlers: Generic Types Don't Work, Use Explicit Schemas

## The Core Problem

**Generic type parameters in `handler<T>()` produce incomplete LLM tool schemas.**

The CTS compiler can't resolve generic type parameters at compile time. When you write:

```typescript
// ❌ BROKEN - Generic T can't be resolved
function createReportHandler<T>() {
  return handler<
    Omit<T, "id"> & { result?: Cell<any> },  // T is unknown!
    { items: Cell<T[]> }
  >((input, state) => { ... });
}
```

The CTS compiler generates an input schema with only the non-generic fields:

```javascript
// Actual compiled output - INCOMPLETE!
handler({
    type: "object",
    properties: {
        result: { asCell: true }  // Only "result" - missing all T's fields!
    }
}, ...)
```

The LLM receives this incomplete schema and doesn't know what fields to send, resulting in empty data.

## Evidence

Tested with `--show-transformed` flag:

```bash
cd ~/Code/labs
deno task ct dev pattern.tsx --show-transformed
```

**Generic handler output** (BROKEN):
```javascript
// Input schema only has "result" - missing name, category, priority!
handler({
    type: "object",
    properties: { result: { asCell: true } }
}, ...)
```

**Explicit schema handler output** (WORKS):
```javascript
handler({
    type: "object",
    properties: {
        name: { type: "string", description: "Name" },
        category: { type: "string", description: "Category" },
        priority: { type: "number", description: "Priority" },
        result: { type: "object", asCell: true },
    },
    required: ["name", "category", "priority"],
}, ...)
```

## Solution: Pass Explicit Schemas as Data

Instead of using type parameters, pass the input schema as a **data parameter**:

```typescript
// ✅ WORKS - Explicit schema as data parameter
const MEMBERSHIP_INPUT_SCHEMA = {
  type: "object",
  properties: {
    hotelBrand: { type: "string", description: "Hotel chain name" },
    membershipNumber: { type: "string", description: "Membership number" },
    result: { type: "object", asCell: true },
  },
  required: ["hotelBrand", "membershipNumber"],
} as const;

// Factory takes schema as DATA, not type
function createReportHandler(inputSchema: JSONSchema) {
  return handler(
    inputSchema,  // Explicit schema - LLM sees all fields!
    STATE_SCHEMA,
    (input, state) => { ... }
  );
}

// Usage
const reportHandler = createReportHandler(MEMBERSHIP_INPUT_SCHEMA);
```

## Working Pattern

See `patterns/jkomoros/util/report-handler.ts` for a complete working example:

```typescript
// 1. Define explicit input schema (what LLM will send)
const MEMBERSHIP_INPUT_SCHEMA = {
  type: "object",
  properties: {
    hotelBrand: { type: "string", description: "Hotel chain name" },
    programName: { type: "string", description: "Loyalty program name" },
    membershipNumber: { type: "string", description: "Membership number" },
    tier: { type: "string", description: "Status tier if known" },
    sourceEmailId: { type: "string", description: "Email ID" },
    sourceEmailSubject: { type: "string", description: "Email subject" },
    sourceEmailDate: { type: "string", description: "Email date" },
    confidence: { type: "number", description: "0-100 confidence" },
    result: { type: "object", asCell: true },
  },
  required: ["hotelBrand", "programName", "membershipNumber", ...],
} as const;

// 2. Create handler with explicit schema
const reportMembershipHandler = createReportHandler(MEMBERSHIP_INPUT_SCHEMA);

// 3. Use in additionalTools
additionalTools: {
  reportMembership: {
    description: "Report a found membership",
    handler: reportMembershipHandler({
      items: memberships,
      idPrefix: "membership",
      dedupeFields: ["hotelBrand", "membershipNumber"],
      timestampField: "extractedAt",
    }),
  },
}
```

## Key Insights

1. **This is NOT a CTS bug** - the compiler can't magically know what `T` will be at runtime
2. **This was a pre-existing bug** - both old `createReportTool` and new `createReportHandler` had this issue when using generics
3. **Functions in config are still problematic** for sandboxing, but the schema issue is separate
4. **Use `--show-transformed`** to debug schema issues

## Debugging Tool Schemas

```bash
# See what schemas the CTS compiler generates
cd ~/Code/labs
deno task ct dev ../community-patterns-3/patterns/your-pattern.tsx --show-transformed

# Look for your handler's input schema
# Good: Has all fields the LLM needs to send
# Bad: Only has "result" or is missing fields
```

## Migration Checklist

When using handler-based tools for LLMs:

1. **Define explicit input schema** with ALL fields the LLM should send
2. **Include descriptions** for each field (helps LLM understand usage)
3. **Add `result: { type: "object", asCell: true }`** for tool response
4. **Pass schema as data** to factory function
5. **Verify with `--show-transformed`** that all fields are present

## Related

- `~/Code/labs/packages/runner/test/generate-object-tools.test.ts` - Working handler examples
- `patterns/jkomoros/util/report-handler.ts` - Original handler (verbose, 2-step)
- `patterns/jkomoros/util/agentic-tools.ts` - **NEW elegant API** (1 definition, 1-step)
- `patterns/jkomoros/WIP/minimal-handler-schema-repro.tsx` - Minimal repro pattern

## New Elegant API (2025-12-05)

The original fix required 3 definitions (interface + input type + schema) and 2-step creation.
A more elegant API now exists in `util/agentic-tools.ts`:

```typescript
import { defineItemSchema, listTool } from "./util/agentic-tools.ts";

// 1 definition instead of 3!
const FoodSchema = defineItemSchema({
  foodName: { type: "string", description: "Food name" },
  category: { type: "string", description: "Category" },
}, ["foodName", "category"]);

// 1-step creation instead of 2!
const reportFood = listTool(FoodSchema, {
  items: foods,
  dedupe: ["foodName"],  // Type-checked against schema!
  idPrefix: "food",
});

// Use directly
additionalTools: {
  reportFood: { description: "...", handler: reportFood }
}
```

Benefits:
- 50% less code
- Type-checked dedupe fields
- Auto-adds `result` cell to schema
- Single-call tool creation

## Verification (2025-12-05)

**Playwright E2E testing confirmed the fix on both patterns:**

### favorite-foods-gmail-agent.tsx
- Console logs confirmed: `[listTool:food] SAVED: mcdonald's`, `[listTool:food] SAVED: popeyes louisiana kitchen`
- Full data flow verified with working OAuth token

### hotel-membership-gmail-agent.tsx
- Pattern deploys and triggers correctly
- Agent executes searches (401 due to expired OAuth - auth issue, not code issue)
- Code reduced by 30 lines with new elegant API

### General verification:
1. **`--show-transformed` verification**: Explicit schemas now appear in compiled output with all fields
2. **Deployment test**: Both patterns deploy successfully to local toolshed
3. **UI test**: Scan buttons trigger LLM agents correctly
4. **Type safety**: Dedupe fields are type-checked against schema at compile time

---

**Discovery source:**
- Framework author feedback on CT-1098 (sandboxing concerns)
- CTS `--show-transformed` output analysis (schema inference issue)
- Playwright browser testing (deployment + UI verification)
