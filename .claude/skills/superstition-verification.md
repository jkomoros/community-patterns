# Superstition Verification Skill

Use this skill to systematically verify superstitions in `community-docs/superstitions/`.

## Purpose

Superstitions are single observations that may be:
- **No longer relevant** (framework fixed it)
- **Has limitations** (partially correct)
- **Actually confirmed** (should be promoted)

This workflow tests each superstition and creates documentation for framework author review.

## Workflow

### 1. Select a Superstition

Check `community-docs/superstitions/VERIFICATION-LOG.md` for the oldest unverified superstition.

Skip superstitions that are:
- Environment-specific and hard to reproduce (e.g., "MCP Chrome stuck after sleep")
- About external tools, not the framework itself

### 2. Read and Understand

1. Read the superstition file thoroughly
2. Understand the **claim** - what behavior is being described?
3. Understand the **context** - what was the user trying to accomplish?
4. Note any related docs or patterns mentioned

### 3. Investigate

Use multiple techniques:

**Check official docs:**
```bash
grep -r "relevant term" ~/Code/labs/docs/common/
```

**Check framework source:**
Look for relevant code in `~/Code/labs/packages/` that might explain the behavior.

**Check if already documented:**
The behavior might now be in official docs, making the superstition redundant.

### 4. Create Minimal Repro

Create a minimal pattern that demonstrates the claimed behavior:

**File location:** `community-docs/superstitions/repros/YYYY-MM-DD-short-name.tsx`

The repro should:
- Be as minimal as possible while still demonstrating the issue
- Include comments explaining what behavior to look for
- Be deployable and runnable

### 5. Deploy and Test

Deploy the repro to a test space:
```bash
deno task ct charm new repros/YYYY-MM-DD-short-name.tsx \
  --api-url http://localhost:8000 \
  --identity claude.key \
  --space superstition-verify-[unique-suffix]
```

Test the actual behavior. Does it match the superstition's claim?

**Be wary of false negatives** - a minimal repro might not trigger the issue if it depends on specific conditions.

### 6. Create Verification File

Create `community-docs/superstitions/verifications/YYYY-MM-DD-short-name.md` using this template:

```markdown
# Verification: [Short Name]

**Superstition:** `../YYYY-MM-DD-full-filename.md`
**Last verified:** YYYY-MM-DD
**Status:** awaiting-maintainer-review

---

## Framework Author Review

> **Please respond by commenting on this section in the PR.**

### Context

[1-2 paragraphs explaining what we're trying to accomplish, the claim being made,
and why this matters. Give enough context that the framework author understands
the situation without reading other files.]

### Minimal Repro

<!-- Source: repros/YYYY-MM-DD-short-name.tsx -->
```tsx
[FULL pattern code here - everything needed to understand and run the repro]
```

### Question

**Does this behavior match your expectations?**
- [ ] Yes, this is correct and won't change
- [ ] Yes, but we plan to change it
- [ ] No, this looks like a bug
- [ ] It's more nuanced: _______________

---

## Verification Details

**Verified by:** Claude (superstition-verification workflow)
**Date:** YYYY-MM-DD

### Investigation

- **Official docs:** [What I found or "no relevant docs found"]
- **Framework source:** [What I found or "not investigated"]
- **Deployed repro:** Space `superstition-verify-xyz` - [what happened]

### Assessment

[Your assessment: Confirmed / Disconfirmed / Has limitations / etc.]

[Reasoning for your assessment]

### Recommendation

[What you think should happen to this superstition]
```

### 7. Check In With Maintainer

Present your findings to the community-patterns maintainer (in the Claude session):
- Summary of the claim
- What you found
- Your recommendation

**Wait for maintainer approval before continuing to next superstition.**

### 8. Update VERIFICATION-LOG.md

Add an entry with:
- Date verified
- Brief summary of findings
- Current status

### 9. Iterate on Workflow

After each verification, consider:
- What worked well?
- What was confusing or slow?
- Should anything in this skill be updated?

## Outcomes

| Finding | Action |
|---------|--------|
| **Confirmed** | Add second vote to superstition, may promote to folk-wisdom |
| **Has limitations** | Update superstition with limitations |
| **Disconfirmed** | See deletion workflow below |
| **Now in official docs** | Promote to folk-wisdom/blessed with pointer to docs |

## Deletion Workflow (for disconfirmed superstitions)

When a superstition is disconfirmed:

1. **First commit:** Add the verification file and repro
   - This creates a record in git history of what was tested and why it was disconfirmed
   - Commit message: "Add verification for [superstition name] - disconfirmed"

2. **Second commit:** Delete all related files
   - Delete the superstition file
   - Delete the verification file
   - Delete the repro file
   - Remove entry from VERIFICATION-LOG.md
   - Commit message: "Remove disconfirmed superstition: [name]"

This keeps the verification in git history for reference while not leaving stale files in the repo.

## File Locations

- **Superstitions:** `community-docs/superstitions/*.md`
- **Verification log:** `community-docs/superstitions/VERIFICATION-LOG.md`
- **Verification files:** `community-docs/superstitions/verifications/*.md`
- **Minimal repros:** `community-docs/superstitions/repros/*.tsx`
