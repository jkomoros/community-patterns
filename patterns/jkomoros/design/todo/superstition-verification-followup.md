# Superstition Verification Followup

**Created:** 2025-12-03
**Context:** Berni reviewed PR #93 with framework author responses to 6 superstition questions

## Tasks

### 1. Update No-Zod Superstition
- [ ] Add simpler syntax: `generateObject<Answer>({ prompt })`
- [ ] Note that `toSchema<T>()` still works but is no longer required

### 2. Q1: generateObject derive vs direct Cell - RUNTIME BUG
- [ ] Update superstition to mark as confirmed bug
- [ ] Both patterns should work - currently broken
- [ ] Consider filing issue in labs repo

### 3. Q2: derive() types vs runtime - NEEDS INVESTIGATION
- [ ] Create fuller repro showing Cell definitions
- [ ] Show that `flag` and `count` come from pattern input (are Cells)
- [ ] Document TS magic / transformer crosstalk possibility

### 4. Q3: ifElse binding - BUG (strange one)
- [ ] Create repro with Berni's narrowing pattern:
  ```tsx
  const inputUI = (<div><ct-input $value={inputValue} />...</div>);
  return { [UI]: (<div>{ifElse(showInput, inputUI, <div>Hidden</div>}</div>) }
  ```
- [ ] Test if pulling UI out of ifElse changes behavior
- [ ] Report results back

### 5. Q5: Handler return values - INTENTIONAL
- [ ] Create new superstition: "Use patternTool for pure computation"
- [ ] Update existing superstition to note this is intentional
- [ ] Document: handlers = side effects, patterns = pure computation

### 6. Q6: Pre-populated defaults - BUG
- [ ] Mark as confirmed default propagation bug
- [ ] Note: Robin's fix may address this
- [ ] Track progress

---

## Progress Log

### 2025-12-03

**Starting work on Berni's feedback from PR #93**

