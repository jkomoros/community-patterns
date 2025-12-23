# SUPERSTITION: wish("#mentionable") Returns Minimal Projection

**WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

wish() target differences - `#mentionable` vs `/` projections

## Problem

When using `wish("#mentionable")` to get a list of charms for autocomplete or filtering, properties like `subCharms`, `title`, and `#record` are undefined even though the charms have them.

### What Didn't Work

```typescript
// Using wish("#mentionable") to filter Records by checking for subCharms
const mentionable = wish<MentionableCharm[]>("#mentionable");

// Inside lift() - subCharms is always undefined!
const records = mentionable.filter(charm => {
  return charm.subCharms !== undefined;  // Always false!
});
```

**Symptom:** All items appear to lack properties like `subCharms`, `title`, etc. Filtering by record type fails because the property doesn't exist on the projection.

## Solution That Seemed to Work

Use `wish("/").allCharms` instead to get full charm objects:

```typescript
// Use wish("/").allCharms for complete charm data
const { allCharms } = wish<{ allCharms: Charm[] }>("/");

// Inside lift() - full data is available
const records = allCharms.filter(charm => {
  return (charm as any).subCharms !== undefined;  // Works!
});
```

**Result:** Charms have all their properties including `subCharms`, `title`, `#record`, etc.

## Context

- **Pattern:** members.tsx (Members module autocomplete)
- **Use case:** Filtering charms by type (Records vs non-Records) for member selection
- **Framework:** CommonTools wish() system
- **Verified:** Via debug logging and `charm inspect` CLI comparison

## Theory / Hypothesis

The `#mentionable` target is designed for backlink/mention functionality and intentionally returns a minimal projection to optimize performance. Looking at `backlinks-index.tsx`:

```typescript
export type MentionableCharm = {
  [NAME]?: string;
  mentioned: MentionableCharm[];
  backlinks: MentionableCharm[];
};
```

Only these properties are included in the projection. The `wish()` implementation maps `#mentionable` to `spaceCell.defaultPattern.backlinksIndex.mentionable`.

| wish() Target | Returns | Typical Properties |
|---------------|---------|-------------------|
| `wish("/")` | Full space data | `allCharms` (complete), `defaultPattern`, `recentCharms` |
| `wish("#mentionable")` | Minimal projection | Only `$NAME`, `backlinks`, `mentioned` |
| `wish("#default")` | defaultPattern | Full pattern data |

## Related Official Docs

- `/packages/runner/src/builtins/wish.ts` - Defines target resolution
- `/packages/patterns/backlinks-index.tsx` - Defines MentionableCharm type

## Metadata

```yaml
topic: wish
discovered: 2025-12-22
confirmed_count: 1
last_confirmed: 2025-12-22
sessions: [members-autocomplete-fix]
related_labs_docs: packages/runner/src/builtins/wish.ts
status: superstition
stars:
```

## Guestbook

- 2025-12-22 - Members module autocomplete showed "No matching options" because isRecord() check failed - subCharms undefined on wish("#mentionable") items, fixed by using wish("/").allCharms (members-autocomplete-fix)

---

**Remember: This is just one observation. Test thoroughly in your own context!**
