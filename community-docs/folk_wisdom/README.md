# Folk Wisdom ⭐⭐+

Knowledge verified by multiple independent sessions/developers.

## What is Folk Wisdom?

Folk wisdom represents patterns and solutions that have been **empirically verified** by 2 or more independent people/sessions. It's knowledge that "seems to work" across different contexts.

## Important Caveats

Folk wisdom is **empirical, not authoritative:**
- We know it works, but may not fully understand why
- May be context-specific or have edge cases
- May not reflect official framework guarantees
- Could be incomplete or partially correct

**Always verify against official docs first!**

## Star Rating System

Folk wisdom entries are rated by confirmation count:

- ⭐⭐ = 2 confirmations (newly promoted from superstitions)
- ⭐⭐⭐ = 3-4 confirmations (fairly reliable)
- ⭐⭐⭐⭐ = 5-7 confirmations (quite reliable)
- ⭐⭐⭐⭐⭐ = 8+ confirmations (very reliable, candidate for blessing)

**More stars = more confirmations = higher confidence**

But remember: Even 5-star folk wisdom is still empirical!

## Guestbook System

Each folk wisdom entry includes a **guestbook** showing its confirmation history:

```markdown
**Guestbook:**
- ✅ 2025-01-15 - Initial discovery in cheeseboard pattern (session-abc)
- ✅ 2025-01-17 - Confirmed in shopping list refactor (session-def)
- ✅ 2025-01-20 - Worked for todo list pattern (session-ghi)
- ✅ 2025-01-22 - Also true for nested objects (session-jkl)
```

The guestbook helps you:
- See how many times it's been confirmed
- Understand different contexts where it worked
- Judge if your use case is similar
- Trace the evolution of the knowledge

## How to Use Folk Wisdom

### Before Using

1. **Check the star rating** - Prefer ⭐⭐⭐+ entries
2. **Read the guestbook** - See if contexts match yours
3. **Verify against official docs** - Make sure it doesn't contradict
4. **Understand the limitation** - It's empirical, not guaranteed

### When It Works

**Please add your confirmation!**

1. **Increment star count:**
   ```markdown
   ⭐⭐⭐⭐ (4 confirmations)  →  ⭐⭐⭐⭐ (5 confirmations)
   ```

2. **Add guestbook entry:**
   ```markdown
   - ✅ YYYY-MM-DD - Brief description of your use case (session-id)
   ```

3. **Commit:**
   ```
   folk_wisdom/types: +1 confirmation for Cell arrays in handlers

   Confirmed this pattern works in my hotel membership extractor.
   ```

Your confirmation helps the community understand reliability!

### When It Doesn't Work

If folk wisdom doesn't work in your context:

1. **Document the difference:**
   ```markdown
   **Known Limitations:**
   - ❌ Does not work with deeply nested Cell structures (2025-01-22)
   - ❌ Fails when items are OpaqueRef<> wrapped (2025-01-23)
   ```

2. **Note what worked instead**

3. **Don't remove stars** - just document the limitation

This helps refine the knowledge!

## Promotion Criteria

### From Superstition → Folk Wisdom

**Requires:** 2nd independent confirmation

When someone confirms a superstition:
1. Update superstition metadata
2. Move content to appropriate folk_wisdom topic file
3. Create guestbook with both confirmations
4. Set stars to ⭐⭐
5. Mark/remove superstition file

### From Folk Wisdom → Blessed

**Requires:** Framework author approval (typically after 5+ confirmations)

When folk wisdom accumulates many confirmations:
1. Request framework author review
2. If approved, moves to blessed/
3. Gets blessing metadata
4. Considered highly authoritative

## Topics

Folk wisdom is organized by topic in consolidated files:

- `patterns.md` - Pattern structure and composition
- `reactivity.md` - Cells, computed, reactive values
- `types.md` - TypeScript type issues
- `jsx.md` - JSX rendering and components
- `handlers.md` - Handler functions
- `llm.md` - LLM integration
- `deployment.md` - Deployment and tooling
- `debugging.md` - Debugging strategies

Each file contains multiple entries, sorted by star rating (highest first).

## Entry Template

```markdown
## [Title]

⭐⭐⭐ (3 confirmations)

**Brief description of the pattern or solution**

[Detailed explanation]

**Example:**
```typescript
// Code example
```

**Why this matters:**
- Explanation of implications
- Related concepts

**Related:** `~/Code/labs/docs/common/FILE.md` (if applicable)

**Guestbook:**
- ✅ YYYY-MM-DD - Context 1 (session-1)
- ✅ YYYY-MM-DD - Context 2 (session-2)
- ✅ YYYY-MM-DD - Context 3 (session-3)

**Known Limitations:**
- Edge cases or contexts where it doesn't apply

---
```

## Maintaining Folk Wisdom

### Regular Review

Periodically:
- Check for entries that should be consolidated
- Update star counts if multiple confirmations added
- Review entries when framework versions change
- Nominate high-starred entries for blessing

### When Framework Changes

- Test folk wisdom against new framework versions
- Update or deprecate entries that no longer apply
- Add version compatibility notes if needed
- Document new patterns discovered

## Quality Guidelines

Good folk wisdom entries:
- ✅ Are specific and actionable
- ✅ Include clear examples
- ✅ Reference related official docs
- ✅ Document limitations honestly
- ✅ Show confirmation history in guestbook
- ✅ Acknowledge uncertainty where appropriate

Poor folk wisdom entries:
- ❌ Are vague or overly broad
- ❌ Claim to be definitive truth
- ❌ Contradict official documentation
- ❌ Lack examples or context
- ❌ Hide limitations or edge cases
- ❌ Don't show confirmation history

## Remember

Folk wisdom is **valuable but uncertain:**
- It captures real-world patterns that work
- It's verified by multiple people
- But it's still empirical knowledge
- Official docs are always more authoritative

Use folk wisdom to solve problems, but always with understanding and verification!
