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

## How to Use Superstitions

### When Completely Stuck

If official docs don't help, search superstitions:

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

**If it works (verified correct):**
1. **Upstream to labs docs** - Add the information to the appropriate doc in `~/Code/labs/docs/common/`
2. Create a PR to labs
3. Once merged, delete the superstition

**If it doesn't work:**
1. Add contradiction note to superstition
2. Document what error occurred
3. Document what actually worked

**If you're not sure:**
- Add a note about partial success
- Document differences from described behavior

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

# Check existing superstitions
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

### Template

Copy and fill this template:

```markdown
---
topic: [types|reactivity|jsx|handlers|llm|patterns|deployment|debugging|framework]
discovered: YYYY-MM-DD
sessions: [session-id-here]
related_labs_docs: ~/Code/labs/docs/common/FILENAME.md (or "none" if no related doc)
status: superstition
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

**If this is verified correct,** upstream it to labs docs and delete this superstition.

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

## Related Documentation

- **Official docs:** `~/Code/labs/docs/common/FILE.md` (or "none found")
- **Related patterns:** `labs/packages/patterns/example.tsx`

## Next Steps

- [ ] Verify against official docs
- [ ] If correct, upstream to labs docs
- [ ] Then delete this superstition

---

**Remember:** This is a hypothesis, not a fact. Treat with skepticism!
```

## Superstition Lifecycle

### Stage 1: Created

- Single observation
- Highly uncertain
- Needs verification

### Stage 2: Verified

**If it's verified correct:**
- Upstream to labs docs (`~/Code/labs/docs/common/`)
- Create PR to labs
- Once merged, delete the superstition

**If it's wrong:**
- Add [DEPRECATED] to filename
- Add note explaining why it's wrong
- Keep for historical reference

### Stage 3: Deleted

Once the knowledge is in labs docs, the superstition is no longer needed.

**The goal is for verified knowledge to live in official docs, not here.**

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

❌ **Don't:**
- State as absolute fact
- Omit the disclaimer
- Be vague about the problem
- Skip code examples
- Ignore official docs

## Maintenance

### Regular Review

Check superstitions periodically:
- **Contradicted by official docs?** Mark as deprecated
- **Already in labs docs?** Delete
- **Verified correct?** Upstream to labs

## Remember

Superstitions are **working hypotheses:**
- They might be right
- They might be wrong
- They might be partially correct
- They might be context-specific

**Treat them with healthy skepticism!**

Use them as starting points for investigation, not as authoritative answers.

When in doubt, trust official labs/docs/ (highest authority).
