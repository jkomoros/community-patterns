# Blessed Knowledge ✓

Framework author approved community knowledge.

## What Makes Something "Blessed"?

An entry becomes "blessed" when:
1. It has accumulated significant confirmations (typically 5+ stars) in folk_wisdom
2. A framework author (CommonTools team member) explicitly reviews and approves it
3. It aligns with official framework design and documentation

## Blessing Process

1. **Nomination:** High-starred folk_wisdom entry is ready for review
2. **Review:** Framework author examines the entry for:
   - Technical accuracy
   - Alignment with framework design
   - Completeness and clarity
   - Appropriate scope
3. **Decision:**
   - **Approved for blessed/** - Entry moves here with blessing metadata
   - **Approved for labs/docs/** - Entry added to official documentation (preferred)
   - **Clarification needed** - Author provides corrections or context
   - **Not approved** - May remain in folk_wisdom with notes

## Blessing Metadata

Each blessed entry includes:

```markdown
**Blessed by:** @framework-author-username
**Date:** YYYY-MM-DD
**Framework version:** vX.Y.Z
**Official doc reference:** ~/Code/labs/docs/common/FILE.md (if applicable)
```

## Reliability

Blessed entries are **highly reliable** for the specified framework version. They:
- Have been verified by framework authors
- Align with official design and documentation
- Represent best practices

However, they may:
- Be version-specific (check version metadata)
- Become outdated with framework changes
- Need updates when official docs expand

## Topics

Knowledge is organized by topic:

- `patterns.md` - Pattern structure and composition
- `reactivity.md` - Cells, computed, reactive values
- `types.md` - TypeScript type issues
- `jsx.md` - JSX rendering and components
- `handlers.md` - Handler functions
- `llm.md` - LLM integration
- `deployment.md` - Deployment and tooling
- `debugging.md` - Debugging strategies

## Relationship to Official Docs

**Blessed knowledge complements official documentation:**
- May cover topics not yet in official docs
- May provide additional examples or clarification
- May document best practices or common patterns
- Should align with (not contradict) official docs

**When official docs exist:**
- Official docs are the primary source
- Blessed entries may provide additional context
- Any conflicts should be resolved in favor of official docs

## Version Compatibility

Framework evolves over time. When using blessed entries:
- Check the framework version metadata
- Verify it applies to your version
- Test in your specific context
- Report if behavior differs

## Contributing to Blessed

You cannot directly add blessed entries. The path is:
1. Create superstition (⚠️ single observation)
2. Get confirmations → promotes to folk_wisdom (⭐⭐+)
3. Accumulate more confirmations (aim for ⭐⭐⭐⭐⭐)
4. Request framework author review
5. If approved → becomes blessed (✓)

Alternatively, framework authors may directly add blessed entries based on common support questions or patterns they've observed.
