# LLM Calls Are Cached - Use Nonces for Respin/Regeneration

## Observation

The `llm()` and `generateObject()` cells cache results based on the prompt content. **This is usually a GOOD thing:**

- Page refresh instantly returns the same results (fast, consistent UX)
- Re-deriving doesn't trigger expensive API calls
- Users see stable, predictable content

However, when implementing a "respin" or "regenerate" feature that should **explicitly** produce new output, you need to bust this cache.

## The Problem

```typescript
// Respin handler - just changing ID doesn't work!
const respinSpindle = handler<...>((_, { spindles, spindleId }) => {
  const current = [...spindles.get()];
  const idx = current.findIndex(s => s.id === spindleIdVal);
  current[idx] = {
    ...current[idx],
    id: generateId(),  // New ID, but prompt unchanged
    pinnedOptionIndex: -1,
  };
  spindles.set(current);
});

// The generation cell is keyed by prompt content:
const generation = generateObject({
  prompt: fullPrompt,  // If this doesn't change, cached result is returned
  schema: toSchema<GenerationResult>(),
});
```

**Result:** User clicks "Respin" but sees the exact same options because the prompt hasn't changed.

## The Fix - Add a Cache-Busting Nonce

1. Add a `respinNonce` field to your data structure:
```typescript
interface SpindleConfig {
  // ... other fields
  respinNonce?: number;  // Cache-busting nonce for respin
}
```

2. Increment the nonce in your respin handler:
```typescript
const respinSpindle = handler<...>((_, { spindles, spindleId }) => {
  const current = [...spindles.get()];
  const idx = current.findIndex(s => s.id === spindleIdVal);
  current[idx] = {
    ...current[idx],
    respinNonce: (current[idx].respinNonce || 0) + 1,
    pinnedOptionIndex: -1,
  };
  spindles.set(current);
});
```

3. Include the nonce in the prompt:
```typescript
const fullPrompt = computed(() => {
  const parts: string[] = [];
  // ... build prompt parts ...

  // Cache-busting nonce (only added when respin is used)
  if (config.respinNonce) {
    parts.push(`[Generation attempt: ${config.respinNonce}]`);
  }

  return parts.join("\n\n");
});
```

## Important Note: Page Refresh vs Respin

This pattern intentionally separates two behaviors:

- **Page refresh**: Same prompt = same cached result (consistent user experience)
- **Respin button**: Incremented nonce = new prompt = fresh generation

This is the desired behavior - users expect consistent results on refresh but new options when explicitly requesting regeneration.

## Tags

- llm
- generateObject
- cache
- respin
- regeneration
- nonce

## Confirmation Status

- **First observed**: 2025-11-30
- **Confirmed by**: jkomoros - Respin button wasn't generating new content until nonce was added to prompt

