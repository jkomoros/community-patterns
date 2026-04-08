# LLM Results Need Manual Sync to Writables for Handler Access

**Date:** 2026-01-28 **Status:** confirmed **Confidence:** high **Stars:** 4

## TL;DR - The Rule

**`generateText()` and `generateObject()` results live in a reactive result
object (`.result`, `.pending`, `.error`), but handlers reading from Writables
won't see them automatically.** If you need a handler to access LLM output, sync
the result to a Writable using a computed with side-effect.

```tsx
// PROBLEM: Handler reads from drafts Writable, but LLM result isn't there
const sendHandler = handler<...>((_event, { drafts }) => {
  const draft = drafts.get()[threadId]; // undefined! LLM result is elsewhere
});

// SOLUTION: Auto-save LLM result to Writable when generation completes
const _autoSaveLlmDraft = computed(() => {
  const result = draftLlmResult.result;
  const isPending = draftLlmResult.pending;

  if (!isPending && result && threadId) {
    const current = drafts.get();
    if (current[threadId] !== result) { // Idempotent check
      drafts.set({ ...current, [threadId]: result });
    }
  }
  return null;
});
```

---

## Summary

When you use `generateText()` or `generateObject()`, the result is stored in a
reactive object:

```tsx
const llmResult = generateText({ prompt, system });
// llmResult.pending - boolean, true while generating
// llmResult.result - the generated text (undefined while pending)
// llmResult.error - error message if failed
```

This reactive object works great for UI display:

```tsx
{
  ifElse(
    llmResult.pending,
    <span>Generating...</span>,
    <div>{llmResult.result}</div>,
  );
}
```

But **handlers bound to Writables can't access this directly**. If your handler
expects to read from a `Writable<Record<string, string>>`, the LLM result won't
magically appear there.

## The Problem

Consider this flow:

1. User clicks "Generate Draft" → triggers LLM call
2. LLM completes → result in `llmResult.result`
3. UI shows draft in textarea (reads from `llmResult.result`)
4. User clicks "Send" → handler reads from `drafts.get()[threadId]`
5. **Handler finds nothing** - `drafts` was never updated!

The textarea displays `llmResult.result`, but the handler reads from `drafts`.
These are different data sources.

## Why This Happens

The pattern system has two ways to store data:

1. **Reactive result objects** - Returned by `generateText()`, `fetchData()`,
   etc. These are read-only reactive cells.
2. **Writables** - Created with `Writable.of()`. These are read-write and
   persist across sessions.

Handlers typically bind to Writables because:

- They need to persist user edits
- They need to modify state
- They're the "source of truth" for actions

But LLM results are **not Writables** - they're reactive computations. The
result appears when the computation completes but doesn't automatically sync
anywhere.

## The Solution: Auto-Save Computed

Use a computed with a side-effect to sync the LLM result to a Writable:

```tsx
// LLM call
const draftLlmResult = generateText({
  prompt: computed(() => buildPrompt(thread)),
  system: "You are a helpful assistant.",
});

// Writable for user-editable drafts
const drafts = Writable.of<Record<string, string>>({}).for("drafts");

// Auto-save: sync LLM result to Writable when generation completes
const _autoSaveLlmDraft = computed(() => {
  const threadId = generatingDraftFor.get();
  const result = draftLlmResult.result;
  const isPending = draftLlmResult.pending;

  // Only save when generation completes with a result
  if (!isPending && result && threadId) {
    const current = drafts.get();
    // Idempotent: only write if value changed
    if (current[threadId] !== result) {
      drafts.set({ ...current, [threadId]: result });
    }
  }

  return null; // Computed must return something
});
```

Now the handler can read from `drafts`:

```tsx
const sendHandler = handler<...>((_event, { drafts }) => {
  const draft = drafts.get()[threadId]; // LLM result is now here!
  await sendEmail(draft);
});
```

## Why Side-Effect in Computed?

This is an intentional pattern in CommonTools:

1. **Computed tracks dependencies** - It watches `draftLlmResult.result` and
   `draftLlmResult.pending`
