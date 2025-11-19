# ClusterBoard - Product Requirements Document

**Version**: 0.1
**Status**: Draft
**Author**: Alex Komoroske
**Last Updated**: 2025-11-19

---

## Overview

**ClusterBoard** is a collaborative brainstorming tool that automatically organizes ideas using AI-powered semantic clustering. Users can add sticky notes to an infinite canvas, and the system intelligently arranges them by similarity while avoiding overlaps.

**Tagline**: "Brainstorm freely, organize automatically"

---

## Vision & Goals

### Vision
Create a brainstorming environment where humans focus on generating ideas while AI handles the cognitive overhead of organization, revealing emergent patterns and connections.

### Primary Goals
1. **Frictionless Creation**: Add ideas instantly without worrying about placement
2. **Automatic Organization**: AI clusters semantically related ideas together
3. **Collaborative**: Real-time multi-user brainstorming with live updates
4. **Emergent Structure**: Surface the "shape" of discussions naturally
5. **User Control**: Manual overrides when users know better than the algorithm

### Success Metrics
- Time to add first idea: < 5 seconds
- Ideas per session: > 10
- User satisfaction with auto-organization: > 80%
- Reduction in manual repositioning: > 50%

---

## User Stories

### Core Stories
- As a **brainstormer**, I want to quickly jot down ideas without choosing where to place them
- As a **team member**, I want to see others' ideas appear in real-time as they're created
- As a **facilitator**, I want related ideas to automatically cluster together so I can identify themes
- As a **contributor**, I want to manually position important ideas when I have a specific layout in mind
- As a **team**, we want to see unexpected connections between our ideas revealed by clustering

### Advanced Stories (Future)
- As a **facilitator**, I want to name and color-code clusters that emerge
- As a **team**, we want to export our organized board as a structured document
- As a **contributor**, I want to draw explicit connections between related ideas
- As a **facilitator**, I want to replay the brainstorming session to see how ideas evolved

---

## Technical Architecture

### Data Model

```typescript
interface PostIt {
  id: string                    // Unique identifier
  content: string               // Note text
  position: { x: number, y: number }  // Canvas coordinates
  size: { width: number, height: number }  // Note dimensions
  author: string                // User DID
  createdAt: number            // Timestamp
  updatedAt: number            // Last modified
  color?: string               // Color (defaults to user color)
  locked?: boolean             // User-locked position (no auto-move)
  embedding?: number[]         // Semantic embedding vector (Phase 4)
}

interface Board {
  postIts: PostIt[]            // All notes on the board
  autoOrganize: boolean        // Auto-organize enabled?
  organizationStrength: number // 0-1, how strong the clustering force
  viewport: {                  // Current view window
    x: number
    y: number
    zoom: number
  }
}

interface SimilarityCache {
  [key: string]: number        // "id1:id2" -> similarity score (0-1)
  timestamp: number            // When computed
}
```

### Algorithm Design

#### Force-Directed Layout
ClusterBoard uses a physics-based layout algorithm inspired by force-directed graphs:

1. **Repulsion Force** (anti-overlap)
   - Formula: `F_repel = k / distance²`
   - Stronger when notes are closer
   - Pushes overlapping notes apart
   - Always active

2. **Attraction Force** (semantic clustering)
   - Formula: `F_attract = similarity × distance × strength`
   - Pulls similar notes together
   - Strength controlled by user slider (0-1)
   - Only active when auto-organize is ON

3. **Equilibrium**
   - Apply forces iteratively (simulation steps)
   - Use velocity damping to prevent oscillation
   - Stop when system reaches stable state (velocity < threshold)
   - Animate smoothly between states

