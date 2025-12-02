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
**Status:** DISPROVED
**Evidence level:** high (active repro testing)
**Notes:** ACTIVELY VERIFIED via 2025-11-22-derive-unwrap-test.tsx repro:
- Single Cell param: type=boolean, hasGet=false (auto-unwrapped) ✓
- Object param: flag.type=boolean, flag.hasGet=false (ALSO auto-unwrapped!) ✓
- BOTH approaches auto-unwrap! The superstition is INCORRECT.
- The original issue may have been due to other factors (timing, specific pattern, etc.)
- **Consider demoting from folk_wisdom or adding correction notice**

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

**Last verified:** never
**Status:** pending

---

## 2025-11-25-framework-auto-boxes-array-items-use-equals-instance-method.md

**Last verified:** never
**Status:** pending

---

## 2025-11-25-generateObject-race-condition-pass-cell-directly.md

**Last verified:** never
**Status:** pending

---

## 2025-11-26-reactive-first-pass-may-have-empty-data.md

**Last verified:** never
**Status:** pending

---

## 2025-11-27-llm-handler-tools-must-write-to-result-cell.md

**Last verified:** never
**Status:** pending

---

## 2025-11-27-llm-never-raw-fetch-use-generateObject.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-array-items-undefined-during-hydration.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-cells-must-be-json-serializable.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-close-browser-before-charm-link.md

**Last verified:** never
**Status:** pending
**Note:** Environment-specific, may be hard to reproduce

---

## 2025-11-29-derive-inside-map-causes-thrashing.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-generateObject-empty-array-handler-pattern.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-generateObject-map-empty-array-handler.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-handlers-no-opaqueref-casting.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-llm-derive-for-template-string-prompts.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-llm-dumb-map-approach-works.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-llm-generateObject-returns-string-null.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-llm-no-custom-caching-layers.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-map-only-over-cell-arrays-fixed-slots.md

**Last verified:** never
**Status:** pending

---

## 2025-11-29-mcp-chrome-stuck-after-sleep.md

**Last verified:** never
**Status:** skip
**Note:** Environment-specific (MCP/Playwright), not framework behavior

---

## 2025-11-29-no-computed-inside-map.md

**Last verified:** never
**Status:** pending

---

## 2025-11-30-computed-cell-vs-computed-access.md

**Last verified:** never
**Status:** pending

---

## 2025-11-30-ifelse-derive-consistent-cell-count.md

**Last verified:** never
**Status:** pending

---

## 2025-11-30-ifelse-input-binding.md

**Last verified:** never
**Status:** pending

---

## 2025-11-30-llm-cache-busting-for-respin.md

**Last verified:** never
**Status:** pending

---

## 2025-11-30-no-globalthis-or-raw-inputs.md

**Last verified:** never
**Status:** pending

---

## 2025-12-01-handler-data-attributes-unreliable.md

**Last verified:** never
**Status:** pending
