# PRD: Import/Review Flow Meta-Pattern

**Status:** Draft
**Created:** 2024-12-16
**Author:** Research synthesis from existing implementations

---

## Executive Summary

Three patterns in this codebase (`person.tsx`, `food-recipe.tsx`, `store-mapper.tsx`) share a common flow: user provides unstructured input → LLM extracts structured data → user reviews in a modal/UI → user accepts/rejects changes. Each implementation contains 200-400 lines of duplicated boilerplate that is finicky to get right due to framework reactivity constraints.

This PRD defines what an ideal, elegant import/review pattern would look like, establishing requirements for potential future abstractions.

---

## 1. Vision

**What would an ideal import/review pattern enable?**

A pattern author should be able to add LLM-powered data extraction to their pattern with:
- **Minimal boilerplate** (< 50 lines of code)
- **No performance pitfalls** (no reactive storms, no handler scope bugs)
- **Consistent UX** (familiar review flows across all patterns)
- **Type safety** (schema validation, compile-time errors)
- **Flexible enough** to handle different extraction strategies (field diff, per-item selection, nested merge)

A pattern user should experience:
- **Predictable behavior** (same review flow everywhere)
- **Fine-grained control** (choose which changes to accept)
- **Clear feedback** (diff visualization, conflict resolution)
- **Forgiving workflow** (undo, retry, cancel)
- **Fast performance** (no lag on large datasets)

---

## 2. Use Cases

### 2.1 Simple Field Extraction (person.tsx pattern)

**Scenario:** User pastes unstructured notes about a person into a notes field. They click "Extract Data from Notes" and the LLM parses out structured fields.

**Current flow:**
1. User types/pastes notes: "Met Alex at conference. Email: alex@example.com, works at Anthropic, they/them"
2. User clicks "Extract Data from Notes"
3. Modal shows diff preview:
   - Display Name: "(empty)" → "Alex"
   - Email: "(empty)" → "alex@example.com"
   - Pronouns: "(empty)" → "they/them"
   - Notes: [word-level diff showing what was extracted vs remaining]
4. User clicks "Accept Changes"
5. Fields populate, modal closes

**Key characteristics:**
- Single extraction pass
- Field-level granularity
- All-or-nothing acceptance (current limitation)
- Word-level diff for notes field

**Desired improvements:**
- Per-field checkboxes (accept email but not pronouns)
- In-place editing during review (fix typos before accepting)
- Undo after acceptance

### 2.2 List Extraction with Merge (store-mapper.tsx pattern)

**Scenario:** User uploads photos of grocery store aisle signs. LLM extracts aisle numbers and product lists. User merges extracted data with existing aisles.

**Current flow:**
1. User uploads 5 photos of store aisles
2. Each photo analyzed in parallel → 15 aisles extracted total
3. UI shows per-photo sections:
   - Photo 1: "IMG_1234.jpg"
     - **Aisle 5 - Coffee, Tea** (NEW)
       [+ Add] button
     - **Aisle 6 - Cereal** (EXISTS: "Aisle 6 - Cereal, Granola")
       Products to add: (none new)
     - **Aisle 7 - Snacks** (EXISTS: "Aisle 7 - Chips")
       Products to add:
       ☑ Cookies
       ☑ Crackers
       ☐ Chips (duplicate, unchecked by default)
       [Merge Selected into Aisle 7] button
4. User clicks "Add All 3 New Aisles from All Photos" (batch action)
5. User manually reviews conflicts, selects items to merge, clicks merge buttons
6. Photos disappear after all merges complete

**Key characteristics:**
- Multi-item extraction (15 aisles across 5 photos)
- Per-item granularity (checkboxes for each product)
- Fuzzy matching (detects duplicates like "Chips" vs "chips")
- Incremental workflow (batch add new, then resolve conflicts)
- Multi-source input (multiple photos)

**Desired improvements:**
- Better conflict visualization (highlight fuzzy matches)
- Bulk merge actions ("Merge All Conflicts" button)
- Persistent selection state across page refreshes

### 2.3 Complex Nested Extraction (food-recipe.tsx pattern)

**Scenario:** User pastes a recipe from a website or uploads a recipe photo. LLM extracts nested structure: metadata, ingredients (arrays), step groups (nested arrays with timing metadata).