4. **User Override**
   - Locked notes have infinite mass (don't move)
   - Manual drag temporarily locks for N seconds
   - User can explicitly lock/unlock notes

#### Similarity Computation

**Phase 3: LLM-based (MVP)**
```typescript
// Batch similarity computation
const prompt = `Rate the semantic similarity (0-10) between these note pairs:
1. "${note1.content}" vs "${note2.content}"
2. "${note3.content}" vs "${note4.content}"
...

Return JSON: [{"pair": 1, "score": 8}, {"pair": 2, "score": 3}, ...]`

// Convert scores to 0-1 range
similarity = score / 10
```

**Phase 4: Embedding-based (Performance)**
```typescript
// Generate embeddings for each note
embedding = await generateEmbedding(note.content)

// Compute cosine similarity
similarity = cosineSimilarity(embedding1, embedding2)
```

**Optimization Strategies**:
- Cache similarity scores (invalidate on content change)
- Only compute similarities for nearby notes (spatial partitioning)
- Batch LLM calls to minimize API overhead
- Incremental updates (don't recompute everything)

---

## Phased Implementation

### Phase 1: Basic Board (MVP Foundation)
**Goal**: Get the core note-taking experience working

**Features**:
- Create post-it notes (double-click canvas or "+" button)
- Edit note content (click to edit, auto-save)
- Delete notes (trash icon or keyboard shortcut)
- Manual drag-and-drop positioning
- Pan and zoom canvas
- Basic styling (colors, fonts)

**Technical**:
- Cells: `postIts` (CellArray), `viewport` (Cell)
- HTML5 Canvas or SVG for rendering
- Mouse/touch event handling
- No AI yet

**Success Criteria**: Can create 10+ notes and arrange manually

---

### Phase 2: Collision Detection & Repulsion
**Goal**: Notes automatically avoid overlapping

**Status**: ⚠️ **DEFERRED** - Framework limitations discovered

**Original Features**:
- Detect overlapping notes
- Apply repulsion force to push apart
- Smooth animation to new positions
- "Shake" animation when notes collide

**Technical Challenges Discovered**:
- **CRDT Transaction Conflicts**: Rapid Cell updates create optimistic concurrency conflicts
- **No Lifecycle Hooks**: Patterns lack mount/unmount hooks for continuous animation loops
- **No requestAnimationFrame Access**: Cannot use browser animation APIs in pattern context
- **Event-Driven Limitations**: Framework expects reactive/declarative updates, not imperative position adjustments

**Attempted Approaches**:
1. ❌ Continuous physics loop with requestAnimationFrame - Framework doesn't support
2. ❌ Event-driven collision resolution on create/move - CRDT conflicts from rapid updates
3. ❌ Single-note push on collision - Still creates transaction conflicts

**Recommended Path Forward**:
- **Option A**: Skip Phase 2, move directly to Phase 3 (LLM clustering) which is more feasible
- **Option B**: Implement as separate web component (like ct-draggable) that can manage continuous physics
- **Option C**: Simplify to visual overlap warnings instead of automatic resolution

**Decision**: Defer Phase 2 until after Phase 3 MVP. LLM clustering is the core innovation and doesn't require continuous animation. Can revisit collision avoidance later with a dedicated component if needed.

---

### Phase 3: LLM Clustering (Core Innovation)
**Goal**: Related notes automatically cluster together

**Features**:
- "Auto-Organize" toggle button
- "Re-organize Now" button (manual trigger)
- LLM computes note similarity
- Apply attraction force based on similarity
- Visual feedback (loading indicator)

**Technical**:
- Batch LLM API calls for similarity
- Cache results in Cell
- Attraction force calculation
- Rate limiting and error handling

**Success Criteria**: 10 notes about "programming" cluster together, separated from 10 notes about "cooking"

---

### Phase 4: Embedding-based Optimization
**Goal**: Fast, scalable similarity without LLM overhead

**Features**:
- Automatic embedding generation on note create/edit
- Real-time clustering (no loading delay)
- Support for 100+ notes
- Background re-computation

**Technical**:
- Use embeddings API (faster than full LLM)
- Cosine similarity computation
- Incremental embedding updates
- Spatial indexing (quadtree/R-tree)

**Success Criteria**: 100+ notes organize in < 2 seconds

---

### Phase 5: Advanced Features (Future)
**Goal**: Power user features and export

**Features**:
- Manual groups (draw circles around clusters)
- Name and color clusters
- Draw explicit connections (lines between notes)
- Export to markdown, PDF, or image
- History and undo/redo
- Voting or starring notes
- Templates and saved boards

**Success Criteria**: Teams use for real projects and export results

---

## UI/UX Design

### Core Interface

```
┌─────────────────────────────────────────────┐
│  ClusterBoard                    [+ New]   │
│  ┌──────────────────────────────────────┐  │
│  │                                      │  │
│  │      ┌─────┐         ┌─────┐       │  │
│  │      │Note1│         │Note3│       │  │
│  │      └─────┘         └─────┘       │  │
│  │                                      │  │
│  │  ┌─────┐                            │  │
│  │  │Note2│         ┌─────┐           │  │
│  │  └─────┘         │Note4│           │  │
│  │                  └─────┘           │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  [Auto-Organize: ON]  [Re-organize Now]   │
│  Clustering: ●────────○ (0.5)              │
└─────────────────────────────────────────────┘
```

### Post-It Design
```
┌──────────────────┐
│  Note content    │ ← Click to edit
│  here...         │
│                  │
│         [🔒] [🗑] │ ← Lock/Delete icons
└──────────────────┘
   @username       ← Author (faded)
```

### Controls
- **"+" Button**: Add new note (appears at current viewport center)
- **Auto-Organize Toggle**: Enable/disable automatic clustering
- **Re-organize Button**: Trigger clustering now (when auto is OFF)
- **Clustering Slider**: Control attraction strength (0 = no clustering, 1 = strong)
- **Lock Icon**: Toggle position lock per note
- **Canvas Controls**: Pan (drag background), Zoom (scroll wheel)

### Visual Feedback
- **Creating**: Note fades in smoothly
- **Editing**: Highlight border, show cursor
- **Moving**: Shadow under note, snap back if dropped on another
- **Organizing**: Shimmer effect on all notes, progress indicator
- **Locked**: Lock icon visible, note slightly grayed
- **Collaborative**: Show other users' cursors with labels

---

## Common Tools Implementation Details

### Cells & Reactivity

```typescript
// State management
const postIts = cell.array<PostIt>([])  // Primary data
const viewport = cell({ x: 0, y: 0, zoom: 1 })
const autoOrganize = cell(false)
const organizationStrength = cell(0.5)
const similarityCache = cell<SimilarityCache>({})

// Derived state
const visiblePostIts = cell(() => {
  // Only notes in current viewport (performance)
  return postIts.value.filter(note => isInViewport(note, viewport.value))
})

const positions = cell(() => {
  // Computed positions after physics simulation
  return computeLayout(postIts.value, similarityCache.value)
})
```

### Performance Considerations

**Challenge**: For N notes, similarity requires N²/2 comparisons (grows fast!)

**Optimizations**:
1. **Spatial Partitioning**: Only compare nearby notes (within K distance)
2. **Similarity Threshold**: Ignore pairs with similarity < 0.3 (no attraction)
3. **Batch Processing**: Compute similarities in background (Web Workers)
4. **Caching**: Never recompute unless content changes
5. **Incremental Updates**: When adding one note, only compute N new similarities
6. **Rate Limiting**: Debounce auto-organize triggers (max 1x per 5 seconds)

**Expected Performance**:
- 10 notes: Instant (45 comparisons)
- 50 notes: ~2 seconds (1,225 comparisons, batched)
- 100 notes: ~5 seconds (4,950 comparisons, spatial optimization needed)
- 500+ notes: Requires embeddings (Phase 4)

### Multi-User Sync

Common Tools Charms handle multi-user state automatically via CRDTs:

```typescript
// Optimistic updates
function moveNote(id: string, newPos: Position) {
  // Immediately update local state
  const note = postIts.value.find(n => n.id === id)
  note.position = newPos
  note.locked = true  // Lock while dragging

  // Sync to other users automatically
  postIts.notify()
}

// Conflict resolution
// If two users move the same note, last-write-wins
// Could add more sophisticated merging later
```

---

## Open Questions & Decisions

### 1. Auto-Organize Trigger
**Options**:
- A) Always on (continuous clustering)
- B) Button-triggered (user controls when)
- C) Hybrid: Toggle + manual trigger

