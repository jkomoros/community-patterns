# Superstition Verification Log

This log tracks verification attempts for superstitions. Start with the oldest unverified entries.

When a superstition is removed, also remove its entry from this log.

---

## 2025-01-23-ct-image-input-base64-overhead.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** low (confirmed_count=1)
**Notes:** Valid guidance. ct-image-input compresses to maxSizeBytes target (raw bytes), then base64 encodes. Pattern developers must account for ~33% base64 overhead when interfacing with APIs that have encoded size limits. food-recipe.tsx correctly uses 75% of API limit.

---

## 2025-01-23-jsx-reactive-style-objects.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** low (confirmed_count=1)
**Notes:** Verified via minimal repro. Individual computed values within style object literal don't react - shows inactive style even when state is active. Single computed returning entire style object works correctly. cheeseboard-schedule.tsx correctly uses workaround.

---

## 2025-01-24-check-pattern-callers-when-changing-inputs.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** low (confirmed_count=1)
**Notes:** Valid development workflow guidance. This is standard TypeScript behavior - when you change a pattern's input interface, callers need to be updated. Not framework-specific, just good software engineering practice. Worth keeping as documentation.

---

## 2025-01-24-pass-cells-as-handler-params-not-closure.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** medium (confirmed_count=2, detailed guestbook)
**Notes:** **ACTIVELY VERIFIED** via minimal repro deployment. Closure capture fails at COMPILE time: "Accessing an opaque ref via closure is not supported". Handler parameter approach works - Cell.set() succeeds, UI updates reactively. Must use `pattern` not `recipe`. Framework enforces this more strictly than original superstition described.

---

## 2025-11-21-cannot-map-computed-arrays-in-jsx.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** medium (confirmed_count=2, pattern cleanup failed)
**Notes:** Minimal repro appeared to work due to auto-unwrapping types, but pattern cleanup on reward-spinner.tsx failed with "mapWithPattern is not a function". Original superstition split - this is the confirmed portion.

---

## 2025-11-22-at-reference-opaque-ref-arrays.md

