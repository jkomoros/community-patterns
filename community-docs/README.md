# Community Docs - Folk Knowledge System

Empirical patterns and solutions discovered by the community during pattern development.

## ⚠️ Important Disclaimers

**These are NOT official framework documentation.** Always check `~/Code/labs/docs/common/` first.

Community docs capture practical knowledge discovered through actual pattern development - what works, what doesn't, and common pitfalls. They complement (not replace) official documentation.

## Three Tiers of Reliability

### ✓ Blessed (Most Reliable)

**Location:** `blessed/`

Framework author approved knowledge. These have been reviewed and endorsed by the CommonTools team.

**Reliability:** Very high - safe to rely on
**When to use:** When you need authoritative guidance beyond official docs

### ⭐⭐+ Folk Wisdom (Probably Reliable)

**Location:** `folk_wisdom/`

Verified by 2+ independent sessions/developers. Empirically works across different contexts.

**Reliability:** Moderate to high, depending on star count
**When to use:** When official docs don't cover your specific case
**Caution:** Still empirical - may be incomplete or context-specific

**Star ratings:**
- ⭐⭐ = 2 confirmations (newly promoted)
- ⭐⭐⭐ = 3-4 confirmations (fairly reliable)
- ⭐⭐⭐⭐ = 5-7 confirmations (quite reliable)
- ⭐⭐⭐⭐⭐ = 8+ confirmations (very reliable, consider requesting blessing)

### ⚠️ Superstitions (Treat With Suspicion)

**Location:** `superstitions/`

Single observation only. May be coincidence, misunderstanding, or context-specific.

**Reliability:** Unknown - highly suspect
**When to use:** When completely stuck and nothing else works
**Caution:** DO NOT trust without thorough verification

Each superstition has a prominent warning disclaimer at the top.

## Why "Superstitions"?

We call single observations "superstitions" to emphasize:

- **Humility** - We don't know if it's really true
- **Empiricism** - It worked once, but needs more data
- **Skepticism** - Treat as hypothesis, not fact
- **Scientific method** - Observe, hypothesize, test, confirm

A "superstition" that gets confirmed by multiple independent sessions graduates to "folk wisdom" - still empirical, but more reliable.

## How to Use This System

### When You're Stuck

**Priority order:**

1. **Check official docs first:** `~/Code/labs/docs/common/`
2. **Check blessed:** `community-docs/blessed/`
3. **Check folk wisdom:** `community-docs/folk_wisdom/` (prefer ⭐⭐⭐+ entries)
4. **Check superstitions:** `community-docs/superstitions/` (with extreme skepticism)

### Searching Community Docs

```bash
# Search across all tiers
grep -r "your search term" community-docs/

# Search specific tier
grep -r "Cell.*handler" community-docs/folk_wisdom/
grep -r "ifElse" community-docs/superstitions/

# List superstitions by topic
ls community-docs/superstitions/ | grep "types-"
```

### If You Find a Superstition

**Read the ⚠️ warning carefully!** Superstitions are unverified and may be wrong.

**Then:**
1. Understand what problem it claims to solve
2. Verify it doesn't contradict official docs
3. Try it in your specific context
4. Test thoroughly

**If it works:**
- Update the superstition metadata
- If this is the 2nd confirmation, promote to folk_wisdom
- Document your use case

**If it doesn't work:**
- Add a contradiction note to the superstition
- Document what you tried and what error occurred
- Document what actually worked (might be a new superstition!)

### If You Find Folk Wisdom

**Check the star rating and guestbook:**
- More stars = more reliable
- Read guestbook to see contexts where it worked
- See if your use case is similar

**If it works:**
1. Add a guestbook entry
2. Increment the star count
3. Commit: `"folk_wisdom/types: +1 confirmation for [topic]"`

**If it doesn't work:**
- Add a note about your context
- May need to refine the guidance
- Document what worked instead

### Creating a New Superstition

**When you solve something not documented anywhere:**

1. **Search first** - make sure it's not already documented
2. **Create file:** `superstitions/YYYY-MM-DD-topic-brief-description.md`
3. **Use template** from `superstitions/README.md`
4. **Include full ⚠️ disclaimer**
5. **Document:**
   - What problem you had
   - What you tried that didn't work
   - What solution seemed to work
   - Your specific context
   - Any related docs
