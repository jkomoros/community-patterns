---
topic: llm, generateObject, race-condition
discovered: 2025-11-25
confirmed_count: 1
last_confirmed: 2025-11-25
sessions: [smart-rubric-phase-5]
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

# generateObject Race Condition: Pass Cell Directly to prompt, Avoid derive()

## Problem

When using `generateObject()`, the UI gets stuck showing "pending" state forever even though the API returns 200 OK. The LLM call completes successfully but the result never appears in the UI.

**Symptoms:**
- UI shows "Analyzing..." or similar pending indicator indefinitely
- Network tab shows successful 200 OK responses to `/api/ai/llm/generateObject`
- Console may show "Frame mismatch" errors
- Multiple POST requests visible (indicating repeated/abandoned calls)

## Root Cause Hypothesis

The framework has a race condition in `generateObject` where:
1. A request starts, sets `pending = true`
2. The LLM returns quickly (especially from cache)
3. Before the result is written, something triggers cell re-evaluation
4. A new request starts, incrementing `currentRun`
5. The previous response arrives but `thisRun !== currentRun` so it's **abandoned**
6. Cycle repeats, leaving `pending = true` forever

Using `derive()` around the prompt increases reactivity, making this race condition more likely to trigger.

## Solution That Worked

**Pass the Cell directly to `prompt:` instead of wrapping it in `derive()`:**

```typescript
// BROKEN: Using derive() causes excessive reactivity and race condition
const extraction = generateObject({
  model: "anthropic:claude-haiku-4-5",
  system: systemPrompt,
  prompt: derive(myPromptCell, (prompt) => {
    if (!prompt || prompt.trim() === "") {
      return "No input yet.";
    }
    return prompt;
  }),
  schema: toSchema<MyResponse>(),
});

// WORKS: Pass Cell directly - framework handles reactivity internally
const extraction = generateObject({
  model: "anthropic:claude-haiku-4-5",
  system: systemPrompt,
  prompt: myPromptCell,  // Direct Cell reference
  schema: toSchema<MyResponse>(),
});
```

## Additional Pattern: Submit Button for User-Triggered LLM

To further reduce race conditions, use a "submit" pattern where typing doesn't trigger LLM calls:

```typescript
interface MyInput {
  userPrompt: Default<string, "">;      // What user types
  submittedPrompt: Default<string, "">; // Only set when user clicks "Analyze"
}

// Handler to submit the prompt
const submitPrompt = handler<
  unknown,
  { userPromptCell: Cell<string>, submittedCell: Cell<string> }
>(
  (_, { userPromptCell, submittedCell }) => {
    const prompt = userPromptCell.get();
    if (prompt && prompt.trim() !== "") {
      submittedCell.set(prompt);  // This triggers the LLM
    }
  }
);

// generateObject uses submittedPrompt, NOT userPrompt
const extraction = generateObject({
  model: "anthropic:claude-haiku-4-5",
  system: systemPrompt,
  prompt: submittedPrompt,  // Only changes when user clicks button
  schema: toSchema<MyResponse>(),
});

// UI
<ct-input $value={userPrompt} placeholder="Describe..." />
<ct-button onClick={submitPrompt({ userPromptCell: userPrompt, submittedCell })}>
  Analyze
</ct-button>
```

## Why This Might Work

1. **Fewer reactive triggers**: Passing Cell directly means the framework controls when to re-evaluate, rather than derive() adding another layer of reactivity
2. **Single source of change**: With submit pattern, the prompt only changes once per user action, not on every keystroke
3. **Reduced re-evaluation frequency**: Less chance of hitting the race condition window

## Context

Working on Smart Rubric Phase 5 (LLM Quick Add feature):
- Initial implementation used `derive()` around the prompt
- LLM calls completed (200 OK in network) but UI stayed stuck on "Analyzing..."
- Console showed "Frame mismatch" errors
- Tried multiple approaches: different models (sonnet vs haiku), submit button pattern
- **Final fix**: Removing `derive()` and passing Cell directly resolved the issue

## Related Issues

See `patterns/jkomoros/issues/llm-cache-stuck-analyzing.md` for detailed analysis of the framework race condition in `generateObject`.

## Testing Checklist

To verify this superstition:
- [ ] Create a pattern with generateObject using derive() around prompt
- [ ] Type quickly in input field, observe if results get stuck
- [ ] Change to passing Cell directly
- [ ] Verify results now appear correctly
- [ ] Test with both fast (haiku) and slow (sonnet) models

## Questions

1. Is this specific to `generateObject` or does it affect `generateText` too?
2. Does the system prompt have the same issue (should we avoid derive() there too)?
3. Is there an official recommended pattern for reactive LLM prompts?
4. Will this be fixed at the framework level?

---

**Remember:** This is a hypothesis based on one successful fix. The actual root cause may be different!

---

## ⚠️ CONFLICTING EVIDENCE (Nov 29, 2025)

**Later testing in `prompt-injection-tracker-v3` showed the OPPOSITE:**

```typescript
// Direct access: .result is UNDEFINED
prompt: article.content,

// With derive(): .result is POPULATED (even if empty array)
prompt: derive(article, (a) => a?.content ?? ""),
```

**The original "race condition" diagnosis may have been wrong.** The actual issue might have been:
1. Something else in the pattern causing the stuck state
2. A framework bug that has since been fixed
3. Misattribution of the root cause

**Recommendation:** Try using `derive()` first. If you see race condition symptoms (stuck pending, Frame mismatch errors), then try direct Cell access as a fallback.

See: `2025-11-29-llm-derive-for-template-string-prompts.md` for the newer findings.