**Last verified:** 2025-12-02
**Status:** partially_confirmed
**Evidence level:** medium (active repro testing)
**Notes:** ACTIVELY VERIFIED. Mixed results:
- ✅ `wish("#mentionable")` works - returns charms in space (no refresh needed in test)
- ✅ `ct-prompt-input` @ dropdown appears, inserts markdown `[Name](/of:id)`
- ❌ `ct-prompt-input` `detail.mentions` is EMPTY (0 items) - can't get Cell refs this way
- ✅ `ct-code-editor` [[ dropdown appears, inserts wiki-link `[[Name(id)]]`
- ❌ `ct-code-editor` `onbacklink-create` doesn't fire when selecting from dropdown
- The superstition's code example using `detail.mentions` is INCORRECT
- chatbot.tsx just uses the text (parses markdown links), doesn't use mentions array
- Superstition is good for UI/dropdown documentation but wrong about Cell ref extraction

---

## 2025-11-22-ct-code-editor-wiki-link-syntax.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** medium (active repro testing)
**Notes:** ACTIVELY VERIFIED via 2025-11-22-at-reference-code-editor-test.tsx repro:
- ✅ `[[` triggers completions dropdown (tested)
- ✅ Dropdown shows mentionable charms correctly
- ✅ Selection inserts wiki-link format `[[Name(id)]]`
- ❌ `onbacklink-create` does NOT fire on dropdown selection (confirmed!)
- Superstition correctly documents this behavior and the open questions
- The "CRITICAL FINDING" in the superstition is accurate

---

## 2025-11-22-deployment-setsrc-conflicts-use-new-instead.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** high (active repro testing)
**Notes:** ACTIVELY VERIFIED via 2025-11-22-setsrc-test.tsx repro:
- Deployed v1 pattern with `charm new` -> shows "v1" ✓
- Modified pattern to v2, ran `charm setsrc` -> NO ERRORS but still shows "v1" ❌
- `charm setsrc` silently fails - worse than superstition describes!
- Deployed v2 with `charm new` -> shows "v2-setsrc" ✓
- Workaround confirmed: always use `charm new` instead of `setsrc`
- Superstition is VALID and possibly understates the problem

---

## 2025-11-22-derive-object-parameter-cell-unwrapping.md

**Last verified:** 2025-12-02
**Status:** NUANCED (TypeScript types vs runtime)
**Evidence level:** high (active repro + pattern cleanup attempt)
**Notes:** Complex findings:
- **Minimal repro**: Runtime shows auto-unwrapping (hasGet=false) ✓
- **Pattern cleanup**: TypeScript ERRORS when removing workaround!
- TypeScript types: `values.board` typed as `Cell<BoardWord[]>`, not `BoardWord[]`
- Error: "Conversion of type 'Cell<T>' to type 'T' may be a mistake"
- **Conclusion**: Workaround IS needed for TypeScript, even if runtime auto-unwraps
- The superstition is correct about NEEDING the workaround for TypeScript
- Original observation may have conflated TypeScript types with runtime behavior
- Keep superstition but clarify it's a TypeScript types issue, not necessarily runtime

---

## 2025-11-22-generateObject-model-names.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** low (code review, not active testing)
**Notes:** Verified via code review of models.ts:
- MODELS registry contains valid names like `anthropic:claude-sonnet-4-5`
- `findModel()` returns undefined for unregistered names (confirmed in code)
- Would cause "Cannot read properties of undefined" as described
- Valid documentation about model name formats
- Skipped active LLM testing (expensive API calls)

---

## 2025-11-22-llm-generateObject-reactive-map-derive.md

**Last verified:** 2025-12-02
**Status:** context_dependent
**Evidence level:** low (not actively tested, but related superstition disproved)
**Notes:** The superstition's own UPDATE says direct access works for text content.
- Original claim: need derive() for nested property access in .map()
- Update says: text content works without derive()
- May only apply to async-loading image data
- Related: derive-object-parameter-cell-unwrapping was DISPROVED (auto-unwraps)
- Likely the original issue was timing-related for async images, not derive behavior
- Needs active testing with images to fully verify

---

## 2025-11-22-patterns-pass-cells-not-charm-refs.md

**Last verified:** 2025-12-02
**Status:** confirmed (architectural guidance)
**Evidence level:** low (code review, not active testing)
**Notes:** This is design guidance, not a bug workaround:
- No "self" reference mechanism exists in patterns (confirmed by code review)
- Passing individual cells is the documented approach (instantiate-recipe.tsx)
- Creates snapshot, not live-link (expected behavior)
- Valid architectural pattern for pattern composition

---

## 2025-11-22-space-name-character-requirements.md

**Last verified:** 2025-12-02
**Status:** confirmed (expected behavior)
**Evidence level:** low (logical reasoning)
**Notes:** Self-evident URL routing behavior:
- "/" in space name conflicts with URL path segments
- URL format is `/:spaceName/:charmId` so "/" would break parsing
- Not a bug, just a constraint from URL structure
- Valid documentation about naming requirements

---

## 2025-11-24-default-only-at-array-level-not-nested.md

**Last verified:** 2025-12-02
**Status:** DISPROVED
**Evidence level:** high (active repro testing)
**Notes:** ACTIVELY VERIFIED via 2025-11-24-nested-default-test.tsx repro:
- Pattern with nested Default<> COMPILED without TypeScript errors ✓
- Push to array with nested Default<> WORKED at runtime ✓
- Count increased from 0 to 1 after push
- The superstition is INCORRECT or context-specific
- May have been a different issue in original observation

---

## 2025-11-24-use-derive-not-computed-for-jsx-rendering.md

**Last verified:** 2025-12-02
**Status:** DEPRECATED (already disproven in file)
**Evidence level:** high (code review)
**Notes:** Superstition file itself marked as DEPRECATED. Code review shows derive() and computed() both return OpaqueRef<T> - they're identical. See folk_wisdom/reactivity.md.

---

## 2025-11-25-framework-auto-boxes-array-items-use-equals-instance-method.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** high (active repro testing)
**Notes:** ACTIVELY VERIFIED via 2025-11-25-array-equals-test.tsx repro:
- ✅ `===` comparison returns -1 (NOT FOUND) for Cells from .map()
- ✅ `.equals()` instance method returns correct index (0)
- ✅ Remove via `===` fails (cannot find item)
- ✅ Remove via `.equals()` works (removed item at index 1)
- Also confirmed: item in JSX .map() is auto-unwrapped (item.name works, item.key() fails)
- Superstition is CORRECT - must use .equals() for Cell comparison in handlers

---

## 2025-11-25-generateObject-race-condition-pass-cell-directly.md

**Last verified:** 2025-12-02
**Status:** context_dependent (documented conflict with 2025-11-29-llm-derive-for-template-string-prompts.md)
**Evidence level:** medium (file review, not actively tested)
**Notes:** File itself documents conflicting evidence. Key context distinction:
- USER INPUT (typing): Direct Cell may be safer to avoid race conditions
- STATIC DATA in .map(): derive() may be needed for proper .result population
- Both approaches have valid use cases depending on reactivity needs
- Needs framework author clarification for definitive guidance

---

## 2025-11-26-reactive-first-pass-may-have-empty-data.md

**Last verified:** 2025-12-02
**Status:** confirmed (expected behavior documentation)
**Evidence level:** medium (documented behavior, not a bug)
**Notes:** This is valid documentation about expected reactive behavior:
- First reactive pass has empty data (arrays [], undefined values)
- Subsequent passes populate data correctly
- Don't panic at first-pass errors - check final UI state
- Use derive() for automatic re-evaluation
- File metadata already marked as confirmed. This is "how reactivity works" not a bug.

---

## 2025-11-27-llm-handler-tools-must-write-to-result-cell.md

**Last verified:** 2025-12-02
**Status:** pending_active_verification (requires LLM API calls)
**Evidence level:** low (single observation)
**Notes:** This claims that when using handlers as tools in generateObject(), you must write to `input.result.set()` - return value alone doesn't work. Official patterns use `{ pattern: ... }` syntax for tools, not handlers directly. This is an edge case requiring LLM API testing to verify. Documented behavior is plausible based on framework code review mentioned in the file.

---

## 2025-11-27-llm-never-raw-fetch-use-generateObject.md

**Last verified:** 2025-12-02
**Status:** confirmed (design guidance)
**Evidence level:** medium (aligns with official docs)
**Notes:** Official LLM.md explicitly recommends generateObject for structured data. Best practice: "Use generateObject for structured data - Don't parse JSON from generateText". Raw fetch bypasses framework caching and tooling. This is valid architectural guidance, not a bug workaround.

---

## 2025-11-29-array-items-undefined-during-hydration.md

**Last verified:** 2025-12-02
**Status:** needs_investigation (complex reproduction needed)
**Evidence level:** low (single observation, low confidence)
**Notes:** Claims array items can be undefined/null during page refresh hydration, causing TypeErrors. File itself marks status as "needs-investigation" with low confidence. Would require complex 5-level pipeline pattern + page refresh to test. Defensive null checks are recommended as workaround. Need framework author clarification on hydration behavior.

---

## 2025-11-29-cells-must-be-json-serializable.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** high (2 guestbook confirmations + fundamental JSON behavior)
**Notes:** Cell values must survive JSON.stringify/parse round-trip. Set/Map serialize to {} (data lost). Guestbook confirms: Set caused "has is not a function", Map caused "object is not iterable". Use arrays/plain objects instead. This is fundamental JavaScript JSON serialization behavior.

---

## 2025-11-29-close-browser-before-charm-link.md

**Last verified:** never
**Status:** pending
**Note:** Environment-specific, may be hard to reproduce

---

## 2025-11-29-derive-inside-map-causes-thrashing.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** high (file status=confirmed, detailed explanation)
**Notes:** Creating derive() inside .map() causes new cells each reactive pass, triggering re-evaluation loops. Symptoms: console spam, UI thrashing, "Too many iterations" errors. Fix: create derive BEFORE passing to fetchData/generateObject options. File already marked status=confirmed with high confidence. Well-documented root cause.

---

## 2025-11-29-generateObject-empty-array-handler-pattern.md

**Last verified:** 2025-12-02
**Status:** confirmed (HIGH confidence A/B test)
**Evidence level:** high (clear reproducible test)
**Notes:** Pre-populated default arrays with generateObject in map() → result undefined. Empty array + handler load → result has data. A/B tested: pre-populated=0 results, handler-loaded=12 results. Framework reactive wiring may differ for pre-populated vs handler-added items.

---

## 2025-11-29-generateObject-map-empty-array-handler.md

**Last verified:** 2025-12-02
**Status:** confirmed (duplicate of generateObject-empty-array-handler-pattern.md)
**Evidence level:** high (same finding)
**Notes:** Duplicate documentation of same issue. See generateObject-empty-array-handler-pattern.md for full verification notes. Consider consolidating these two files.

---

## 2025-11-29-handlers-no-opaqueref-casting.md

**Last verified:** 2025-12-02
**Status:** confirmed (FRAMEWORK AUTHOR confirmed)
**Evidence level:** high (direct framework author quote)
**Notes:** Framework author explicitly called out this anti-pattern: "manually adds casting away from OpaqueRef... which I often see in handlers". Don't cast to/from OpaqueRef - use Cell<T[]> in handler signatures, let framework handle wrapping. Breaking reactivity via casts is a common issue.

---

## 2025-11-29-llm-derive-for-template-string-prompts.md

**Last verified:** 2025-12-02
**Status:** context_dependent (conflicts with race-condition superstition)
**Evidence level:** medium
**Notes:** Template strings with multiple properties need derive(). File documents conflicting evidence - direct access sometimes works for single property. Context: use derive() for template strings, may need direct cell for user input to avoid race conditions. See generateObject-race-condition-pass-cell-directly.md for conflict.

---

## 2025-11-29-llm-dumb-map-approach-works.md

**Last verified:** 2025-12-02
**Status:** confirmed (FRAMEWORK AUTHOR + testing)
**Evidence level:** high (author quote + 100 item test)
**Notes:** Framework author: "The dumb looking approach where it's just a map should work". Tested: adding 1 item to 100 triggers exactly 1 new LLM call (others cached). Works for generateObject, fetchData, generateText. Multi-level caching composes automatically.

---

## 2025-11-29-llm-generateObject-returns-string-null.md

**Last verified:** 2025-12-02
**Status:** pending_verification (LLM behavior, single observation)
**Evidence level:** low
**Notes:** Claims LLM returns string "null" instead of JSON null for nullable fields. Workaround: check `value.toLowerCase() !== "null"`. Single observation, may be model-specific. Needs reproduction with multiple LLM providers.

---

## 2025-11-29-llm-no-custom-caching-layers.md

**Last verified:** 2025-12-02
**Status:** confirmed (FRAMEWORK AUTHOR confirmed)
**Evidence level:** high (author explicit rejection)
**Notes:** Framework author: "Ugh, no, it is building another layer of caching on top". DON'T build custom caching for LLM/fetch calls. Use generateObject (cached by prompt) and fetchData (cached by URL+options) directly with "dumb map approach".

---

## 2025-11-29-map-only-over-cell-arrays-fixed-slots.md

**Last verified:** 2025-12-02
**Status:** likely_correct (consistent with "cannot map computed arrays")
**Evidence level:** medium (consistent with confirmed superstition)
**Notes:** Can only .map() on cell arrays (pattern inputs or previous map outputs), not derive() results. "Fixed slots" approach for variable data: define max slots, use derive for individual slots, ifElse for null handling. Consistent with 2025-11-21-cannot-map-computed-arrays-in-jsx.md.

---

## 2025-11-29-mcp-chrome-stuck-after-sleep.md

**Last verified:** never
**Status:** skip
**Note:** Environment-specific (MCP/Playwright), not framework behavior

---

## 2025-11-29-no-computed-inside-map.md

**Last verified:** 2025-12-02
**Status:** confirmed (same principle as derive-inside-map-causes-thrashing)
**Evidence level:** high (observed 260% CPU, tab crash)
**Notes:** Same principle: never create reactive primitives (computed/cell/derive) inside .map() callbacks. Causes infinite reactivity loops. Related to derive-inside-map-causes-thrashing.md. Clear symptoms: page flashing, high CPU, tab crash. Solution: pre-compute in derive() before render.

---

## 2025-11-30-computed-cell-vs-computed-access.md

**Last verified:** 2025-12-02
**Status:** likely_correct (consistent with type system)
**Evidence level:** low (single observation)
**Notes:** Cells use .get() inside computed(), computed values accessed directly. TypeScript may need casting. Symptom: "get is not a function" when calling .get() on computed result. Logically consistent with how reactivity works - Cells are containers, computed values are resolved.

---

## 2025-11-30-ifelse-derive-consistent-cell-count.md

**Last verified:** 2025-12-02
**Status:** confirmed (consistent with derive-inside-map findings)
**Evidence level:** medium (applied fix to spindle-board-v2, same principle)
**Notes:** Same principle as derive-inside-map-causes-thrashing: framework tracks cells by creation order/count. Variable cell counts break tracking. Fix: compute at top level, render plain JS data. Consistent with already-confirmed reactivity superstitions.

---

## 2025-11-30-ifelse-input-binding.md

**Last verified:** 2025-12-02
**Status:** pending_verification (single observation)
**Evidence level:** low (not confirmed by others)
**Notes:** Claims two-way binding doesn't work for inputs inside ifElse conditionals. User types but cell doesn't update. Single observation, needs active repro to verify. Workaround: use CSS visibility instead of ifElse for inputs, or set defaults in handler.

---

## 2025-11-30-llm-cache-busting-for-respin.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** medium (confirmed by jkomoros)
**Notes:** LLM calls are cached by prompt content. For "respin" feature, add respinNonce to data structure and include in prompt. Page refresh = cached result (good UX), respin button = incremented nonce = fresh generation. Working pattern confirmed.

---

## 2025-11-30-no-globalthis-or-raw-inputs.md

**Last verified:** 2025-12-02
**Status:** confirmed
**Evidence level:** high (user explicit "NO NO NO NEVER" + jkomoros confirmation)
**Notes:** Never use globalThis or raw input elements. Use `<ct-input $value={cell}>` for two-way binding. Raw `value={cell}` displays but doesn't UPDATE. Confirmed: branch factor input wasn't updating cell, fixed with ct-input. Critical architectural guidance.

---

## 2025-12-01-handler-data-attributes-unreliable.md

**Last verified:** 2025-12-02
**Status:** confirmed (docs verified)
**Evidence level:** medium (single observation + doc verification)
**Notes:** data-* attributes not accessible in handler events (event.target.dataset is undefined). event.target.value IS documented to work. Fix: pass data in handler context instead of data-* attributes. Verified against labs/docs. Valid workaround pattern.