**Current flow:**
1. User uploads photo of recipe card OR pastes recipe text into notes
2. If photo: LLM extracts text first → "Apply to Notes" → text appears in notes field
3. User clicks "Extract Recipe Data"
4. Modal shows diff preview:
   - Recipe Name: "(empty)" → "Chocolate Chip Cookies"
   - Servings: "4" → "12"
   - Notes: [word-level diff]
   - "✓ 8 ingredient(s) will be added" (collapsed preview)
   - "✓ 3 step group(s) will be added:" (expanded with nested structure)
5. User clicks "Apply"
6. Fields populate, ingredients array populated, step groups array populated

**Key characteristics:**
- Two-stage extraction (photo OCR → structured extraction)
- Nested data structures (arrays of objects with arrays)
- Mixed granularity (field diffs + append-only arrays)
- All-or-nothing acceptance (current limitation)

**Desired improvements:**
- Per-ingredient selection before adding
- Edit ingredients during review (fix quantities)
- Per-field acceptance (accept name but not servings)
- Better preview of nested structures (collapsible sections)

### 2.4 Multi-Source Extraction (future pattern)

**Scenario:** User wants to create a business contact record by combining data from LinkedIn profile (URL), business card photo, and meeting notes.

**Desired flow:**
1. User provides three inputs simultaneously:
   - LinkedIn URL: https://linkedin.com/in/username
   - Business card photo: IMG_5678.jpg
   - Meeting notes: "Met at WebSummit 2024, interested in AI patterns"
2. User clicks "Extract Contact Info"
3. LLM analyzes all three sources, merges information
4. Modal shows unified diff with source attribution:
   - Name: "(empty)" → "Jane Smith" [from: photo]
   - Title: "(empty)" → "VP of Engineering" [from: LinkedIn]
   - Company: "(empty)" → "Acme Corp" [from: LinkedIn, photo]
   - Met At: "(empty)" → "WebSummit 2024" [from: notes]
   - Interests: "(empty)" → "AI patterns" [from: notes]
5. User accepts changes

**Key characteristics:**
- Multiple input types (URL, image, text)
- Source attribution (know where each field came from)
- Conflict resolution (if sources disagree)
- Cross-source validation (LinkedIn confirms photo text)

### 2.5 Incremental Extraction (future pattern)

**Scenario:** User has an existing recipe and wants to add more ingredients from a second recipe photo without overwriting existing data.

**Desired flow:**
1. Recipe already has 5 ingredients
2. User uploads photo of ingredient list (8 ingredients)
3. LLM extracts 8 ingredients
4. Modal shows:
   - "3 ingredients already exist (marked as duplicates)"
   - "5 new ingredients to add:"
     ☑ Vanilla extract
     ☑ Baking powder
     ☑ Salt
     ☑ Butter
     ☑ Eggs
5. User unchecks "Salt" (already have it)
6. User clicks "Add Selected Ingredients"
7. 4 new ingredients added to existing 5 (total: 9)

