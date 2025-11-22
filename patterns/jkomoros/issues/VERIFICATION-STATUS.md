# Verification Status: Model Names Fix

**Date:** 2025-11-22
**Session:** codenames-helper-iteration
**Branch:** codenames-helper-iteration

## What Was Fixed

### Root Cause Identified ✅

The 400 Bad Request errors from `generateObject()` were NOT caused by nested type arrays in schemas. They were caused by using an **invalid model name** that doesn't exist in the MODELS registry.

**Invalid model name used:**
```typescript
model: "claude-3-5-sonnet-20241022"  // ❌ Not in registry
```

**Valid model name:**
```typescript
model: "anthropic:claude-sonnet-4-5"  // ✅ In registry
```

### Error Manifestation

When using an invalid model name:
- Server returns: `TypeError: Cannot read properties of undefined (reading 'model')`
- Location: `generateObject.ts:55:26`
- Browser shows: 400 Bad Request
- **No indication that the model name is invalid**

### Code Changes ✅

**File:** `patterns/jkomoros/WIP/codenames-helper.tsx`

**Lines 488 and 546:** Changed model parameter in both `generateObject()` calls:
```typescript
// Photo extraction (line 488)
const photoExtractions = uploadedPhotos.map((photo) => {
  return generateObject({
    model: "anthropic:claude-sonnet-4-5",  // ✅ Fixed
    system: `You are an image analysis assistant...`,
    prompt: derive(photo, (p) => { /* ... */ }),
    schema: toSchema<PhotoExtractionResult>()
  });
});

// Clue suggestions (line 546)
const clueSuggestions = generateObject({
  model: "anthropic:claude-sonnet-4-5",  // ✅ Fixed
  system: `You are a Codenames spymaster assistant...`,
  prompt: derive({ board, setupMode, myTeam }, (values) => { /* ... */ }),
  schema: toSchema<ClueSuggestionsResult>()
});
```

### Documentation Created ✅

1. **New Superstition:** `community-docs/superstitions/2025-11-22-generateObject-model-names.md`
   - Documents the model name validation issue
   - Lists all valid model names from MODELS registry
   - Explains cryptic error messages
   - Provides debugging tips

2. **Updated Issue Doc:** `patterns/jkomoros/issues/ISSUE-toSchema-Nested-Type-Arrays.md`
   - Added section about real root cause
   - Documents that schemas may not have been the problem
   - Notes that invalid model name prevented proper testing
   - Preserves manual schema workaround documentation

### Committed ✅

```
commit 16bba43
Fix generateObject model names and document discovery

The 400 errors weren't caused by nested schemas - they were caused by
using an invalid model name "claude-3-5-sonnet-20241022" which doesn't
exist in the MODELS registry.
```

## What Remains Unverified ⚠️

### Critical Question

**Does `toSchema<T>()` work with nested type arrays?**

We still don't know! The invalid model name prevented us from testing this properly.

### Two Scenarios

**Scenario 1: toSchema<T>() Works** ✨
- The "unresolved $ref" errors were caused by the invalid model
- `toSchema<T>()` generates correct schemas for nested arrays
- Manual schemas with $defs are unnecessary
- **This would be the best outcome!**

**Scenario 2: toSchema<T>() Has Limitations** 📋
- `toSchema<T>()` truly can't handle nested arrays
- Manual schemas with $defs are still needed
- Framework limitation documented

### Testing Needed

To verify which scenario is true:

1. **Deploy pattern with fixed model names** ✅ Done (test-toschema-verify)
2. **Test photo extraction:**
   - Upload board photo
   - Check if AI extracts `BoardWordData[]` array correctly
   - Verify no "unresolved $ref" errors
   - Check server logs for 400 errors

3. **Test clue suggestions:**
   - Set up board with words and colors
   - Switch to Game Mode
   - Check if AI generates `ClueIdea[]` array correctly
   - Verify results display properly

4. **Check browser console and server logs**
   - Look for "Unresolved $ref" warnings
   - Look for 400 Bad Request errors
   - Verify API requests complete successfully

### Testing Challenges Encountered

- Pattern initialization issues in test spaces
- Board doesn't render properly in new deployments
- Difficult to create clean test environment

### Manual Testing Alternative

Rather than browser testing, could verify by:
1. Checking generated schema in network tab
2. Examining request/response payloads
3. Comparing with manual schema structure

## Current State

### What Works

✅ Model names fixed in code
✅ Documentation created
✅ Changes committed
✅ Pattern deploys without errors

### What's Unknown

❓ Does toSchema<T>() generate valid schemas for nested arrays?
❓ Were the "unresolved $ref" errors from the model issue or schema issue?
❓ Can we remove manual schemas and use toSchema<T>() everywhere?

### Recommendation

**For now:**
- Use the fixed model names (`"anthropic:claude-sonnet-4-5"`)
- Pattern currently uses `toSchema<T>()` for both calls
- Manual schemas remain in code (commented as constants) as fallback
- Monitor for any "unresolved $ref" errors in production use

**If errors occur:**
- Switch back to manual schemas with $defs
- Update issue doc with confirmation that toSchema<T>() has limitations
- Promote manual schema approach to folk wisdom

**If no errors occur:**
- Document that toSchema<T>() works with nested arrays
- Update superstition to note the model name was the only issue
- Remove manual schema constants from code

## Valid Model Names Reference

From `~/Code/labs/packages/toolshed/routes/ai/llm/models.ts`:

**Anthropic:**
- `"anthropic:claude-opus-4-1"`
- `"anthropic:claude-sonnet-4-0"`
- `"anthropic:claude-sonnet-4-5"` ← Most commonly used
- `"anthropic:claude-haiku-4-5"`

**Aliases:**
- `"sonnet-4-5"` → `"anthropic:claude-sonnet-4-5"`
- `"opus-4-1"` → `"anthropic:claude-opus-4-1"`

**OpenAI:**
- `"openai:gpt-5-mini"`
- `"openai:gpt-4o"`

## Lessons Learned

1. **Cryptic errors can mask simple mistakes**
   - "Cannot read properties of undefined (reading 'model')" gave no hint about invalid model names
   - Better error messages would save significant debugging time

2. **Test one variable at a time**
   - We changed both schemas AND models simultaneously
   - Made it harder to identify which was the problem

3. **Verify assumptions early**
   - We assumed the model parameter was correct
   - Spent hours investigating schemas instead

4. **Framework could improve**
   - Model validation before API call would help
   - Clear error: "Model 'claude-3-5-sonnet-20241022' not found in registry"
   - List of valid models in error message

5. **Documentation matters**
   - Created comprehensive superstition doc
   - Future developers will avoid this issue
   - Debugging path is documented

## Next Steps for User

1. Test the pattern manually in a real game scenario
2. Monitor browser console for any schema-related errors
3. Check if AI extraction and clue generation work correctly
4. Report back findings to verify toSchema<T>() status
5. Update documentation based on real-world usage

---

**Status:** ✅ Fix implemented and documented
**Verification:** ⚠️ Pending real-world testing
**Risk:** 🟢 Low - worst case we have manual schema fallback
