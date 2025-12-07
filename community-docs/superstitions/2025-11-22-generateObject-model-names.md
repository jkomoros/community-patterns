---
topic: llm
discovered: 2025-11-22
confirmed_count: 2
last_confirmed: 2025-12-06
sessions: [codenames-helper-iteration, cpu-loop-investigation]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
status: superstition
stars: ⭐⭐⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

---

# generateObject() Requires a Valid Model Parameter

## Problem

When using `generateObject()` without a model parameter, or with an invalid model name, you get a 400 Bad Request error (or cryptic TypeError) rather than a clear error message.

**Symptoms:**
- Browser shows 400 Bad Request from `/api/ai/llm/generateObject`
- Server logs may show: `TypeError: Cannot read properties of undefined (reading 'model')`
- No clear indication that the model parameter is missing or invalid
- Pattern appears to load but generateObject silently fails

## Root Cause

Two issues:
1. **Missing model parameter**: generateObject requires a model but the TypeScript types may not enforce this
2. **Invalid model name**: The `findModel()` function returns `undefined` when given an unregistered model name, causing TypeError

## Valid Model Names

Check the MODELS registry in `~/Code/labs/packages/toolshed/routes/ai/llm/models.ts` for current valid names:

**Anthropic models:**
```typescript
"anthropic:claude-opus-4-1"
"anthropic:claude-sonnet-4-0"
"anthropic:claude-sonnet-4-5"  // ← Most commonly used
"anthropic:claude-haiku-4-5"
```

**Aliases (shorter forms):**
```typescript
"sonnet-4-5"  // Alias for anthropic:claude-sonnet-4-5
"opus-4-1"    // Alias for anthropic:claude-opus-4-1
// etc.
```

**OpenAI models:**
```typescript
"openai:gpt-5-mini"
"openai:gpt-4o"
// etc.
```

## Invalid Model Names That Don't Work

These look plausible but are NOT in the registry:

❌ `"claude-3-5-sonnet-20241022"` - wrong format
❌ `"claude-sonnet-4-5"` - missing vendor prefix
❌ `"anthropic/claude-sonnet-4-5"` - wrong separator (/ instead of :)

## Solution

Use the correct model name format from the registry:

```typescript
// WRONG - causes TypeError about undefined.model
const result = generateObject({
  model: "claude-3-5-sonnet-20241022",  // Not in registry!
  system: "...",
  prompt: "...",
  schema: toSchema<MyType>()
});

// CORRECT - works properly
const result = generateObject({
  model: "anthropic:claude-sonnet-4-5",  // Valid registry name
  system: "...",
  prompt: "...",
  schema: toSchema<MyType>()
});

// ALSO CORRECT - using alias
const result = generateObject({
  model: "sonnet-4-5",  // Valid alias
  system: "...",
  prompt: "...",
  schema: toSchema<MyType>()
});
```

## Why This Is Confusing

1. **The error message doesn't mention models** - just says "Cannot read properties of undefined"
2. **No model validation** - invalid names fail silently during lookup
3. **Model names look similar** - Anthropic's actual API uses dates like "20241022", but the framework uses version numbers
4. **The model parameter is optional** - so you might not realize it's being used

## Debugging Tip

If you get `TypeError: Cannot read properties of undefined (reading 'model')` from generateObject:

1. **Check your model parameter first** - is it in the MODELS registry?
2. Look in `~/Code/labs/packages/toolshed/routes/ai/llm/models.ts`
3. Use the exact string from the registry (case-sensitive, with colons)

## Example from Real Code

From codenames-helper.tsx issue:

```typescript
// This failed with "Cannot read properties of undefined (reading 'model')"
const photoExtractions = uploadedPhotos.map((photo) => {
  return generateObject({
    model: "claude-3-5-sonnet-20241022",  // ❌ Not in registry
    system: `You are an image analysis assistant...`,
    prompt: derive(photo, (p) => { /* ... */ }),
    schema: toSchema<PhotoExtractionResult>()
  });
});

// Fixed by using correct model name
const photoExtractions = uploadedPhotos.map((photo) => {
  return generateObject({
    model: "anthropic:claude-sonnet-4-5",  // ✅ Valid registry name
    system: `You are an image analysis assistant...`,
    prompt: derive(photo, (p) => { /* ... */ }),
    schema: toSchema<PhotoExtractionResult>()
  });
});
```

## Related Context

This issue masked the original investigation into `toSchema<T>()` with nested arrays. We spent time investigating:
- Manual JSON schemas with $defs
- Flattening approaches with JSON strings
- Explicit vs implicit schema generation

When the real problem was just an invalid model name all along!

## Questions for Framework Authors

1. **Could findModel() throw a descriptive error** instead of returning undefined?
2. **Could generateObject() validate the model parameter** and give a clear error message?
3. **Should the model parameter be required** rather than optional with a default?
4. **Is there documentation** listing all valid model names?

## How to Verify This Yourself

1. Try using `generateObject()` with `model: "invalid-model-name"`
2. Check the server logs for the "Cannot read properties of undefined" error
3. Change to a valid model name from the registry
4. Observe that it works correctly

## Pattern

- Pattern file: `patterns/jkomoros/WIP/codenames-helper.tsx`
- Issue doc: `patterns/jkomoros/issues/ISSUE-toSchema-Nested-Type-Arrays.md`
- Lines affected: 488 (photo extraction), 546 (clue suggestions)

## Status

**Confirmed twice** - observed during codenames-helper and cpu-loop-investigation.

Needs confirmation:
- Does this affect all LLM functions (generateText, generateStream, etc.)?
- Are there other ways to specify models?
- Does the error always manifest the same way?

## Guestbook

- 2025-11-22 - codenames-helper pattern. Used wrong model format `"claude-3-5-sonnet-20241022"` instead of `"anthropic:claude-sonnet-4-5"`. Got cryptic TypeError. (codenames-helper-iteration)

- 2025-12-06 - cpu-loop-repro pattern. Omitted model parameter entirely from generateObject. Got 400 Bad Request. Adding `model: "anthropic:claude-haiku-4-5"` fixed it. This was mistakenly attributed to "computed calling .set()" but was actually just missing model. (cpu-loop-investigation)

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
