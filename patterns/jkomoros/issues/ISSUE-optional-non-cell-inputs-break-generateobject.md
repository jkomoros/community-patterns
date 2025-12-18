# Bug: Optional non-Cell inputs in pattern interface break generateObject reactivity

## Summary

When a pattern interface includes ANY optional non-Cell input (e.g., `schema?: object`), `generateObject` stops responding to trigger changes. The LLM call never fires, with no errors or warnings.

## Minimal Reproduction

### Pattern A: WORKS

```typescript
/// <cts-enable />
import { cell, Cell, Default, generateObject, handler, pattern } from "commontools";

interface WorkingInput {
  trigger?: Cell<Default<string, "">>;
  // No other optional inputs
}

const WorkingPattern = pattern<WorkingInput, {}>((props) => {
  const { trigger } = props;

  const { result, pending } = generateObject({
    system: "Extract items from text. Return {items: [{name: string}]}",
    prompt: trigger,
    schema: { type: "object", properties: { items: { type: "array" } }, required: ["items"] },
    model: "anthropic:claude-sonnet-4-5",
  });

  // result updates when trigger changes ✓
});
```

### Pattern B: BROKEN

```typescript
/// <cts-enable />
import { cell, Cell, Default, generateObject, handler, pattern } from "commontools";

interface BrokenInput {
  trigger?: Cell<Default<string, "">>;
  schema?: object;  // <-- Adding this ONE line breaks generateObject
}

const BrokenPattern = pattern<BrokenInput, {}>((props) => {
  const { trigger, schema } = props;
  const schemaVal = schema ?? { type: "object", properties: { items: { type: "array" } }, required: ["items"] };

  const { result, pending } = generateObject({
    system: "Extract items from text. Return {items: [{name: string}]}",
    prompt: trigger,
    schema: schemaVal,
    model: "anthropic:claude-sonnet-4-5",
  });

  // result NEVER updates, pending NEVER becomes true
  // No errors, no warnings - just silent failure
});
```

## Expected Behavior

Both patterns should work identically. The `generateObject` call should fire when `trigger` changes, regardless of whether the pattern has other optional inputs.

## Actual Behavior

- Pattern A: `generateObject` fires correctly when trigger changes
- Pattern B: `generateObject` never fires. `pending` stays `false`. No network request made.

## Observable Symptoms

| Metric | Pattern A (Working) | Pattern B (Broken) |
|--------|--------------------|--------------------|
| Trigger updates | Yes | Yes |
| `pending` becomes true | Yes | **No** |
| Network request made | Yes | **No** |
| `result` populated | Yes | **No** |
| Errors/warnings | None | **None** |

## Additional Findings

- Adding just ONE optional non-Cell input breaks it
- These all break it: `schema?: object`, `systemPrompt?: string`, `model?: string`
- Cell-wrapped inputs work fine: `trigger?: Cell<Default<string, "">>`
- Function inputs (used with `lift()`) appear to work (needs more testing)

## Workaround

Use module-level constants instead of pattern inputs:

```typescript
const SCHEMA = { type: "object", ... } as const;

interface Input {
  trigger?: Cell<Default<string, "">>;
  // Don't put schema here
}

const Pattern = pattern<Input, {}>((props) => {
  const { result } = generateObject({
    schema: SCHEMA,  // Use constant, not prop
    // ...
  });
});
```

## Impact

This prevents creating reusable patterns with configurable LLM parameters. Users cannot pass custom schemas, system prompts, or models to pattern instances.

## Environment

- CommonTools framework (local dev)
- CTS transformer enabled (`/// <cts-enable />`)

## Test Files

Full working/broken test patterns available at:
- `patterns/jkomoros/WIP/test-generateobject-trigger.tsx` (works)
- `patterns/jkomoros/WIP/test-generateobject-trigger6.tsx` (broken - one optional input)
