# Superstition Verification Skill

Use this skill to systematically verify superstitions in `community-docs/superstitions/`.

## Purpose

Superstitions are observations that may be:
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

### 2. Assess Evidence Weight

**Read the superstition's metadata carefully:**

```yaml
confirmed_count: 1     # How many times confirmed?
sessions: [...]        # Which sessions encountered this?
stars: ⭐              # Rating/importance
```

**Also check for guestbook entries** - these indicate multiple people have encountered the issue.

**Evidence levels:**
- **Low evidence** (confirmed_count=1, no guestbook): Minimal repro may be sufficient
- **Medium evidence** (confirmed_count=2-3, some guestbook): Need to check original patterns
- **High evidence** (confirmed_count>3, active guestbook): High bar - must clean up original patterns and test thoroughly

**High-evidence superstitions require extra scrutiny** - if minimal repro doesn't reproduce but original patterns have workarounds, the superstition might be valid for complex cases we didn't capture.

### 3. Read and Understand

1. Read the superstition file thoroughly
2. Understand the **claim** - what behavior is being described?
3. Understand the **context** - what was the user trying to accomplish?
4. **Note the original patterns** - which patterns are mentioned in `sessions` or context?

### 4. Investigate

Use multiple techniques:

**Check official docs:**
```bash
grep -r "relevant term" ~/Code/labs/docs/common/
```

**Check framework source:**
Look for relevant code in `~/Code/labs/packages/` that might explain the behavior.

**Check if already documented:**
The behavior might now be in official docs, making the superstition redundant.

### 5. Create Minimal Repro

Create a minimal pattern that demonstrates the claimed behavior:

**File location:** `community-docs/superstitions/repros/YYYY-MM-DD-short-name.tsx`

The repro should:
- Be as minimal as possible while still demonstrating the issue
- Include comments explaining what behavior to look for
- Be deployable and runnable

### 6. Deploy and Test Minimal Repro

Deploy the repro to a test space:
```bash
cd ~/Code/labs && deno task ct charm new [path-to-repro.tsx] \
  --api-url http://localhost:8000 \
  --identity [path-to-claude.key] \
  --space claude-superstition-verify-[unique]
```

Test the actual behavior. Does it match the superstition's claim?

**Be wary of false negatives** - a minimal repro might not trigger the issue if it depends on specific conditions.

### 7. Find and Clean Up Original Patterns

**This is critical for disconfirmation!**

1. **Find the original patterns** mentioned in the superstition's `sessions` field
2. **Look for workaround code** - does the pattern use the "solution" described in the superstition?
3. **Try removing the workaround** - clean up the pattern to use the "problematic" approach
4. **Deploy and test in Playwright** - does the pattern still work correctly?

**If cleanup works:** Strong evidence the superstition is invalid
**If cleanup breaks:** The superstition might be valid for complex cases - file a bug for framework authors or tighten the superstition's scope

### 8. Create Verification File

Create `community-docs/superstitions/verifications/YYYY-MM-DD-short-name.md` using this template:

```markdown
# Verification: [Short Name]

**Superstition:** `../YYYY-MM-DD-full-filename.md`
**Last verified:** YYYY-MM-DD
**Status:** awaiting-maintainer-review
**Evidence level:** low/medium/high (confirmed_count=X, Y guestbook entries)

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
- **Deployed repro:** Space `xyz` - [what happened]

### Original Pattern Cleanup

- **Pattern:** `patterns/user/pattern-name.tsx`
- **Workaround found:** [describe the workaround code]
- **Cleanup attempted:** [what we changed]
- **Result:** [worked / broke - describe behavior]

### Assessment

[Your assessment: Confirmed / Disconfirmed / Has limitations / etc.]

[Reasoning for your assessment]

### Recommendation

[What you think should happen to this superstition]
```

### 9. Check In With Maintainer

Present your findings to the community-patterns maintainer (in the Claude session):
- Summary of the claim
- Evidence level
- What you found in minimal repro
- What you found in original pattern cleanup
- Your recommendation

**Wait for maintainer approval before continuing.**

### 10. Update VERIFICATION-LOG.md

Add an entry with:
- Date verified
- Evidence level
- Brief summary of findings
- Current status

### 11. Iterate on Workflow

After each verification, consider:
- What worked well?
- What was confusing or slow?
- Should anything in this skill be updated?

## Outcomes

| Finding | Action |
|---------|--------|
| **Confirmed** | Add second vote to superstition, may promote to folk-wisdom |
| **Has limitations** | Update superstition with narrower scope |
| **Disconfirmed (low evidence)** | See deletion workflow below |
| **Disconfirmed (high evidence)** | File bug or tighten scope - don't delete without pattern cleanup proof |
| **Now in official docs** | Promote to folk-wisdom/blessed with pointer to docs |

## Deletion Workflow (for disconfirmed superstitions)

**Only delete after:**
1. Minimal repro doesn't show the issue
2. Original pattern cleanup works (if applicable)
3. Pattern tested in Playwright after cleanup

**Commit sequence:**

1. **First commit:** Pattern cleanup (if applicable)
   - Clean up the original pattern(s) that used the workaround
   - Test thoroughly in Playwright
   - Commit message: "Clean up [pattern]: remove [superstition] workaround"

2. **Second commit:** Add verification files
   - Add verification file and repro
   - This creates a record in git history
   - Commit message: "Add verification for [superstition] - disconfirmed"

3. **Third commit:** Delete superstition and verification files
   - Delete the superstition file
   - Delete the verification file
   - Delete the repro file
   - Remove entry from VERIFICATION-LOG.md
   - Commit message: "Remove disconfirmed superstition: [name]"

This keeps the verification in git history while not leaving stale files.

## File Locations

- **Superstitions:** `community-docs/superstitions/*.md`
- **Verification log:** `community-docs/superstitions/VERIFICATION-LOG.md`
- **Verification files:** `community-docs/superstitions/verifications/*.md`
- **Minimal repros:** `community-docs/superstitions/repros/*.tsx`

## Important Notes

- **Minimal repros can have false negatives** - complex patterns may trigger issues that minimal repros don't
- **High-evidence superstitions need high-bar disconfirmation** - don't just trust minimal repro
- **Pattern cleanup is the strongest evidence** - if you can remove workarounds and patterns still work, that's proof
- **When in doubt, tighten scope rather than delete** - better to have a narrower superstition than miss a real issue
