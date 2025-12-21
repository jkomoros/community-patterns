---
topic: wishes
discovered: 2025-12-20
sessions: members-module-testing
related_labs_docs: ~/Code/labs/packages/runner/src/builtins/wish.ts
status: verified
verified: 2025-12-20
verdict: CORRECT - by design but poorly documented
---

# `wish("#mentionable")` Requires Default Pattern Infrastructure

## Problem

When testing patterns that use `wish("#mentionable")` (e.g., Members, Note, Chatbot), the wish returns empty/undefined even when records exist in the space:

```typescript
// In your pattern
const mentionable = wish<MentionableCharm[]>("#mentionable");
// Returns [] or undefined when testing via CLI!
```

**Observed behavior:** Search features show "No matching options" even though records exist in the space. This happens when patterns are deployed via `ct charm new` without a default pattern.

## Root Cause

The `#mentionable` wish is **hardcoded** to resolve to a specific path:

```
spaceCell → defaultPattern → backlinksIndex → mentionable
```

From `/packages/runner/src/builtins/wish.ts:154-158`:
```typescript
case "#mentionable":
  return [{
    cell: getSpaceCell(ctx),
    pathPrefix: ["defaultPattern", "backlinksIndex", "mentionable"],
  }];
```

This means:
1. The space must have a `defaultPattern` cell
2. That pattern must instantiate `BacklinksIndex`
3. That pattern must export `backlinksIndex` in its output

## What Sets Up This Infrastructure

The shell's `default-app.tsx` does this automatically:

```typescript
// From /packages/patterns/default-app.tsx
export default pattern<CharmsListInput, CharmsListOutput>((_) => {
  const { allCharms } = wish<{ allCharms: MentionableCharm[] }>("/");
  const index = BacklinksIndex({ allCharms });

  return {
    backlinksIndex: index,  // ← Required for #mentionable to work
    // ... other outputs
  };
});
```

When you use the shell's normal flow (homepage → create record), this infrastructure is already in place.

## Why CLI Deployment Fails

`ct charm new pattern.tsx` creates and deploys a charm, but:
- Does NOT deploy a default pattern
- Does NOT set up BacklinksIndex
- Does NOT link `spaceCell.defaultPattern`

Result: `wish("#mentionable")` tries to resolve but finds `undefined`.

## Workarounds

### Option 1: Deploy default-app first (RECOMMENDED)

```bash
# First, deploy the infrastructure
ct charm new packages/patterns/default-app.tsx \
  -i claude.key -a http://localhost:8000 -s my-space

# Then deploy your pattern
ct charm new my-pattern.tsx \
  -i claude.key -a http://localhost:8000 -s my-space
```

### Option 2: Handle empty mentionable gracefully

```typescript
const mentionable = wish<MentionableCharm[]>("#mentionable") || [];
// Now mentionable is always an array, even if infrastructure is missing
```

### Option 3: Test via shell instead of CLI

Use the shell's normal workflow:
1. Navigate to `http://localhost:5173/my-space`
2. Create records using the UI
3. The default-app infrastructure is automatically set up

## Testing Implications

When writing integration tests for patterns that use `wish("#mentionable")`:

1. **Unit tests with `ct dev`**: Will return undefined for `wish("#mentionable")`
2. **Space tests with `ct charm new`**: Same issue unless default-app is deployed first
3. **Shell tests via Playwright**: Work correctly because shell deploys default-app

**Recommended test strategy:**
- For patterns using wishes, test via the shell with Playwright
- Or explicitly deploy default-app before deploying test patterns

## Evidence

### Wish resolution code
`/packages/runner/src/builtins/wish.ts:154-158`

### BacklinksIndex produces mentionable
`/packages/patterns/backlinks-index.tsx:59-79`

### default-app sets up infrastructure
`/packages/patterns/default-app.tsx:86-95`

### Test showing required setup
`/packages/runner/test/wish.test.ts:186-230`

## Related Patterns Affected

Patterns that use `wish("#mentionable")`:
- `packages/patterns/members.tsx` - member search
- `packages/patterns/note.tsx` - @mentions
- `packages/patterns/chatbot.tsx` - @mentions
- `packages/patterns/chatbot-outliner.tsx` - @mentions
- `packages/patterns/chatbot-note-composed.tsx` - @mentions

## Conclusion

This is **working as designed** but poorly documented. The system assumes every space has a "default pattern" that sets up shared infrastructure like BacklinksIndex. CLI workflows skip this, creating a usability gap.

**Recommendation:** Document this in `docs/common/PATTERN_DEV_DEPLOY.md` or create a `ct charm setup-space` command that deploys minimal infrastructure.

---

**This pattern is VERIFIED CORRECT. Upstream to labs docs.**