**Recommendation**: **C** - Default to OFF, users opt-in, but can trigger manually anytime

**Rationale**:
- Avoids surprising users during active brainstorming
- Gives control over when AI "helps"
- Users can try it once to see effect

---

### 2. Similarity Threshold
**Question**: How similar (0-1) before notes attract?

**Options**:
- A) No threshold (all notes attract proportionally)
- B) 0.3 threshold (ignore weak similarities)
- C) User-adjustable threshold

**Recommendation**: **B** initially, **C** in Phase 5

**Rationale**:
- Weak similarities create noise
- Fixed threshold simplifies initial implementation
- Power users can tune later

---

### 3. Position Locking
**Question**: When user manually moves a note, how long should it resist forces?

**Options**:
- A) Forever (until user unlocks)
- B) 30 seconds (temporary resistance)
- C) Until next organize (then forgets)

**Recommendation**: **A** with explicit lock icon

**Rationale**:
- Preserves user intent
- Clear visual feedback (lock icon)
- Users can unlock if they change mind

---

### 4. Visual Feedback During Organization
**Question**: How to show the system is "thinking"?

**Options**:
- A) Loading spinner
- B) Shimmer effect on notes
- C) Progress bar with status
- D) Animated "thinking" indicator

**Recommendation**: **B + C** - Shimmer during compute, progress bar for updates