6. **Set metadata:**
   - `confirmed_count: 1`
   - `stars: ⭐`
   - `status: superstition`
7. **Commit:** `"Add superstition: [brief description]"`

**Remember:** You're creating a hypothesis, not stating a fact!

## Promotion Workflow

### Superstition → Folk Wisdom (2nd Confirmation)

**When a superstition works for a 2nd independent person/session:**

1. Update superstition metadata:
   ```yaml
   confirmed_count: 2
   last_confirmed: YYYY-MM-DD
   sessions: [session-1-id, session-2-id]
   status: promoted-to-folk-wisdom
   stars: ⭐⭐
   ```

2. Create/update entry in appropriate `folk_wisdom/topic.md`:
   ```markdown
   ## [Title]

   ⭐⭐ (2 confirmations)

   [Content from superstition]

   **Guestbook:**
   - ✅ YYYY-MM-DD - Initial discovery in [context] (session-1-id)
   - ✅ YYYY-MM-DD - Confirmed in [context] (session-2-id)
   ```

3. Mark superstition file as `[PROMOTED]` or remove it

4. Commit: `"Promote [topic] superstition to folk_wisdom"`

### Folk Wisdom → Blessed (Framework Author Approval)

**When framework author explicitly approves (typically 5+ stars):**

1. Framework author reviews folk_wisdom entry
2. Either:
   - Adds to official `labs/docs/` (becomes canonical)
   - Approves for `blessed/` in community-patterns
   - Provides corrections/clarifications

3. If approved for blessed/:
   ```markdown
   ## [Title] ✓

   **Blessed by:** @framework-author-username
   **Date:** YYYY-MM-DD
   **Framework version:** vX.Y.Z

   [Content - now authoritative for this framework version]

   **History:**
   [Previous guestbook showing the journey to blessing]
   ```

4. Commit: `"Bless [topic]: approved by framework author"`

## File Naming Conventions

### Superstitions

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
```

### Folk Wisdom & Blessed

**Format:** `topic.md` (consolidated by topic)

**Topics:**
- `patterns.md` - Pattern structure and composition
- `reactivity.md` - Cells, computed, reactive values
- `types.md` - TypeScript type issues
- `jsx.md` - JSX rendering and components
- `handlers.md` - Handler functions
- `llm.md` - LLM integration
- `deployment.md` - Deployment and tooling
- `debugging.md` - Debugging strategies

## Contributing Guidelines

### Good Superstitions

✅ **Do:**
- Document specific problem and solution
- Include code examples
- Reference related official docs
- Describe your context
- Be humble about uncertainty
- Include the ⚠️ disclaimer

❌ **Don't:**
- State as absolute fact
- Omit context or examples
- Skip verification against official docs
- Make it too broad or vague
- Forget the warning disclaimer

### Good Confirmations

✅ **Do:**
- Try the solution in your specific context
- Test thoroughly
- Document your use case in guestbook
- Update star count appropriately
- Note if behavior differs slightly

❌ **Don't:**
- Blindly copy without testing
- Confirm based on reading alone
- Skip adding guestbook entry
- Promote prematurely

### Good Folk Wisdom Entries

✅ **Do:**
- Consolidate related superstitions
- Show evolution in guestbook
- Include multiple examples
- Note any limitations or edge cases
- Link to official docs

❌ **Don't:**
- Claim it's officially documented
- Remove uncertainty entirely
- Skip the guestbook
- Make it prescriptive without nuance

## Maintenance

### Review Process

Periodically review:
- **Superstitions older than 3 months** with no confirmations → Consider archiving
- **Folk wisdom with 5+ stars** → Candidate for framework author review
- **Entries contradicted by new official docs** → Update or deprecate
- **Duplicate entries** → Consolidate

### Version Compatibility

When framework versions change:
- Review blessed entries for version applicability
- Test folk wisdom against new version
- Update or deprecate outdated knowledge
- Document version-specific behavior

## Getting Help

**For official framework questions:** Check `~/Code/labs/docs/common/`
**For community knowledge:** This directory
**For clarification:** Ask in community channels
**For framework bugs:** Open issue in labs repo

---

Remember: Community docs are a **complement** to official documentation, not a replacement. They capture practical, empirical knowledge discovered through real-world pattern development.

When in doubt, trust official docs first!
