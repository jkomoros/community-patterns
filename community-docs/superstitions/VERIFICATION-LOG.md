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

**Last verified:** never
**Status:** pending

---

## 2025-11-22-ct-code-editor-wiki-link-syntax.md

**Last verified:** never
**Status:** pending

---

## 2025-11-22-deployment-setsrc-conflicts-use-new-instead.md

**Last verified:** never
**Status:** pending

---

## 2025-11-22-derive-object-parameter-cell-unwrapping.md

**Last verified:** never
**Status:** pending

---

## 2025-11-22-generateObject-model-names.md

**Last verified:** never
**Status:** pending

---

## 2025-11-22-llm-generateObject-reactive-map-derive.md

**Last verified:** never
**Status:** pending

---

## 2025-11-22-patterns-pass-cells-not-charm-refs.md

**Last verified:** never
**Status:** pending

---

## 2025-11-22-space-name-character-requirements.md

**Last verified:** never
**Status:** pending

---

## 2025-11-24-default-only-at-array-level-not-nested.md

**Last verified:** never
**Status:** pending

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
