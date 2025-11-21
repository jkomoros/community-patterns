# Patterns - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/PATTERNS.md`

---

## Navigation URL Format

**CRITICAL**: When navigating to deployed patterns in the browser, you MUST use the correct URL format:

✅ **CORRECT**: `http://localhost:8000/SPACE-NAME/CHARM-ID`
❌ **WRONG**: `http://localhost:8000/CHARM-ID` (missing space name)

**What happens when you use the wrong format:**
- Browser shows a `DefaultCharmList` interface instead of your pattern's UI
- Pattern code is actually running correctly, but you're looking at the wrong view

**Special case - common-knowledge space:**
- `common-knowledge` is the default/shared space and behaves differently than custom spaces
- For testing your own patterns, create a custom space name instead
- Example: `--space brain-dump-test`

**Complete workflow:**
```bash
# Deploy to a custom space
cd ~/Code/labs
deno task ct charm new \
  --api-url http://localhost:8000 \
  --identity ../community-patterns-2/claude.key \
  --space my-custom-space \
  ../community-patterns-2/patterns/USERNAME/pattern.tsx

# Output will be: baedreiabc123...

# Navigate to:
http://localhost:8000/my-custom-space/baedreiabc123...
# NOT: http://localhost:8000/baedreiabc123...
```

**Verified:** 2025-11-21 by jkomoros
