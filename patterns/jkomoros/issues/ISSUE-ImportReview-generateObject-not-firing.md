# ISSUE: ImportReview generateObject Not Making LLM Calls

## Status: RESOLVED

**Fix**: Removed optional non-Cell inputs (`schema?: object`, `systemPrompt?: string`, `model?: string`) from ImportReviewInput interface and use constants directly instead.

**Documented in**: `community-docs/superstitions/2025-12-17-optional-non-cell-inputs-break-generateobject.md`

## Summary

ImportReview's `generateObject` call is NOT making any LLM API requests. The extraction completes instantly with "No items found" without ever showing a pending state.

## ROOT CAUSE IDENTIFIED

**Having ANY optional non-Cell input in the pattern interface breaks generateObject reactivity.**

For example, this breaks it:
```typescript
interface TestInput {
  trigger?: Cell<Default<string, "">>;
  schema?: object;  // <-- This breaks generateObject!
}
```

But this works fine:
```typescript
interface TestInput {
  trigger?: Cell<Default<string, "">>;
  // No other optional inputs
}
```

## Symptoms

1. User enters text and clicks "Extract Items"
2. Trigger cell IS updated correctly (debug shows "Triggered: true", "Trigger Length: 64")
3. `pending` NEVER becomes true - stays false the entire time
4. Result shows "No items found" immediately (no delay for LLM call)
5. No network requests to `/api/ai/llm/generateObject` endpoint

## Test Results

### Working Patterns
| Pattern | Location | Result |
|---------|----------|--------|
| test-generateobject-trigger.tsx | WIP/ | WORKS - only trigger as optional |
| test-generateobject-trigger2.tsx | WIP/ | WORKS - variables for config |
| test-generateobject-trigger3.tsx | WIP/ | WORKS - with lift() calls |
| test-generateobject-trigger4.tsx | WIP/ | WORKS - with many handlers |

### Failing Patterns
| Pattern | Location | Result |
|---------|----------|--------|
| test-generateobject-trigger5.tsx | WIP/ | FAILS - has optional schema/systemPrompt/model |
| test-generateobject-trigger6.tsx | WIP/ | FAILS - has just ONE optional schema |
| test-import-review-minimal.tsx | WIP/ | FAILS - has optional schema/systemPrompt/model |
| import-review.tsx | lib/ | FAILS - has optional schema/systemPrompt/model |

## Key Code Comparison

### Working Test Pattern (test-generateobject-trigger.tsx)
```typescript
const TestGenerateObjectTrigger = pattern<TestInput, {}>((props) => {
  const { optionalTrigger } = props;
  const trigger = optionalTrigger;
  const inputText = cell<string>("");

  const { result, pending, error } = generateObject({
    system: "Extract items from text...",
    prompt: trigger,
    schema: { ... simple schema ... },
    model: "anthropic:claude-sonnet-4-5",
  });
  // ... rest of pattern
});
```

### Failing ImportReview (lib/import-review.tsx)
```typescript
const ImportReview = pattern<ImportReviewInput, ImportReviewOutput>(({
  trigger: triggerInput,
  schema,
  systemPrompt,
  model,
  // ... other inputs
}) => {
  const schemaVal = schema ?? DEFAULT_SCHEMA;
  const systemPromptVal = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const modelVal = model ?? "anthropic:claude-sonnet-4-5";
  const trigger = triggerInput;

  const { result, pending, error } = generateObject({
    system: systemPromptVal,
    prompt: trigger,
    schema: schemaVal,
    model: modelVal,
  });
  // ... rest of pattern
});
```

## Differences Identified

1. **More inputs** - ImportReview has many more optional inputs than the test
2. **More complex schema** - ImportReview's DEFAULT_SCHEMA has descriptions
3. **lift() calls** - ImportReview uses `lift()` for getKey/getLabel functions
4. **More computed() calls** - ImportReview has many more derived computations
5. **More handler definitions** - Many handlers defined at module level

## Hypotheses

### Hypothesis 1: lift() breaking reactivity
The `lift()` calls might be interfering with the reactive graph somehow.

### Hypothesis 2: Complex schema breaking parsing
The DEFAULT_SCHEMA might be causing issues (though both schemas are similar).

### Hypothesis 3: Number of computeds/derives
Having many computed() and derive() calls might be creating a reactive cycle or blocking.

### Hypothesis 4: Pattern complexity
The sheer number of cells, computeds, and handlers might be causing some framework issue.

## Next Steps

1. [ ] Create test pattern 3 that adds lift() calls to see if that breaks it
2. [ ] Create test pattern 4 that adds more computed() calls
3. [ ] Try stripping down ImportReview to minimal version
4. [ ] Check if there's something specific about the pattern signature

## Files Involved

- `/Users/alex/Code/community-patterns-2/patterns/jkomoros/lib/import-review.tsx` - Main failing pattern
- `/Users/alex/Code/community-patterns-2/patterns/jkomoros/WIP/test-generateobject-trigger.tsx` - Working test 1
- `/Users/alex/Code/community-patterns-2/patterns/jkomoros/WIP/test-generateobject-trigger2.tsx` - Working test 2

## Deployment Commands

```bash
# Deploy ImportReview
cd ~/Code/labs && deno task ct charm new --api-url http://localhost:8000 --identity ../community-patterns-2/claude.key --space jkomoros-test ../community-patterns-2/patterns/jkomoros/lib/import-review.tsx

# Deploy test pattern
cd ~/Code/labs && deno task ct charm new --api-url http://localhost:8000 --identity ../community-patterns-2/claude.key --space jkomoros-test ../community-patterns-2/patterns/jkomoros/WIP/test-generateobject-trigger.tsx
```

## Related Resources

- community-docs/blessed/reactivity.md - Empty prompt prevents LLM calls
- community-docs/superstitions/2025-11-22-llm-generateObject-reactive-map-derive.md

---

Last Updated: 2025-12-17
