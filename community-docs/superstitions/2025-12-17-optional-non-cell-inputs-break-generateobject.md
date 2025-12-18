# Optional Non-Cell Inputs Break generateObject Reactivity

**Date**: 2025-12-17
**Severity**: Critical
**Component**: Pattern inputs, generateObject

## Summary

Having ANY optional non-Cell input in a pattern interface breaks `generateObject` reactivity. The LLM call will never fire, even though the trigger cell updates correctly.

## Symptoms

1. User triggers extraction (trigger cell updates correctly)
2. `pending` NEVER becomes true - stays false the entire time
3. Result shows immediately without delay (no LLM call made)
4. No network requests to `/api/ai/llm/generateObject` endpoint
5. Debug shows: Triggered=true, Trigger Length=71, Pending=false, Result=(none)

## Root Cause

The CTS transformer appears to handle optional non-Cell inputs differently in a way that breaks the reactive graph for `generateObject`. Even a SINGLE optional non-Cell input is enough to break it.

## Failing Pattern

```typescript
// THIS BREAKS generateObject!
interface BadInput {
  trigger?: Cell<Default<string, "">>;
  schema?: object;           // <-- BREAKS IT
  systemPrompt?: string;     // <-- BREAKS IT
  model?: string;            // <-- BREAKS IT
}

const BadPattern = pattern<BadInput, {}>((props) => {
  const { trigger, schema, systemPrompt, model } = props;

  // Apply defaults
  const schemaVal = schema ?? DEFAULT_SCHEMA;
  const systemPromptVal = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const modelVal = model ?? "anthropic:claude-sonnet-4-5";

  // This generateObject will NEVER fire!
  const { result, pending, error } = generateObject({
    system: systemPromptVal,
    prompt: trigger,
    schema: schemaVal,
    model: modelVal,
  });
  // ...
});
```

## Working Pattern

```typescript
// THIS WORKS!
// Configuration as CONSTANTS (not pattern inputs)
const SYSTEM_PROMPT = `You are a data extraction assistant...`;
const SCHEMA = { type: "object", ... } as const;
const MODEL = "anthropic:claude-sonnet-4-5";

interface GoodInput {
  trigger?: Cell<Default<string, "">>;
  // NO schema?: object
  // NO systemPrompt?: string
  // NO model?: string
}

const GoodPattern = pattern<GoodInput, {}>((props) => {
  const { trigger } = props;

  // Use constants directly - NOT from props
  const { result, pending, error } = generateObject({
    system: SYSTEM_PROMPT,     // Constant
    prompt: trigger,           // Cell is OK
    schema: SCHEMA,            // Constant
    model: MODEL,              // Constant
  });
  // This works correctly!
});
```

## The Fix

1. Remove optional non-Cell inputs from the pattern interface
2. Define configuration as module-level constants instead
3. Use constants directly in generateObject call

## Test Evidence

Created 7 test patterns to isolate the issue:

| Pattern | Optional non-Cell inputs | Result |
|---------|-------------------------|--------|
| test-generateobject-trigger.tsx | None | WORKS |
| test-generateobject-trigger2.tsx | None (vars for config) | WORKS |
| test-generateobject-trigger3.tsx | None (with lift()) | WORKS |
| test-generateobject-trigger4.tsx | None (many handlers) | WORKS |
| test-generateobject-trigger5.tsx | schema, systemPrompt, model | FAILS |
| test-generateobject-trigger6.tsx | schema only | FAILS |
| test-generateobject-trigger7.tsx | None (constants) | WORKS |

## What's OK in Pattern Inputs

- `Cell<T>` inputs - OK
- `Cell<Default<T, value>>` inputs - OK
- Function inputs (wrapped with lift()) - OK (needs testing)

## What Breaks generateObject

- `schema?: object` - BREAKS IT
- `systemPrompt?: string` - BREAKS IT
- `model?: string` - BREAKS IT
- Any optional primitive/object that's not a Cell

## Related Files

- `/patterns/jkomoros/lib/import-review.tsx` - Fixed pattern
- `/patterns/jkomoros/WIP/test-generateobject-trigger*.tsx` - Test patterns
- `/patterns/jkomoros/issues/ISSUE-ImportReview-generateObject-not-firing.md` - Investigation notes

## Tags

`generateObject` `reactivity` `pattern-inputs` `optional-inputs` `CTS-transformer`
