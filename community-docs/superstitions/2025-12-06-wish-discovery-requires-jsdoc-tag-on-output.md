# Wish Discovery Requires JSDoc Tag on Output Interface

**SUPERSTITION** - Single observation, unverified. Use with skepticism!

## Topic

Making patterns discoverable via `wish()` across spaces

## Problem

When you want other patterns to discover your charm via `wish({ query: "#yourTag" })`, simply favoriting the charm is NOT enough. The tag must be in a **JSDoc comment on the Output interface**.

### What Didn't Work

```typescript
// ❌ WRONG: Tag only in regular comments
// This charm should be favorited with tag: #gmailSearchRegistry
// 3. Other patterns discover via: wish({ query: "#gmailSearchRegistry" })

export interface MyOutput {
  [NAME]: string;
  [UI]: JSX.Element;
  data: SomeType;
}
```

Even after favoriting the charm, `wish({ query: "#gmailSearchRegistry" })` from other patterns returns "No favorite found".

### What Works

```typescript
// ✅ CORRECT: Tag in JSDoc comment on Output interface
/** Community registry for shared queries. #gmailSearchRegistry */
export interface MyOutput {
  [NAME]: string;
  [UI]: JSX.Element;
  data: SomeType;
}
```

Now `wish({ query: "#gmailSearchRegistry" })` finds the favorited charm.

## The Complete Setup

For wish-based discovery to work:

1. **Add JSDoc tag to Output interface:**
   ```typescript
   /** Description of your pattern. #yourTag */
   export interface YourPatternOutput {
     // ... outputs
   }
   ```

2. **Deploy the pattern:**
   ```bash
   deno task ct charm new your-pattern.tsx --api-url ... --identity ... --space ...
   ```

3. **Favorite the charm in the UI:**
   - Navigate to the charm
   - Click the ☆ button to favorite it

4. **Other patterns can now discover it:**
   ```typescript
   const wishResult = wish<YourPatternOutput>({ query: "#yourTag" });
   ```

## Why This Works

The framework extracts tags from JSDoc comments during pattern compilation. These tags are stored as metadata with the charm. When you favorite a charm, the framework indexes it by these tags. The `wish()` function searches favorites by tag.

Without the JSDoc tag, the charm has no searchable tag metadata, so `wish()` can't find it even if it's favorited.

## Examples from Working Patterns

**google-auth.tsx:**
```typescript
/** Google OAuth authentication for Google APIs. #googleAuth */
interface Output {
  auth: Auth;
  scopes: string[];
  selectedScopes: SelectedScopes;
}
```

**gmail-search-registry.tsx:**
```typescript
/** Community registry for shared Gmail search queries. #gmailSearchRegistry */
export interface GmailSearchRegistryOutput {
  registries: Record<string, AgentTypeRegistry>;
  submitQuery: ReturnType<typeof handler>;
  // ...
}
```

## Common Mistakes

| Mistake | Result |
|---------|--------|
| Tag in regular comment `// #myTag` | Not extracted, wish fails |
| Tag in pattern description comment | Not extracted, wish fails |
| Tag in JSDoc but not on Output interface | May not be indexed |
| Favorited without JSDoc tag | wish returns "No favorite found" |
| JSDoc tag but not favorited | wish returns "No favorite found" |

## Detection

If `wish({ query: "#yourTag" })` returns "No favorite found" or null:

1. Check if the charm is favorited (⭐ icon in header bar)
2. Check if Output interface has JSDoc comment with tag
3. Redeploy the pattern if you added the JSDoc tag
4. Re-favorite after redeploying

## Context

- **Pattern:** gmail-search-registry.tsx
- **Use case:** Community query registry discoverable by gmail-agent patterns
- **Problem:** Initial deployment had tag in regular comments but not JSDoc
- **Solution:** Added `/** ... #gmailSearchRegistry */` JSDoc to Output interface

## Related

- **Folk Wisdom: background-execution.md** - Documents wish-based auth sharing pattern
- **Superstition: wish-cross-space-embed-in-jsx.md** - CT-1090 workaround for cross-space wish

## Metadata

```yaml
topic: wish, discovery, jsdoc, tags, favorites
discovered: 2025-12-06
confirmed_count: 1
last_confirmed: 2025-12-06
sessions: [gmail-shared-search-strings]
related_functions: wish, pattern
status: superstition
stars: ⭐⭐
```

## Guestbook

- 2025-12-06 - gmail-search-registry.tsx. Initially had `#gmailSearchRegistry` tag only in regular comments describing the setup. After deploying and favoriting, the hotel-membership-gmail-agent couldn't discover it via wish. Fix: Added JSDoc comment `/** Community registry for shared Gmail search queries. #gmailSearchRegistry */` to the GmailSearchRegistryOutput interface, then redeployed. (gmail-shared-search-strings)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
