# Superstition Verification Skill

Use this skill to systematically verify superstitions in `community-docs/superstitions/`.

## Purpose

Superstitions are observations that may be:
- **No longer relevant** (framework fixed it)
- **Has limitations** (partially correct)
- **Actually confirmed** (should be promoted)

This workflow tests each superstition and creates documentation for framework author review.

## CRITICAL: Pattern Cleanup is Required for Disconfirmation

> **⚠️ NEVER disconfirm a superstition based solely on a minimal repro!**
>
> Minimal repros can give **false negatives** due to:
> - Different type signatures (e.g., auto-unwrapping vs explicit `Cell<>`)
> - Missing complexity that triggers the real issue
> - Different runtime conditions
>
> **The ONLY way to disconfirm a superstition is to:**
> 1. Find the original pattern(s) that use the workaround
> 2. Remove the workaround code
> 3. Test the cleaned pattern in Playwright
> 4. Verify it still works correctly
>
> If you can't find original patterns or can't test the cleanup, you **cannot disconfirm** - at best you can note "unable to verify" in the log.

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

### 7. Find and Clean Up Original Patterns (REQUIRED FOR DISCONFIRMATION)

> **⚠️ This step is MANDATORY before disconfirming any superstition.**
>
> A minimal repro that "works" is NOT sufficient evidence. You MUST verify
> that the original patterns work without their workarounds.

**Steps:**

1. **Find the original patterns** mentioned in the superstition's `sessions` field
2. **Look for workaround code** - does the pattern use the "solution" described in the superstition?
3. **Try removing the workaround** - clean up the pattern to use the "problematic" approach
4. **Deploy and test in Playwright** - does the pattern still work correctly?

**Outcomes:**

| Cleanup Result | Conclusion |
|----------------|------------|
| **Cleanup works** | Strong evidence superstition is invalid - proceed to disconfirm |
| **Cleanup breaks** | Superstition is VALID - do not disconfirm! Tighten scope or confirm |
| **No patterns found** | Cannot disconfirm - mark as "unable to verify" |

**Real Example (2025-12-02):**

The superstition "cannot map computed arrays in JSX" had a minimal repro that appeared to work. However, when we tried to remove the workaround from `reward-spinner.tsx`:
- Cleanup **failed** with `mapWithPattern is not a function`
- The minimal repro worked because it used auto-unwrapping input types
- The real pattern with explicit `Cell<>` types triggered the actual bug
- **Result:** Superstition was CONFIRMED, not disconfirmed

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
| **Confirmed** | Upstream to labs docs, then delete superstition |
| **Has limitations** | Update superstition with narrower scope |
| **Disconfirmed (low evidence)** | See deletion workflow below |
| **Disconfirmed (high evidence)** | File bug or tighten scope - don't delete without pattern cleanup proof |
| **Now in official docs** | Delete superstition (already documented) |

## Deletion Workflow (for disconfirmed superstitions)

> **⚠️ STOP: Have you completed pattern cleanup?**
>
> If the answer is "no" or "patterns not found", you CANNOT delete the superstition.
> A minimal repro that works is NOT sufficient for deletion.

**Prerequisites for deletion (ALL must be true):**
1. ✅ Minimal repro doesn't show the issue
2. ✅ Original pattern(s) found in `sessions` field
3. ✅ Workaround code removed from original pattern(s)
4. ✅ Cleaned pattern deployed and tested in Playwright
5. ✅ Pattern works correctly WITHOUT the workaround

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

## Branch and PR Workflow

Some verifications need framework author review; others are clear-cut and can auto-land. To avoid overwhelming the framework author with noise:

### During Verification: Single Branch

Work on a single branch (e.g., `superstition-verification-workflow`). For each verification, use commit messages that indicate the outcome:

**Auto-land commits** (no framework review needed):
- `Remove disconfirmed superstition: [name]` - pattern cleanup proved it invalid
- `Confirm superstition: [name]` - confirmed with clear evidence, just documenting
- `Update superstition scope: [name]` - narrowed based on investigation

**Needs-review commits** (framework author input required):
- `Add verification for [name] - needs framework review` - unclear if bug or intentional
- `Confirm superstition: [name] - needs framework review` - confirmed but is it a bug?

### At PR Time: Split Into Two PRs

When ready to create PRs, split the branch:

```bash
# Create auto-land branch from main
git checkout main
git checkout -b superstition-auto-land

# Cherry-pick only auto-land commits
git cherry-pick <commit1> <commit2> ...

# Create and merge PR immediately (or after quick maintainer review)
```

```bash
# Create review branch from main
git checkout main
git checkout -b superstition-needs-review

# Cherry-pick only needs-review commits
git cherry-pick <commit3> <commit4> ...

# Create PR and tag framework author for review
```

### PR Templates

**Auto-land PR:**
```markdown
## Superstition Verifications (Auto-land)

These verifications have clear outcomes and don't need framework author review.

### Changes
- [x] Removed: `superstition-name` - disconfirmed via pattern cleanup
- [x] Confirmed: `superstition-name` - documented limitation
...
```

**Needs-review PR:**
```markdown
## Superstition Verifications (Needs Framework Review)

@framework-author - These verifications need your input. Please check each
verification file and respond to the "Framework Author Review" section.

### Awaiting Review
- [ ] `verifications/YYYY-MM-DD-name.md` - Is this behavior intentional?
- [ ] `verifications/YYYY-MM-DD-other.md` - Bug or working as designed?
...
```

## File Locations

- **Superstitions:** `community-docs/superstitions/*.md`
- **Verification log:** `community-docs/superstitions/VERIFICATION-LOG.md`
- **Verification files:** `community-docs/superstitions/verifications/*.md`
- **Minimal repros:** `community-docs/superstitions/repros/*.tsx`

## Important Notes

- **Minimal repros WILL give false negatives** - this is not theoretical, we've seen it happen. Complex patterns trigger issues that minimal repros don't due to type differences, runtime conditions, and missing complexity.
- **Pattern cleanup is the ONLY valid evidence for disconfirmation** - if you can remove workarounds and patterns still work after Playwright testing, that's proof. Anything less is insufficient.
- **High-evidence superstitions need high-bar disconfirmation** - multiple confirmations and guestbook entries mean real developers hit this issue. Don't dismiss based on a minimal repro.
- **When in doubt, tighten scope rather than delete** - better to have a narrower superstition than miss a real issue.
- **If cleanup breaks, the superstition is VALID** - even if minimal repro worked. Trust the real-world evidence over synthetic tests.