**Key characteristics:**
- Append-only extraction (don't replace existing)
- Fuzzy duplicate detection
- Per-item selection
- Incremental workflow (build up data over time)

---

## 3. User Stories

### As a Pattern Author

**Core functionality:**
- [ ] I want to add LLM extraction to my pattern with < 50 lines of code
- [ ] I want to specify extraction schema using JSON Schema or TypeScript types
- [ ] I want to avoid reactive storms (only extract when I explicitly trigger it)
- [ ] I want to avoid handler scope bugs (no opaque ref issues)
- [ ] I want extraction to work with text input, image input, or both
- [ ] I want to specify how extracted data maps to my pattern's cells

**UX customization:**
- [ ] I want to choose between "all-or-nothing", "per-field", or "per-item" review modes
- [ ] I want to provide custom diff rendering for complex fields (e.g., markdown word diff)
- [ ] I want to define custom merge strategies (append, replace, smart merge)
- [ ] I want to add custom validation before acceptance (e.g., "email must be valid")
- [ ] I want to customize modal appearance (title, labels, colors)

**Performance:**
- [ ] I want extraction to cache results (don't re-extract on every keystroke)
- [ ] I want extraction to work efficiently on large datasets (50+ items)
- [ ] I want extraction to avoid blocking the UI during analysis

**Debugging:**
- [ ] I want clear error messages if extraction fails
- [ ] I want to see LLM prompt and response for debugging
- [ ] I want to retry extraction with a different prompt

### As an End User

**Input flexibility:**
- [ ] I want to paste unstructured text and have it parsed
- [ ] I want to upload images and have them analyzed
- [ ] I want to upload multiple images and have them batch-processed
- [ ] I want to combine multiple input sources (text + image)

**Review control:**
- [ ] I want to see exactly what will change before accepting
- [ ] I want to accept some changes and reject others (per-field or per-item)
- [ ] I want to edit extracted data during review (fix typos, adjust values)
- [ ] I want to see diff visualization (what's new, what's changed, what's duplicate)
- [ ] I want clear indicators for conflicts/duplicates

**Error recovery:**
- [ ] I want to cancel extraction and try again with different input
- [ ] I want to undo acceptance if I made a mistake
- [ ] I want clear error messages if extraction fails (with retry option)
- [ ] I want to manually add items if LLM misses them

**Performance feedback:**
- [ ] I want to see progress indicators during extraction ("Analyzing 3/5 photos...")
- [ ] I want to see elapsed time for long extractions
- [ ] I want extraction to feel fast (< 3s for simple text, < 10s for images)

**Consistency:**
- [ ] I want the same review flow across all patterns (familiar UX)
- [ ] I want the same keyboard shortcuts (Esc to cancel, Enter to accept)
- [ ] I want the same color semantics (green=new, yellow=conflict, red=removed)

---

## 4. Requirements

### 4.1 Must Have (Core Functionality)

**Extraction:**
- ✅ **Triggered extraction** - Only run LLM when user clicks button (never on keystroke)
- ✅ **Text input** - Extract from plain text / markdown
- ✅ **Image input** - Extract from images (photos, screenshots)
- ✅ **Schema-based** - Define extraction schema using JSON Schema
- ✅ **Framework-safe** - Use trigger pattern (Cell with timestamp) to avoid reactive storms
- ✅ **Caching** - Framework automatically caches results (don't re-extract same input)

**Review UI:**
- ✅ **Modal overlay** - Full-screen modal with backdrop to focus attention
- ✅ **Diff display** - Show before/after for each field
- ✅ **Accept/Cancel actions** - Two buttons: Accept (commits changes) and Cancel (discards)
- ✅ **Loading state** - Show spinner + elapsed time during extraction
- ✅ **Empty state** - Clear message if no changes detected ("No new data extracted")

**Data handling:**
- ✅ **Field mapping** - Map extracted fields to pattern cells
- ✅ **Type coercion** - Convert types safely (string → number, string → date, etc.)
- ✅ **Null handling** - Skip empty/null fields during extraction
- ✅ **Clear after accept** - Reset extraction state after committing changes

### 4.2 Should Have (Important UX)

**Review UI:**
- ⚠️ **Per-field selection** - Checkboxes to accept individual fields (NOT implemented in person.tsx)
- ⚠️ **In-place editing** - Edit extracted values during review (NOT implemented)
- ⚠️ **Word-level diff** - Show word-by-word changes for long text fields (implemented in person/recipe)
- ⚠️ **Conflict highlighting** - Visual indicators for duplicates/conflicts (implemented in store-mapper)
- ⚠️ **Keyboard shortcuts** - Esc to cancel, Enter to accept (NOT implemented)

**Error handling:**
- ⚠️ **Timeout handling** - Show error + retry button if extraction takes > 30s (NOT implemented)
- ⚠️ **LLM failure** - Show error message + retry button if LLM call fails (NOT implemented)
- ⚠️ **Partial extraction** - Allow accepting partial results if some fields fail (NOT implemented)
- ⚠️ **Validation errors** - Show which fields failed validation before acceptance (NOT implemented)

**Feedback:**
- ⚠️ **Success toast** - "5 fields updated" notification after acceptance (NOT implemented)
- ⚠️ **Undo capability** - 5-second toast with "Undo" button after acceptance (NOT implemented)
- ⚠️ **Progress tracking** - "Processing 3 of 5 photos..." for batch operations (NOT implemented)

**Merge strategies:**
- ⚠️ **Fuzzy matching** - Detect duplicates with typos/case differences (implemented in store-mapper)
- ⚠️ **Smart merge** - Combine arrays without duplicates (implemented in store-mapper)
- ⚠️ **Per-item checkboxes** - Select which items to merge (implemented in store-mapper)

### 4.3 Could Have (Nice to Have)

**Advanced features:**
- ❌ **Multi-source extraction** - Combine multiple inputs (text + image + URL)
- ❌ **Source attribution** - Tag each field with where it came from
- ❌ **Confidence scores** - Show LLM confidence for each extraction
- ❌ **Suggested corrections** - Highlight suspicious extractions for review
- ❌ **History tracking** - Show previous extraction results
- ❌ **Export/import** - Save extraction results as JSON for later reuse

**Customization:**
- ❌ **Custom validators** - Pattern-specific validation logic
- ❌ **Custom diff renderers** - Pattern-specific diff visualization
- ❌ **Custom merge logic** - Pattern-specific conflict resolution
- ❌ **Theming** - Customize colors, fonts, spacing

**Performance:**
- ❌ **Streaming results** - Show partial results as they arrive
- ❌ **Background processing** - Extract in background while user continues working
- ❌ **Incremental extraction** - Re-extract only changed portions

---

## 5. Non-Goals

**What this should NOT try to do:**

❌ **Agent loops** - This is NOT for multi-step autonomous LLM agents (see gmail agent patterns for that)

❌ **Auto-save** - This is NOT for automatic background extraction (always requires user review)

❌ **Cross-pattern extraction** - This is NOT for extracting data from one pattern into another (use pattern tools for that)

❌ **File parsing** - This is NOT for parsing PDFs, Word docs, Excel files (focus on text + images only)

❌ **Web scraping** - This is NOT for fetching data from URLs (use separate tools for that)

❌ **Real-time collaboration** - This is NOT for multi-user simultaneous extraction (single-user workflow)

❌ **Version control** - This is NOT for tracking changes over time (patterns handle their own persistence)

❌ **Data validation** - This is NOT for enforcing business rules (patterns handle their own validation)

---

## 6. Success Criteria

**How do we know we succeeded?**

### Quantitative Metrics

**Code reduction:**
- ✅ Pattern author writes < 50 lines for basic extraction (vs ~200-400 lines today)
- ✅ No duplicated code across 3+ patterns implementing this flow

**Performance:**
- ✅ Text extraction completes in < 3 seconds (p95)
- ✅ Image extraction completes in < 10 seconds (p95)
- ✅ UI remains responsive during extraction (no freezing)
- ✅ Supports 50+ items without lag (store-mapper with 50 photos)

**Correctness:**
- ✅ No reactive storms (extraction only runs when triggered)
- ✅ No ReadOnlyAddressError (proper Cell mutation in handlers)
- ✅ No opaque ref bugs (no .map() callbacks over reactive data)

### Qualitative Metrics

**Developer experience:**
- ✅ Pattern author can implement extraction without reading framework docs
- ✅ Pattern author can customize review UI without touching framework internals
- ✅ New contributor can understand code in < 15 minutes (clear structure)
- ✅ Error messages are actionable ("Expected Cell<string>, got string")

**User experience:**
- ✅ User understands what will happen before accepting (clear preview)
- ✅ User can recover from mistakes (undo, cancel, retry)
- ✅ User feels in control (checkboxes, editing, validation)
- ✅ User gets clear feedback (success toast, error messages, progress)

**Consistency:**
- ✅ Same review flow across person.tsx, food-recipe.tsx, store-mapper.tsx
- ✅ Same keyboard shortcuts, color semantics, button placement
- ✅ Same error handling, loading states, empty states

### Acceptance Tests

**Basic extraction flow:**
1. User pastes text → clicks "Extract" → sees diff modal → clicks "Accept" → fields populate ✅

**Per-field selection:**
1. User pastes text → clicks "Extract" → sees diff modal with checkboxes
2. User unchecks "Email" field → clicks "Accept"
3. All fields except Email populate ⚠️ (NOT in person.tsx)

**Error recovery:**
1. User pastes text → clicks "Extract" → LLM times out → sees error + retry button
2. User clicks "Retry" → extraction succeeds → sees diff modal ⚠️ (NOT implemented)

**Undo workflow:**
1. User accepts extraction → sees "5 fields updated" toast with "Undo" button
2. User clicks "Undo" within 5 seconds → fields revert to previous state ⚠️ (NOT implemented)

**Merge conflict resolution:**
1. User uploads photo with 5 aisles (2 new, 3 exist with overlapping products)
2. User sees "Add All 2 New Aisles" button and 3 conflict sections with checkboxes
3. User selects items to merge, clicks "Merge Selected into Aisle X"
4. Products merge without duplicates ✅ (in store-mapper.tsx)

---

## 7. Design Constraints

### Framework Limitations

**generateObject constraints:**
- ✅ **Pattern body only** - Cannot call generateObject in handlers or computed()
- ✅ **Automatic caching** - Framework caches by prompt content hash
- ✅ **Reactive by default** - Prompt cell changes → re-extraction (must use trigger pattern)

**Cell mutation constraints:**
- ✅ **Handlers only** - Can only call .set() in handlers, not computed() or derive()
- ✅ **No derive mutation** - derive() creates read-only cells (cannot mutate target)
- ✅ **No opaque ref callbacks** - Cannot pass .map() items to arbitrary functions

**Rendering constraints:**
- ✅ **No ternaries** - Use ifElse() for conditional element rendering
- ✅ **No .map() in JSX** - Use computed() to pre-compute JSX arrays
- ✅ **No opaque ref access** - Cannot access cell methods (get/set) inside .map() callbacks

### Performance Constraints

**Store-mapper scale limits (50 photos):**
- ⚠️ Initial render: ~200ms (acceptable but noticeable)
- ⚠️ Adding one aisle: ~50-100ms lag (from triple recomputation)
- ⚠️ Memory: ~250MB for photo data (browser-dependent)

**Known performance issues:**
- ⚠️ Duplicate computed() work (store-mapper lines 792-865)
- ⚠️ analyzeOverlap() in render loop (store-mapper line 2872)
- ⚠️ Photo memory leak (hidden photos stay in array indefinitely)

### Browser Compatibility

- ✅ Must work in Chrome, Safari, Firefox (latest 2 versions)
- ✅ Must work on mobile (responsive modal, touch targets)
- ✅ Must handle large images (resize/compress before sending to LLM)
- ⚠️ Mobile issues: person.tsx modal fixed at 600px (overflows on phones)

---

## 8. Architecture Principles

### Core Design Decisions (from research)

**Cells-only architecture** (no Streams for single-charm import/review):
```
User Input → Trigger Cell → generateObject() → Result Cell → Review UI → Target Cell
                                                  ↓
                                          Selection State Cell
```

**Key components:**
1. **Trigger Cell** (`Cell.of<string>("")`) - Snapshot of input with timestamp
2. **Result** - Reactive output from `generateObject()` (pending/result/error)
3. **Selection State Cell** - Tracks user selections during review
4. **Target Cell** - Final destination for accepted changes

**When to use Streams:**
- Cross-charm communication (NOT needed for single-charm flow)
- Optional event callbacks (onAccept, onCancel for parent patterns)
- Signal pattern for cross-pattern coordination (NOT needed for this flow)

### Pattern Implementation Levels

**Level 1: Utility functions** (minimal abstraction)
```typescript
// Already implemented in diff-utils.ts:
- computeWordDiff() - Word-level diff algorithm
- compareFields() - Generic field comparison for building change lists

// Proposed additions:
- triggerExtraction(content: string, cell: Cell<string>): void
- analyzeItemOverlap<T>(...): { newItems, overlapping, conflicts }
- createSelectionManager<T>(...): { selectedKeys, toggle, selectAll, selectNone }
```

**Level 2: Composable sub-patterns** (optional, if abstraction proves useful)
```typescript
// ImportSource pattern - handles text input + file upload + trigger
// ReviewPanel pattern - displays pending/result with selection UI
```

**Level 3: Factory function** (maximum abstraction, NOT recommended)
```typescript
// createImportReviewFlow({ schema, reviewMode, targetCell })
// Too rigid, doesn't handle pattern-specific variations
```

### Recommended Approach (from agent critique)

**Phase 1: Fix Critical Issues (Do First)**
1. Fix duplicate computed() in store-mapper.tsx
2. Move analyzeOverlap() out of render loop
3. Add per-field selection to person.tsx (UX)
4. Add undo capability to both patterns (UX)

**Phase 2: Minimal Utility Additions**
1. Add `triggerExtraction()` helper (5 lines)
2. Enhance diff-utils.ts JSDoc with full pattern documentation
3. Document pitfalls: opaque refs, generateObject location, render callbacks

**Phase 3: Skip (YAGNI)**
- Skip pattern abstractions
- Skip component libraries
- Skip factory functions

**Reconsider Abstraction When:**
- 5+ patterns use the flow
- Bug required fixing in 3+ places
- Pattern-specific logic converges

---

## 9. Implementation Priorities

### High Priority (Address Now)

| Task | Effort | Impact | Rationale |
|------|--------|--------|-----------|
| Fix error handling (infinite spinner on failure) | 1h | HIGH | User can't recover from failures |
| Fix duplicate computed() in store-mapper.tsx | 30m | MEDIUM | 50% reduction in conflict-checking |
| Move analyzeOverlap() out of render loop | 30m | MEDIUM | Prevents 225K ops on 50 photos |
| Add per-field selection to person.tsx | 2h | HIGH | Users want granular control |

### Medium Priority (Nice to Have)

| Task | Effort | Impact | Rationale |
|------|--------|--------|-----------|
| Add `triggerExtraction()` helper to diff-utils.ts | 15m | LOW | Reduces boilerplate by 5 lines |
| Document trigger pattern with JSDoc | 1h | MEDIUM | Helps future pattern authors |
| Add undo capability | 2h | HIGH | Error recovery is important |
| Fix mobile modal overflow | 1h | MEDIUM | Accessibility on phones |

### Low Priority (Future)

| Task | Effort | Impact | Rationale |
|------|--------|--------|-----------|
| Pattern abstractions | 4-8h | UNKNOWN | Wait for 5+ patterns using flow |
| Component library | 4-8h | LOW | Premature abstraction |
| Factory functions | 8-16h | LOW | Too rigid, not flexible enough |

---

## 10. Open Questions

### UX Questions

**Q1: Should review modal be always-on-top with backdrop?**
- Current: Modal covers entire screen with semi-transparent backdrop
- Alternative: Inline review panel below input field
- Decision: Keep modal for focus, but make it dismissible with Esc key

**Q2: How to handle LLM failures gracefully?**
- Current: Infinite spinner (user has no way to recover)
- Proposed: 30s timeout → error toast + retry button
- Decision: Implement timeout + retry (High Priority)

**Q3: Should undo be automatic or manual?**
- Option A: Auto-undo after 5 seconds (toast with "Undo" button)
- Option B: Manual undo via Edit menu or Ctrl+Z
- Decision: Toast with undo button (familiar pattern from Gmail, Google Docs)

### Technical Questions

**Q4: Should review modal be extracted as a reusable pattern?**
- Pro: Maximum code reuse across person.tsx, food-recipe.tsx, store-mapper.tsx
- Con: Pattern composition complexity, handler streams, Signal pattern overhead
- Decision: Wait until 5+ patterns need it (YAGNI)

**Q5: How to handle different merge strategies?**
- Field-level replace (person.tsx: displayName replaces existing)
- Array merge (store-mapper.tsx: combine products without duplicates)
- Nested object merge (food-recipe.tsx: merge step groups with timing metadata)
- Decision: No unified strategy yet, keep pattern-specific logic

**Q6: Should selection state be per-pattern or composable?**
- Current: Per-pattern Cell (`selectedMergeItems` in store-mapper.tsx)
- Alternative: Shared utility that manages the cell
- Decision: Keep per-pattern for now, extract if pattern emerges

**Q7: Image vs text extraction - unified or separate?**
- Text: Simple string prompt
- Image: Array with image data + text prompt
- Decision: Keep separate for now (different schemas, different UX)

---

## 11. Related Work

### Similar Patterns in This Codebase

**Gmail agent patterns** (e.g., `hotel-membership-gmail-agent.tsx`):
- **Different architecture:** Agent loop with listTool() auto-save
- **Different use case:** Multi-step autonomous LLM vs single-shot extraction + review
- **Different state management:** Signal pattern for cross-charm coordination
- **Key difference:** No user review step (append-only data model)

**Shopping list pattern** (`shopping-list-launcher.tsx`):
- Uses import/review flow for adding items to list
- Similar to store-mapper.tsx (per-item checkboxes)
- Could benefit from shared utilities

### Patterns NOT Using This Flow

- **Backlinks** (`backlinks-index.tsx`) - No LLM extraction
- **Journal** (`journal-entry.tsx`) - No LLM extraction
- **Task list** (`task-manager.tsx`) - No LLM extraction

---

## 12. Success Indicators

**After 3 months:**
- [ ] No new bug reports related to extraction flow
- [ ] 2+ new patterns implemented using this flow
- [ ] Pattern authors report < 1 hour to add extraction (down from 4-8 hours)
- [ ] Users report 4.5+ / 5.0 satisfaction with review UX

**After 6 months:**
- [ ] 5+ patterns using this flow (triggers abstraction discussion)
- [ ] Zero performance complaints on 50+ item extractions
- [ ] Community docs have 10+ entries about extraction patterns

---

## 13. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Framework changes break extraction pattern | MEDIUM | HIGH | Document framework constraints, add tests |
| Pattern-specific variations prevent abstraction | HIGH | MEDIUM | Accept YAGNI, keep utilities minimal |
| Performance degrades with large datasets | MEDIUM | HIGH | Fix known issues first, profile before optimizing |
| Users confused by different review flows | LOW | MEDIUM | Standardize UX across patterns (colors, labels) |
| LLM quality varies across models | HIGH | LOW | Allow model selection, provide retry mechanism |

---

## Appendix A: Current Implementation Analysis

### Code Duplication Matrix

| Feature | person.tsx | food-recipe.tsx | store-mapper.tsx |
|---------|-----------|----------------|------------------|
| Trigger pattern | ✅ (lines 666-667) | ✅ (lines 878) | ✅ (per-photo) |
| generateObject | ✅ (lines 670-712) | ✅ (lines 880-983) | ✅ (lines 697-737) |
| Diff preview | ✅ (lines 714-732) | ✅ (lines 986-1029) | ❌ (custom) |
| Review modal | ✅ (lines 745-904) | ✅ (lines 1830-2050) | ❌ (custom) |
| Accept handler | ✅ (lines 461-598) | ✅ (lines 507-606) | ❌ (custom) |
| Cancel handler | ✅ (lines 451-458) | ✅ (lines 498-505) | ❌ (custom) |
| Word-level diff | ✅ (lines 805-834) | ✅ (lines 1882-1907) | ❌ (N/A) |

**Observations:**
- person.tsx and food-recipe.tsx share ~85% identical structure
- store-mapper.tsx uses different approach (per-item vs field diff)
- All three use trigger pattern correctly (no reactive storms)
- All three have ~200-400 lines of extraction-related code

### Framework Constraint Violations Found

**None found** - All three patterns correctly implement framework constraints:
- ✅ generateObject only in pattern body
- ✅ Trigger pattern prevents reactive storms
- ✅ Cell mutations only in handlers
- ✅ derive() not used for mutations
- ✅ No opaque ref callbacks

### Performance Issues Found

**store-mapper.tsx:**
1. **Duplicate computed() work** (lines 792-865)
   - `totalNonConflictingAisles` and `batchAllPhotosData` both iterate all photos
   - Fix: Combine into single computed() returning `{ totalCount, aislesToAdd }`

2. **analyzeOverlap() in render loop** (line 2872)
   - Called inside `.map()` in JSX
   - Runs O(P·a·n·i·j) = 225,000 ops with 50 photos
   - Fix: Move to computed() outside JSX, cache results

3. **Photo memory leak** (lines 692-695)
   - Hidden photos stay in `uploadedPhotos` array indefinitely
   - Fix: Schedule actual removal 5 minutes after hide

---

## Appendix B: References

- **TODO file:** `/Users/alex/Code/community-patterns-2/patterns/jkomoros/design/todo/import-review-flow-pattern.md`
- **Example patterns:**
  - `/Users/alex/Code/community-patterns-2/patterns/jkomoros/person.tsx`
  - `/Users/alex/Code/community-patterns-2/patterns/jkomoros/food-recipe.tsx`
  - `/Users/alex/Code/community-patterns-2/patterns/jkomoros/store-mapper.tsx`
- **Shared utilities:** `/Users/alex/Code/community-patterns-2/patterns/jkomoros/utils/diff-utils.ts`
- **Framework docs:** `~/Code/labs/docs/common/` (PATTERNS.md, CELLS_AND_REACTIVITY.md)