**Rationale**:
- Shimmer: Indicates which notes are affected
- Progress: Shows how long to wait
- Combined: Best of both worlds

---

### 5. Board Boundaries
**Question**: Should the canvas be infinite or bounded?

**Options**:
- A) Infinite canvas (pan forever)
- B) Bounded (e.g., 10,000 × 10,000 units)
- C) Dynamic (expands as notes added)

**Recommendation**: **A** - Infinite canvas

**Rationale**:
- Infinite is simpler (no edge cases)
- Users rarely go far from center
- Can add "re-center" button if users get lost

---

## Technical Risks & Mitigations

### Risk 1: LLM API Costs
**Risk**: 100 notes = 4,950 similarity calls = expensive

**Mitigation**:
- Batch calls (20-50 pairs per prompt)
- Aggressive caching (never recompute)
- Move to embeddings in Phase 4 (much cheaper)
- Rate limiting (max 1 organize per 5 seconds)

---

### Risk 2: Performance with Many Notes
**Risk**: 500+ notes = 125K comparisons = slow

**Mitigation**:
- Spatial partitioning (only nearby notes)
- Similarity threshold (ignore weak pairs)
- Web Workers (background processing)
- Phase 4 embeddings (O(N) instead of O(N²))

---

### Risk 3: User Confusion
**Risk**: Notes moving unexpectedly frustrates users

**Mitigation**:
- Default to manual mode (opt-in clustering)
- Clear visual feedback (shimmer, progress)
- Lock icon (preserve user intent)
- Undo button (revert to previous layout)

---

### Risk 4: Concurrent Edits
**Risk**: Two users edit same note simultaneously

**Mitigation**:
- Optimistic locking (show "User X is editing...")
- Last-write-wins (simple but works for most cases)
- Future: Operational transforms (complex but correct)

---

## Success Criteria

### MVP Success (Phase 3)
- [ ] 10 users test the tool
- [ ] Average 20+ notes per session
- [ ] 80%+ satisfaction with auto-organize
- [ ] < 5 bugs reported
- [ ] Export to markdown works

### Long-Term Success (Phase 5)
- [ ] 100+ active users
- [ ] Featured in Common Tools showcase
- [ ] Used for real team meetings
- [ ] Positive community feedback
- [ ] Contributed back to upstream

---

## Timeline

| Phase | Features | Estimated Time |
|-------|----------|----------------|
| 1 | Basic board (CRUD, drag) | 2-3 days |
| 2 | Collision & repulsion | 1-2 days |
| 3 | LLM clustering | 3-4 days |
| 4 | Embeddings optimization | 2-3 days |
| 5 | Advanced features | 5-7 days |

**Total MVP (Phases 1-3)**: ~1 week
**Full Product (Phases 1-5)**: ~3 weeks

---

## References

- Force-directed graph algorithms: https://en.wikipedia.org/wiki/Force-directed_graph_drawing
- Common Tools documentation: ~/Code/labs/docs/common/
- Similar tools: Miro, Mural, FigJam (but none have auto-clustering!)

---

## Appendix: Example Prompts

### Similarity Prompt (Phase 3)
```
You are helping organize brainstorming notes by computing semantic similarity.

Rate the similarity (0-10) between these note pairs, where:
- 0 = completely unrelated
- 5 = somewhat related (share theme but different aspects)
- 10 = nearly identical (same core concept)

Notes:
1. "Add user authentication"
2. "Implement login page"
3. "Buy groceries"
4. "Create database schema"

Pairs to rate:
1-2, 1-3, 1-4, 2-3, 2-4, 3-4

Return JSON:
[
  {"pair": "1-2", "score": 9},
  {"pair": "1-3", "score": 0},
  ...
]
```

### Embedding Prompt (Phase 4)
```
Generate a semantic embedding for this brainstorming note:
"Add user authentication system with OAuth"

Return a 768-dimensional vector.
```

---

## Change Log

- **2025-11-19**: Initial PRD draft (v0.1)
- **2025-11-19**: Phase 1 completed - Basic board with drag-and-drop
- **2025-11-19**: Phase 2 deferred - Documented framework limitations with collision physics
  - Discovered CRDT transaction conflicts prevent rapid Cell updates
  - Pattern framework lacks lifecycle hooks for continuous animation
  - Recommendation: Move to Phase 3 (LLM clustering) as core MVP feature
