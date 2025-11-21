---
name: community-docs
description: >
  Community folk knowledge system for empirical patterns. Three tiers: blessed
  (author-approved), folk_wisdom (multiple confirmations), superstitions (single
  observation). Use when encountering undocumented edge cases or framework quirks
  not in official docs.
---

# Community Docs (Folk Knowledge System)

**Location:** `community-docs/` in community-patterns repo

**CRITICAL:** These are NOT official framework documentation. Always check `~/Code/labs/docs/common/` first.

Community docs capture empirical patterns discovered during real pattern development - what works, what doesn't, and common pitfalls not yet in official docs.

## Three Tiers of Reliability

**Priority order when searching:**

1. **✓ blessed/** - Framework author approved (highly reliable)
   - Safe to trust
   - Complements official docs
   - May cover topics not yet in labs/docs/

2. **⭐⭐+ folk_wisdom/** - Verified by multiple sessions (probably reliable)
   - Empirically works, but still uncertain
   - Check star rating (more stars = more confirmations)
   - Read guestbook to see contexts where it worked
   - **Use with understanding, not blind trust**

3. **⚠️ superstitions/** - Single observation (HIGHLY SUSPECT)
   - **Treat with extreme skepticism**
   - May be wrong, incomplete, or context-specific
   - Each has prominent warning disclaimer
   - Try if completely stuck, but verify thoroughly

## When to Consult Community Docs

**After checking official labs/docs/ first:**
- Encountering undocumented edge cases
- Framework behaving unexpectedly
- TypeScript errors not explained in official docs
- Before creating new superstition (check if already documented)

**Do NOT consult before official docs** - labs/docs/ is always more authoritative!

## Searching Community Docs

```bash
# Search specific tiers
grep -r "Cell.*handler" community-docs/blessed/
grep -r "Cell.*handler" community-docs/folk_wisdom/
grep -r "Cell.*handler" community-docs/superstitions/

# List superstitions by topic
ls community-docs/superstitions/ | grep "types-"
ls community-docs/superstitions/ | grep "reactivity-"

# Read specific file
cat community-docs/folk_wisdom/types.md
cat community-docs/superstitions/2025-01-15-types-cell-arrays.md
```

## If You Find a Superstition (⚠️)

**Read the warning disclaimer carefully!** Superstitions are unverified and may be wrong.

1. **Verify against official docs** - Make sure it doesn't contradict
2. **Understand what it claims**
3. **Try in your context** with skepticism
4. **Test thoroughly**

**If it works for you:**
```markdown
1. Update superstition metadata:
   confirmed_count: 2
   last_confirmed: YYYY-MM-DD
   sessions: [original-session, your-session]
   stars: ⭐⭐
   status: ready-for-promotion

2. Promote to folk_wisdom/topic.md:
   - Add entry with guestbook
   - Include both confirmations
   - Set stars to ⭐⭐

3. Mark/remove superstition file

4. Commit: "Promote [topic] superstition to folk_wisdom"
```

**If it doesn't work:**
- Add contradiction note to superstition
- Document your context and what error occurred
- Don't promote - may need investigation

## If You Find Folk Wisdom (⭐⭐+)

**Check star rating and guestbook:**
- ⭐⭐ = 2 confirmations (newly promoted)
- ⭐⭐⭐ = 3-4 confirmations (fairly reliable)
- ⭐⭐⭐⭐ = 5-7 confirmations (quite reliable)
- ⭐⭐⭐⭐⭐ = 8+ confirmations (very reliable)

**Read guestbook** to see contexts where it worked.

**If it works for you:**
```markdown
1. Increment star count in folk_wisdom/topic.md

2. Add guestbook entry:
   - ✅ YYYY-MM-DD - Brief description of your use case (session-id)

3. Commit: "folk_wisdom/types: +1 confirmation for [topic]"
```

**If it doesn't work:**
- Add note about limitation or edge case
- Don't remove stars, just document the difference

## Creating a New Superstition

**Only after solving something not in any docs:**

1. **Search first** - Check it's not already documented:
   ```bash
   grep -r "your topic" ~/Code/labs/docs/common/
   grep -r "your topic" community-docs/
   ```

2. **Create file:** `community-docs/superstitions/YYYY-MM-DD-topic-brief-description.md`
   - Use topic prefixes: `types-`, `reactivity-`, `jsx-`, `handlers-`, `llm-`, `patterns-`, etc.
   - Example: `2025-01-15-types-cell-arrays-in-handlers.md`

3. **Copy template** from `community-docs/superstitions/README.md`

4. **Include full ⚠️ disclaimer** at top (already in template)

5. **Fill in:**
   - What problem you had
   - What you tried that didn't work
   - What solution seemed to work
   - Code examples (before/after)
   - Your context
   - Related official docs

6. **Set metadata:**
   ```yaml
   topic: [types|reactivity|jsx|handlers|llm|patterns|deployment|debugging|framework]
   discovered: YYYY-MM-DD
   confirmed_count: 1
   last_confirmed: YYYY-MM-DD
   sessions: [your-session-id]
   related_labs_docs: ~/Code/labs/docs/common/FILE.md (or "none")
   status: superstition
   stars: ⭐
   ```

7. **Commit:** `"Add superstition: [brief description]"`

**Remember:** You're creating a hypothesis, not stating fact! Be humble about uncertainty.

## Important Notes

**Skepticism is critical:**
- Superstitions may be wrong or context-specific
- Folk wisdom is empirical, not explanatory
- Only blessed entries are framework-approved
- **Always prefer official labs/docs/ when they exist**

**Do NOT:**
- Trust superstitions blindly
- Skip checking official docs first
- Promote without actually testing
- Create superstition for things in official docs

**DO:**
- Read disclaimer on every superstition
- Verify against official docs
- Test thoroughly before confirming
- Document your findings honestly
- Update confirmations when things work

**Community docs are a safety net for edge cases, not a primary reference!**

## Related Skills

- **recovery-strategies** - Use community docs as part of recovery escalation
- **pattern-development** - Reference when stuck on implementation
