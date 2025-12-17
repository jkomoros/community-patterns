# Conditional && Rendering Inside .map() Leaks $alias Objects

**Status:** Superstition (single observation)

---

## DISCLAIMER

This is a **SUPERSTITION** - an unverified observation from a single session. It may be:
- Wrong or incomplete
- Context-specific
- A misunderstanding of the actual cause
- Fixed in newer framework versions

**Treat with extreme skepticism.** Verify against official docs and test thoroughly.

---

## Metadata

```yaml
topic: jsx, map, conditionals, alias, reactivity
discovered: 2025-12-17
confirmed_count: 1
last_confirmed: 2025-12-17
sessions: [google-docs-comment-orchestrator]
related_labs_docs: none
status: superstition
stars:
```

## Problem

When using JavaScript's `&&` operator for conditional rendering inside a `.map()` callback, reactive values can leak as raw `$alias` JSON objects instead of being unwrapped.

```tsx
// BAD - && conditional can leak $alias objects
{commentsWithState.map((item) => (
  <div>
    {/* This can render as {"$alias":{"path":[...],"cell":{"/":"..."}}} */}
    {item.isExpanded && (
      <div>
        {item.quotedFileContent?.value && (
          <div>"{item.quotedFileContent.value}"</div>
        )}
      </div>
    )}
  </div>
))}
```

## What Works

**Use `ifElse()` for conditional rendering inside `.map()` callbacks:**

```tsx
// GOOD - ifElse properly handles reactive values
{commentsWithState.map((item) => (
  <div>
    {ifElse(
      item.isExpanded,
      <div>
        {ifElse(
          item.quotedFileContent !== null,
          <div>"{item.quotedFileContent?.value ?? ""}"</div>,
          null
        )}
      </div>,
      null
    )}
  </div>
))}
```

## Why This Works

The `ifElse()` function is designed to handle reactive values properly in the framework's rendering context. The `&&` operator creates an implicit branch that may not correctly unwrap reactive proxies, causing the serialized `$alias` reference to render as text.

## Symptoms to Watch For

- Strings like `{"$alias":{"path":[...],"cell":{"/":"..."}}}` appearing in UI
- Console warnings: "unexpected object when value was expected {$alias: Object}"
- Conditional content not rendering or rendering incorrectly

## Context

- Discovered while building Google Docs Comment Orchestrator pattern
- Issue occurred in expanded comment content section inside `.map()` callback
- Pre-computing data in `computed()` wasn't sufficient - the conditional rendering itself was the issue
- Switching from `&&` to `ifElse()` resolved the `$alias` leakage

## Related

- `2025-11-29-no-computed-inside-map.md` - related reactivity issues in .map()
- `2025-06-12-jsx-nested-array-map-frame-mismatch.md` - nested maps causing frame errors
- `2025-11-30-ifelse-derive-consistent-cell-count.md` - ifElse behavior

## Guestbook

- 2025-12-17 - Discovered while building google-docs-comment-orchestrator. Expanded comment section showed raw $alias JSON. Pre-computing data helped but didn't fully fix. Changing from `{item.isExpanded && ...}` to `{ifElse(item.isExpanded, ..., null)}` resolved the issue. (google-docs-comment-orchestrator / jkomoros)
