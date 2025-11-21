# Superstitions ⚠️

Single observations that may or may not be true.

## ⚠️ CRITICAL WARNING

**Superstitions are HIGHLY UNRELIABLE.**

They represent:
- **One observation** from one person/session
- **Unverified hypothesis** that needs testing
- **Possibly wrong** understanding or coincidence
- **Context-specific** solutions that may not generalize

**DO NOT trust superstitions blindly!**

## What is a Superstition?

A superstition is a pattern or solution that:
- Worked once in a specific context
- Hasn't been independently verified
- May be coincidental or misunderstood
- Could contradict official docs (if you haven't checked!)
- Might not work in other contexts

## Why Call Them "Superstitions"?

The name emphasizes:
- **Humility** - We don't know if it's actually true
- **Skepticism** - Treat with doubt, not trust
- **Scientific method** - This is a hypothesis to test
- **Honesty** - We're not claiming authority

Just like folk superstitions ("don't walk under ladders"), these may or may not reflect reality - but someone believed they observed a pattern!

## How to Use Superstitions

### When Completely Stuck

If official docs and folk wisdom don't help, search superstitions:

```bash
# Search for related superstitions
ls community-docs/superstitions/ | grep "types"
cat community-docs/superstitions/2025-01-15-types-cell-arrays.md
```

### Read the Disclaimer!

**Every superstition has a prominent ⚠️ warning at the top.**

Read it! It reminds you:
- This is unverified
- May be wrong or incomplete
- Needs verification against official docs
- Should be tested thoroughly

### Try With Extreme Caution

1. **Verify it doesn't contradict official docs**
2. **Understand what it claims**
3. **Try in your specific context**
4. **Test thoroughly**
5. **Document what happens**

### After Trying

**If it works:**
1. Update superstition metadata (confirmed_count: 2)
2. Promote to folk_wisdom with guestbook
3. Commit the promotion

**If it doesn't work:**
1. Add contradiction note to superstition
2. Document what error occurred
3. Document what actually worked

**If you're not sure:**
- Add a note about partial success
- Document differences from described behavior
- Don't promote yet - needs clearer confirmation

## Creating a Superstition

### When to Create

Create a superstition when you:
- Encounter an issue not in official docs
- Solve it through trial and error
- Can't find similar knowledge in community-docs
- Want to document for potential future reference

### Before Creating

**Search first!**

```bash
# Check official docs
ls ~/Code/labs/docs/common/
grep -r "your topic" ~/Code/labs/docs/common/

# Check community-docs
grep -r "your topic" community-docs/blessed/
grep -r "your topic" community-docs/folk_wisdom/
grep -r "your topic" community-docs/superstitions/
```

Don't create if it already exists or is in official docs!

### File Naming

**Format:** `YYYY-MM-DD-topic-brief-description.md`

**Topic prefixes:**
- `patterns-` - Pattern structure and composition
- `reactivity-` - Cells, computed, reactive values
- `types-` - TypeScript type issues and signatures
- `jsx-` - JSX rendering, components, styling
- `handlers-` - Handler functions and event handling
- `llm-` - LLM integration (generateObject, generateText)
- `deployment-` - Deployment, ct CLI, servers
- `debugging-` - General debugging strategies
- `framework-` - Core framework behavior

**Examples:**
```
2025-01-15-types-cell-arrays-in-handlers.md
2025-01-16-reactivity-computed-outside-jsx.md
2025-01-20-jsx-ifelse-vs-ternary.md
2025-01-22-handlers-llm-calls-not-allowed.md
2025-01-25-patterns-navigateto-within-handlers.md
```

### Template

Copy and fill this template:

```markdown
---
topic: [types|reactivity|jsx|handlers|llm|patterns|deployment|debugging|framework]
discovered: YYYY-MM-DD
confirmed_count: 1
last_confirmed: YYYY-MM-DD
sessions: [session-id-here]
related_labs_docs: ~/Code/labs/docs/common/FILENAME.md (or "none" if no related doc)
status: superstition
stars: ⭐
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

# [Brief Title Describing The Issue/Learning]

## Problem

Clear description of the issue encountered:
- What you were trying to do
- What error or unexpected behavior occurred
- Any error messages (copy exact text)

**Example error:**
```
Type 'OpaqueRef<Item>[]' is not assignable to type 'Item[]'
```

## Solution That Seemed To Work

What appeared to work in this one instance:
- Specific approach or code pattern
- Why this might work (speculation is OK here)
- Any caveats or limitations noticed

**Be honest about uncertainty!**

## Example

```typescript
// Before (didn't work)
[show the code that failed]

// After (seemed to work)
[show the code that worked]
```

Include enough context to understand the situation.

## Context

Important details:
- What pattern/code was this in?
- What were you trying to accomplish?
- What else did you try that didn't work?
- Any related framework docs that might explain it?
- Links to similar issues or patterns
- Your environment (framework version, etc.)

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/FILE.md` (or "none found")
- **Related patterns:** `labs/packages/patterns/example.tsx`
- **Similar issues:** Link to GitHub issues if any

## Next Steps

- [ ] Needs confirmation by another session
- [ ] Check if this contradicts official docs
- [ ] Framework author feedback requested
- [ ] Related to open framework issue #XXX

## Notes

Any additional observations or thoughts:
- Edge cases you noticed
- Partial successes
- Alternative approaches you tried

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
```

### Example Superstition

See the template above filled out with a real example:

```markdown
---
topic: types
discovered: 2025-01-15
confirmed_count: 1
last_confirmed: 2025-01-15
sessions: [cheeseboard-schedule-dev]
related_labs_docs: ~/Code/labs/docs/common/TYPES_AND_SCHEMAS.md
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

[standard disclaimer]

---

# Use Cell<Item[]> Not Cell<OpaqueRef<Item>[]> in Handler Signatures

## Problem

When defining handlers that need to mutate array cells, using `Cell<OpaqueRef<Item>[]>` causes type errors:

```
Type 'OpaqueRef<Item>[]' is not assignable to type 'Item[]'
Property 'push' does not exist on type 'OpaqueRef<Item>[]'
```

## Solution That Seemed To Work

Changed handler signature to use `Cell<Item[]>` instead:

```typescript
// Before (didn't work)
const addItem = handler<unknown, { items: Cell<OpaqueRef<Item>[]> }>(
  (_, { items }) => {
    items.push({ title: "New", done: false }); // Type error!
  }
);

// After (seemed to work)
const addItem = handler<unknown, { items: Cell<Item[]> }>(
  (_, { items }) => {
    items.push({ title: "New", done: false }); // Works!
  }
);
```

## Context

Working on cheeseboard-schedule pattern. Needed handler to add ingredient preferences to a Cell<IngredientPreference[]>.

Originally tried Cell<OpaqueRef<IngredientPreference>[]> based on type errors elsewhere, but that caused issues in handler.

## Related Documentation

- **Official docs:** ~/Code/labs/docs/common/TYPES_AND_SCHEMAS.md
- Mentions Cell<> and OpaqueRef<> but doesn't specifically address handler signatures

## Next Steps

- [ ] Confirm this is correct with another pattern
- [ ] Check if official docs explain this
- [ ] Ask framework author if this is the intended pattern

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
```

## Superstition Lifecycle

### Stage 1: Created (⭐)

- Single observation
- Highly uncertain
- Needs verification

### Stage 2: Tested by Others

**If it works for others:**
- Update confirmed_count
- Add their session to metadata
- When confirmed_count >= 2, promote to folk_wisdom

**If it doesn't work:**
- Add contradiction note
- Document the different context
- May need revision or removal

### Stage 3: Promoted (⭐⭐)

- Becomes folk_wisdom entry
- Gets guestbook
- Superstition file marked [PROMOTED] or removed

### Alternative: Deprecated

If a superstition is found to be wrong or contradicted by official docs:
- Add [DEPRECATED] to filename
- Add note explaining why it's wrong
- Keep for historical reference (so others don't repeat)

## Quality Guidelines

### Good Superstitions

✅ **Do:**
- Include the full ⚠️ disclaimer
- Be specific about the problem
- Show exact error messages
- Include complete code examples
- Document your context thoroughly
- Reference related docs (even if they don't fully explain)
- Be humble about uncertainty
- Document what else you tried

❌ **Don't:**
- State as absolute fact
- Omit the disclaimer
- Be vague about the problem
- Skip code examples
- Ignore official docs
- Claim to understand why (unless you really do)
- Make it overly broad

### Good Confirmations

When someone tests a superstition:

✅ **Do:**
- Try it thoroughly in your context
- Document whether it worked
- Note any differences from described behavior
- Update metadata accurately
- Promote if confirmed

❌ **Don't:**
- Confirm without actually testing
- Promote based on reading alone
- Ignore contradictions
- Skip documentation

## Maintenance

### Regular Review

Check superstitions periodically:
- **Older than 3 months, no confirmations?** Consider archiving
- **Contradicted by new official docs?** Mark as deprecated
- **Multiple contradictions?** Mark as likely wrong
- **Ready for promotion?** Move to folk_wisdom

### When Framework Changes

- Test superstitions against new versions
- Update or deprecate outdated ones
- Document version-specific behavior

## Remember

Superstitions are **working hypotheses:**
- They might be right
- They might be wrong
- They might be partially correct
- They might be context-specific

**Treat them with healthy skepticism!**

Use them as starting points for investigation, not as authoritative answers.

When in doubt, trust:
1. Official labs/docs/ (highest authority)
2. Blessed community-docs (framework-approved)
3. Folk wisdom (multiple confirmations)
4. Superstitions (single observation - be skeptical!)
