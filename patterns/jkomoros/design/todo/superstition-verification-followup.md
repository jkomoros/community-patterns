# Superstition Verification Followup

**Created:** 2025-12-03
**Context:** Berni reviewed PR #93 with framework author responses to 6 superstition questions
**Status:** COMPLETED

## Tasks

### 1. Update No-Zod Superstition
- [x] Add simpler syntax: `generateObject<Answer>({ prompt })`
- [x] Note that `toSchema<T>()` still works but is no longer required

### 2. Q1: generateObject derive vs direct Cell - RUNTIME BUG
- [x] Update superstition to mark as confirmed bug
- [x] Both patterns should work - currently broken

### 3. Q2: derive() types vs runtime - NEEDS INVESTIGATION
- [x] Added fuller repro context showing Cell definitions
- [x] Show that `flag` and `count` come from pattern input (are Cells)
- [x] Document TS magic / transformer crosstalk possibility

### 4. Q3: ifElse binding - BUG (strange one)
- [x] Added Berni's narrowing pattern suggestion to superstition
- [ ] TODO: Test if pulling UI out of ifElse changes behavior (future work)

### 5. Q5: Handler return values - INTENTIONAL
- [x] Created new superstition: `2025-12-03-use-patternTool-for-pure-computation.md`
- [x] Updated existing superstition to note this is intentional design
- [x] Documented: handlers = side effects, patterns = pure computation

### 6. Q6: Pre-populated defaults - BUG
- [x] Marked as confirmed default propagation bug
- [x] Noted Robin's fix may address this

---

## Progress Log

### 2025-12-03

**Completed all tasks from Berni's PR #93 feedback**

Files updated:
- `2025-12-02-no-zod-use-toschema.md` - Added simpler generateObject<T>() syntax
- `2025-11-25-generateObject-race-condition-pass-cell-directly.md` - Marked as confirmed runtime bug
- `2025-11-29-llm-derive-for-template-string-prompts.md` - Marked as confirmed runtime bug
- `2025-11-22-derive-object-parameter-cell-unwrapping.md` - Added repro context, needs investigation
- `2025-11-30-ifelse-input-binding.md` - Marked as confirmed bug with narrowing test
- `2025-11-27-llm-handler-tools-must-write-to-result-cell.md` - Marked as intentional design
- `2025-11-29-generateObject-empty-array-handler-pattern.md` - Marked as default propagation bug

New files:
- `2025-12-03-use-patternTool-for-pure-computation.md` - New superstition about patternTool

## Summary of Berni's Responses

| Question | Berni's Response | Status |
|----------|------------------|--------|
| No-Zod | Correct + simpler syntax now available | Updated |
| Q1: derive vs direct Cell | RUNTIME BUG | Marked |
| Q2: types vs runtime | NEEDS INVESTIGATION | Context added |
| Q3: ifElse binding | STRANGE BUG | Marked with test |
| Q5: handler return | INTENTIONAL (use patternTool) | New superstition |
| Q6: pre-populated defaults | DEFAULT PROPAGATION BUG | Marked |
