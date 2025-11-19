# Group Voter - 3-Charm Architecture

## Overview

A collaborative voting system using a **3-charm architecture** where each component serves a distinct purpose:

1. **Admin Pattern** (`group-voter.tsx`) - Poll creator's control panel
2. **Viewer Pattern** (`group-voter-viewer.tsx`) - Public lobby for joining
3. **Voter Pattern** (`group-voter-view.tsx`) - Individual voter's ballot

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Admin Pattern (group-voter.tsx)                                 │
│ - Creates poll question and options                             │
│ - Can add/remove options                                        │
│ - Can vote (has own name field)                                 │
│ - Creates Viewer charm                                          │
│ - Shares URL to Viewer charm with team                          │
│                                                                  │
│ Cells: question, options, votes, voterCharms                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ Creates Viewer
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Viewer Pattern (group-voter-viewer.tsx)                         │
│ - PUBLIC URL shared with team                                   │
│ - Shows question and live results (read-only)                   │
│ - Name entry → creates Voter charm                              │
│ - Navigation works WITHOUT storage tracking                     │
│                                                                  │
│ Receives: question (value), options (cell ref), votes (cell ref)│
└────────────────────────┬────────────────────────────────────────┘
                         │ Creates Voter
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Voter Pattern (group-voter-view.tsx)                            │
│ - Individual voter's personal ballot                            │
│ - Has pre-filled name (passed from Viewer)                      │
│ - Can vote on all options                                       │
│ - Can change votes at any time                                  │
│ - Updates shared votes cell                                     │
│                                                                  │
│ Receives: question (value), options (cell ref), votes (cell ref)│
│ Local: myName (local cell)                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Cell Reference Sharing

All three patterns share the same reactive data:

```typescript
// Admin creates these cells
const question = cell("");
const options = cell<Option[]>([]);
const votes = cell<Vote[]>([]);

// Admin creates Viewer and passes references
const viewerInstance = GroupVoterViewer({
  question: question.get(),  // Plain value (read-only)
  options,                   // Cell reference (shared, reactive)
  votes,                     // Cell reference (shared, reactive)
  voterCharms                // Cell reference (shared, reactive)
});

// Viewer creates Voter and passes references
const voterInstance = GroupVoterView({
  question: question,        // Plain value (read-only)
  options,                   // Cell reference (shared, reactive)
  votes,                     // Cell reference (shared, reactive)
  myName: Cell.of(name),     // New local cell (not shared)
});
```

### Real-Time Updates

When any voter modifies the `votes` cell:
1. Voter calls `votes.set([...filtered, newVote])`
2. All patterns with references to `votes` react instantly
3. Derived values (rankings, vote counts) update automatically
4. All UIs re-render with new data

## Critical Implementation Details

### Navigation and Cell Modifications

**CRITICAL DISCOVERY**: ANY cell modification during handler execution blocks `navigateTo()`.

**❌ This FAILS:**
```typescript
const voterInstance = GroupVoterView({ ... });
voterCharms.set([...voterCharms.get(), { charm: voterInstance }]); // Blocks!
return navigateTo(voterInstance); // Never reaches here
```

**✅ This WORKS:**
```typescript
const voterInstance = GroupVoterView({ ... });
return navigateTo(voterInstance); // Navigate immediately
```

### Trade-off: No "Find Existing Voter"

Due to navigation blocking, we cannot store voter charm references during creation.

**Impact:**
- Each name entry creates a NEW voter charm
- Users must bookmark their voter charm URL to return
- No centralized "find my ballot" feature

**User Experience:**
- Viewer tells users: "Bookmark the page to return later!"
- Each voter charm has descriptive title: `"{Name} - {Question} - Voter"`
- Users can navigate back via browser history or bookmarks

### Ranking Algorithm

```typescript
// Sort by: fewest reds (ascending), then most greens (descending)
return voteCounts.sort((a, b) => {
  if (a.reds !== b.reds) {
    return a.reds - b.reds;  // Fewer reds is better
  }
  return b.greens - a.greens;  // More greens is better
});
```

