# Community Docs - Superstitions

Empirical observations discovered during pattern development that haven't yet been verified or upstreamed to official documentation.

## Important

**These are NOT official framework documentation.** Always check `~/Code/labs/docs/common/` first.

Superstitions capture single observations - things that seemed to work in a specific context but may be coincidence, misunderstanding, or context-specific.

## Superstitions (⚠️ Treat With Skepticism)

**Location:** `superstitions/`

Single observations only. May be wrong, incomplete, or context-specific.

**Reliability:** Unknown - highly suspect
**When to use:** When completely stuck and nothing else works
**Caution:** DO NOT trust without thorough verification

Each superstition has a prominent warning disclaimer at the top.

## Workflow

### When You're Stuck

**Priority order:**

1. **Check official docs first:** `~/Code/labs/docs/common/`
2. **Check superstitions:** `community-docs/superstitions/` (with extreme skepticism)

### If a Superstition Works

If you verify a superstition is correct, **upstream it to labs docs** instead of keeping it here:

1. Identify the appropriate doc in `~/Code/labs/docs/common/`
2. Add the information to that doc
3. Create a PR to labs
4. Once merged, delete the superstition

**The goal is for verified knowledge to live in official docs, not here.**

### Creating a New Superstition

**When you solve something not documented anywhere:**

1. **Search first** - make sure it's not already documented:
   ```bash
   grep -r "your topic" ~/Code/labs/docs/common/
   grep -r "your topic" community-docs/superstitions/
   ```

2. **Create file:** `superstitions/YYYY-MM-DD-topic-brief-description.md`
   - Use topic prefixes: `types-`, `reactivity-`, `jsx-`, `handlers-`, `llm-`, `patterns-`, etc.

3. **Copy template** from `superstitions/README.md`

4. **Include full ⚠️ disclaimer** at top

5. **Document:**
   - What problem you had
   - What you tried that didn't work
   - What solution seemed to work
   - Your specific context
   - Related official docs

6. **Commit:** `"Add superstition: [brief description]"`

**Remember:** You're creating a hypothesis, not stating fact!

## File Naming

**Format:** `YYYY-MM-DD-topic-brief-description.md`

**Topic prefixes:**
- `patterns-` - Pattern structure and composition
- `reactivity-` - Cells, computed, reactive values
- `types-` - TypeScript type issues
- `jsx-` - JSX rendering, components, styling
- `handlers-` - Handler functions and event handling
- `llm-` - LLM integration
- `deployment-` - Deployment, ct CLI, servers
- `debugging-` - General debugging strategies
- `framework-` - Core framework behavior

## Deprecated: blessed/ and folk_wisdom/

The `blessed/` and `folk_wisdom/` directories are **deprecated**.

Previously, we had a three-tier system where superstitions would be "promoted" to folk_wisdom after multiple confirmations, then to blessed after framework author approval.

**New model:** Verified knowledge should be upstreamed directly to `~/Code/labs/docs/common/` rather than maintained separately here. Community-patterns only holds unverified superstitions.

If you find useful content in these deprecated directories, consider upstreaming it to labs docs.

---

**Remember:** Superstitions are a safety net for edge cases, not a primary reference. When in doubt, trust official docs!