2. **Runs when dependencies change** - When LLM completes, computed re-runs
3. **Idempotent check prevents loops** - Only writes if value actually changed
4. **Returns stable value** - `return null` ensures no cascading updates

The underscore prefix (`_autoSaveLlmDraft`) signals this is a "side-effect
computed" - it exists for its side-effect, not its return value.

## Real-World Example

**Pattern:** expect-response-followup.tsx - Email follow-up drafter **Bug:**
"Send Follow-up" logged "No draft to send" even though draft was visible

### Before (Handler Can't Find Draft)

```tsx
// LLM generates draft
const draftLlmResult = generateText({ prompt, system });

// UI displays it (works!)
<textarea value={derive(draftLlmResult.result, r => r || "")} />

// Handler tries to read from Writable (fails!)
const sendFollowUp = handler<...>((_event, { drafts }) => {
  const draft = drafts.get()[threadId];
  if (!draft) {
    console.error("[ExpectResponse] No draft to send"); // This fires!
    return;
  }
});
```

**Result:** Draft visible in UI, but handler can't find it.

### After (Auto-Save to Writable)

```tsx
// Auto-save LLM result to drafts Writable
const _autoSaveLlmDraft = computed(() => {
  const threadId = generatingDraftFor.get();
  const result = draftLlmResult.result;
  const isPending = draftLlmResult.pending;

  if (!isPending && result && threadId) {
    const current = drafts.get();
    if (current[threadId] !== result) {
      drafts.set({ ...current, [threadId]: result });
    }
  }
  return null;
});

// Now handler finds the draft
const sendFollowUp = handler<...>((_event, { drafts }) => {
  const draft = drafts.get()[threadId]; // Found!
  await sendEmail(draft);
});
```

**Result:** LLM generates draft → auto-saved to Writable → handler finds it.

## Key Rules

1. **LLM results are reactive, not Writables** - They exist in a different data
   layer
2. **Handlers bind to Writables** - They can't directly access reactive result
   objects
3. **Use auto-save computed to bridge** - Sync reactive results to Writables
4. **Idempotent checks prevent loops** - Always check
   `if (current !== newValue)`
5. **Prefix with underscore** - Signal that the computed is for side-effects

## Alternative: Pass Result Object to Handler

If you don't need persistence, you could restructure to pass the reactive object
directly:

```tsx
// Handler accepts the reactive result
const sendFollowUp = handler<...>((_event, { draftLlmResult }) => {
  const draft = draftLlmResult.result;
  // ...
});
```

But this has limitations:

- Can't easily persist user edits
- Type system may complain about OpaqueCell types
- Doesn't integrate with Writable-based patterns

The auto-save approach is more flexible and works with existing handler
patterns.

## Related Issues

- `2026-01-08-computed-inside-map-callback-infinite-loop.md` - Related: async
  results and reactivity
- Handler documentation (`docs/common/concepts/handler.md`) - Explains handler
  binding

## Metadata

```yaml
topic: llm, generateText, generateObject, writables, handlers, sync
discovered: 2026-01-28
confirmed_count: 1
last_confirmed: 2026-01-28
sessions: [expect-response-followup-send-fix]
related_functions: generateText, generateObject, Writable, computed, handler
pattern: packages/patterns/google/extractors/expect-response-followup.tsx
commits: [aeabeae65]
status: confirmed
confidence: high
stars: 4
applies_to: [CommonTools]
```

## Guestbook

- 2026-01-28 - expect-response-followup.tsx LLM draft generation. generateText()
  produced drafts shown in textarea, but sendFollowUp handler couldn't find them
  because it read from drafts Writable which was never populated. Fixed by
  adding _autoSaveLlmDraft computed that watches draftLlmResult.result and syncs
  to drafts Writable when generation completes. Pattern now works: generate →
  auto-save → send. (expect-response-followup-send-fix)

---

**Remember:** LLM results and Writables are different data layers. If handlers
need LLM output, bridge them with an auto-save computed.