**Why this ranking?**
1. **Minimize opposition** - Avoid options people can't accept
2. **Maximize enthusiasm** - Choose what people love

## Testing Results

### Test Space: `test-jkomoros-3`

**Setup:**
- Question: "Where should we go for lunch?"
- Options: Chipotle, Thai Kitchen, Pizza Place
- Voters: Grace, Bob, Alice

**Votes Cast:**
- Grace: 🟢 Chipotle
- Bob: 🟢 Thai Kitchen, 🔴 Pizza Place
- Alice: 🟢 Chipotle, 🟡 Thai Kitchen

**Results:**
```
RANK 1: Chipotle
  - 2 greens (Grace, Alice)
  - 0 reds
  - TOP CHOICE: "2 love it"

RANK 2: Thai Kitchen
  - 1 green (Bob)
  - 1 yellow (Alice)
  - 0 reds

RANK 3: Pizza Place
  - 0 greens
  - 1 red (Bob)
  - Eliminated by veto
```

### Verified Features

✅ **Admin → Viewer navigation** - Working
✅ **Viewer → Voter navigation** - Working (creates new charm)
✅ **Voting functionality** - Working (all vote types)
✅ **Real-time updates** - Working (instant across all charms)
✅ **Vote aggregation** - Working (multiple votes per option)
✅ **Ranking algorithm** - Working (fewest reds, most greens)
✅ **TOP CHOICE display** - Working (shows winner with vote count)
✅ **Vote badges** - Working (shows voter names with colors)
✅ **Multi-user support** - Working (3 voters tested simultaneously)

⚠️ **Known Limitations:**
- No "find existing voter" feature (users must bookmark)
- Console transaction warnings (don't affect functionality)

## File Structure

```
patterns/jkomoros/WIP/
├── group-voter.tsx                 # Admin pattern (poll creator)
├── group-voter-viewer.tsx          # Viewer pattern (public lobby)
├── group-voter-view.tsx            # Voter pattern (individual ballot)
├── group-voter-PRD.md              # Product requirements document
└── group-voter-ARCHITECTURE.md     # This file
```

## URL Structure

```
Admin:  /space/ADMIN-CHARM-ID
  ↓ Creates Viewer
Viewer: /space/VIEWER-CHARM-ID  (share this URL with team)
  ↓ Creates Voters
Voter:  /space/VOTER-CHARM-ID-1  (Grace's ballot - bookmark this)
Voter:  /space/VOTER-CHARM-ID-2  (Bob's ballot - bookmark this)
Voter:  /space/VOTER-CHARM-ID-3  (Alice's ballot - bookmark this)
```

## Future Enhancements

### Possible Improvements (Post-V1)

1. **Voter charm tracking via alternate mechanism**
   - Store voter charm IDs in a separate database
   - Use async storage that doesn't block navigation
   - Implement "Find my ballot" by name lookup

2. **Vote change notifications**
   - Show live updates when someone votes
   - "Alice just voted green for Chipotle"

3. **Vote history**
   - Track when votes changed
   - Show voting timeline

4. **Anonymous voting mode**
   - Hide voter names
   - Show only aggregate counts

5. **Poll closing**
   - Lock voting after deadline
   - Declare final winner

## Key Learnings

1. **Cell modifications block navigation** - This is the most important constraint
2. **Cell references enable real-time collaboration** - Pass cells, not values
3. **Handler execution is synchronous** - Can't do async storage during navigation
4. **Console warnings don't affect functionality** - Storage transactions may warn but work
5. **Descriptive naming prevents charm list spam** - Good titles help users navigate
6. **Trade-offs are acceptable** - Bookmarking is a small UX cost for working navigation

## Conclusion

The 3-charm architecture successfully implements real-time collaborative voting with:
- Clean separation of concerns (admin vs viewer vs voter)
- Reactive data sharing via cell references
- Working navigation between charms
- Multi-user vote aggregation
- Fair ranking algorithm

The trade-off of requiring users to bookmark their voter URLs is acceptable given the constraint that cell modifications block navigation during handler execution.
