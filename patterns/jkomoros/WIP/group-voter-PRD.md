# Group Voter Pattern - PRD

## Overview

A collaborative voting system for small groups (3-20 people) to make decisions together, like choosing where to go for lunch. The system emphasizes social dynamics and transparency - everyone sees who voted for what in real-time.

## Core Concept

Each poll has multiple options (e.g., restaurant choices). Voters rate each option as:
- 🟢 **Green** (LOVE IT) - Strong preference
- 🟡 **Yellow** (I can live with it) - Acceptable
- 🔴 **Red** (I CAN'T live with it) - Veto/strong opposition

The winning option is determined by:
1. **Primary sort**: Fewest red votes (minimize opposition)
2. **Secondary sort**: Most green votes (maximize enthusiasm)

## User Roles

### Admin (Poll Creator)
- Person who creates the poll
- Can add/remove options
- Can reset votes (keep options)
- Can clear all options (start fresh)
- Can see live results like everyone else

### Voters
- Anyone who joins the poll via URL
- Enter their name/initials when first joining
- Can vote on any/all options
- Can change their votes at any time
- See live results as people vote

## Architecture

### Two-Pattern System

**Main Pattern: Poll Admin**
- Holds shared poll data (options, votes, voter list)
- Displays results prominently
- Provides admin controls
- Can be viewed by anyone (shows results)

**Sub-Pattern: Voter View**
- Launched when someone visits the poll URL
- Prompts for voter name/initials (stored locally)
- Receives shared poll data via cell references
- Writes votes back to shared state
- Shows same live results as admin view

### Data Structure

```typescript
interface Vote {
  voterName: string;      // "Alice" or "AK"
  optionId: string;       // UUID of option
  voteType: "green" | "yellow" | "red";
}

interface Option {
  id: string;            // UUID
  title: string;         // "Chipotle", "Taco Bell", etc.
}

interface Poll {
  options: Cell<Option[]>;
  votes: Cell<Vote[]>;
  voters: Cell<string[]>;  // List of people who have joined
}
```

### Technical Implementation

**Pattern Composition Approach**:
- Main pattern exports `options`, `votes`, `voters` as cells
- Voter pattern receives these as input (cell references)
- Voter pattern has local state for `myName: Cell<string>`
- Both patterns compute results from same shared data
- Changes propagate automatically via cell reactivity

## User Flows

### Flow 1: Admin Creates Poll

1. Admin opens pattern
2. Sees empty state: "Add your first option"
3. Enters option titles (e.g., "Chipotle", "Taco Bell", "Thai Kitchen")
4. Each option gets a unique ID
5. Shares poll URL with group

### Flow 2: Voter Joins Poll

1. Voter opens poll URL
2. Sees prompt: "What's your name?" (if first visit)
3. Enters name or initials (2-15 characters)
4. Name stored in local state + added to shared voter list
5. Sees all options with current vote visualization
6. Sees top-ranked option prominently displayed

### Flow 3: Voting

1. Voter sees list of all options
2. Each option shows:
   - Option title
   - Row of colored dots (green/yellow/red) with initials in each dot
   - Current ranking indication
3. Voter clicks an option
4. Sees three buttons: 🟢 Green, 🟡 Yellow, 🔴 Red
5. Clicks a vote button
6. Dot with their initials appears in that color
7. Results re-rank instantly
8. Everyone sees the update in real-time

### Flow 4: Changing a Vote

1. Voter clicks an option they already voted on
2. Their current vote is highlighted
3. Clicks a different color button
4. Their dot moves to the new color
5. Results update for everyone

### Flow 5: Admin Resets Votes

1. Admin clicks "Reset Votes" button
2. Confirmation: "Clear all votes but keep options?"
3. All votes cleared
4. Options remain
5. All viewers see empty vote state

### Flow 6: Admin Clears Options

1. Admin clicks "Clear Options" button
2. Confirmation: "Clear all options? This will also clear votes."
3. All options and votes cleared
4. Back to empty state
5. All viewers see empty poll

## UI Design

### Results Display (Top of Screen)

```
┌─────────────────────────────────────┐
│  🏆 TOP CHOICE                      │
│  Chipotle                           │
│  🟢🟢🟢🟢 🟡🟡 🔴                 │
│  (4 love it, 2 okay, 1 can't)      │
└─────────────────────────────────────┘
```

### Options List

```
┌─────────────────────────────────────┐
│ Chipotle                       [RANK 1]
│ 🟢 🟢 🟢 🟢 🟡 🟡 🔴
│  AK  BJ  CW  DM  EF  GH  IJ
│
│ Taco Bell                      [RANK 2]
│ 🟢 🟢 🟡 🟡 🟡 🔴 🔴
│  BJ  CW  AK  DM  EF  GH  IJ
│
│ Thai Kitchen                   [RANK 3]
│ 🟢 🟢 🟢 🔴 🔴 🔴 🔴
│  AK  BJ  CW  DM  EF  GH  IJ
└─────────────────────────────────────┘
```

Each dot is a small circle with initials centered inside.

### Voting Interface (When Option Clicked)

```
┌─────────────────────────────────────┐
│  Chipotle - How do you feel?       │
│                                     │
│  [  🟢 LOVE IT  ]                  │
│  [  🟡 CAN LIVE WITH IT  ]         │
│  [  🔴 CAN'T LIVE WITH IT  ]       │
│                                     │
│  [Cancel]                           │
└─────────────────────────────────────┘
```

### Admin Controls (Bottom of Admin View)

```
┌─────────────────────────────────────┐
│  Admin Controls                     │
│  [+ Add Option]                     │
│  [Reset Votes]                      │
│  [Clear All Options]                │
└─────────────────────────────────────┘
```

## Ranking Algorithm

```typescript
function rankOptions(options: Option[], votes: Vote[]): Option[] {
  return options.toSorted((a, b) => {
    const aVotes = votes.filter(v => v.optionId === a.id);
    const bVotes = votes.filter(v => v.optionId === b.id);

    // Count reds (fewer is better)
    const aReds = aVotes.filter(v => v.voteType === "red").length;
    const bReds = bVotes.filter(v => v.voteType === "red").length;

    if (aReds !== bReds) {
      return aReds - bReds; // Ascending (fewer reds = better)
    }

    // Count greens (more is better)
    const aGreens = aVotes.filter(v => v.voteType === "green").length;
    const bGreens = bVotes.filter(v => v.voteType === "green").length;

    return bGreens - aGreens; // Descending (more greens = better)
  });
}
```

## Key Features

### Real-Time Social Dynamics
- Everyone sees votes as they come in
- Social pressure visible: "Oh no, my favorite has 3 reds!"
- Transparent: No hidden votes or secret ballots
- Encourages discussion and consensus

### Flexible Voting
- Vote on as many or as few options as you want
- Change votes at any time
- No "submit" button - instant feedback
- Visual feedback with dots and initials

### Simple Ranking
1. Avoid options people can't accept (minimize reds)
2. Choose options people love (maximize greens)
3. Clear winner emerges naturally

### Admin Controls
- Add options during voting (if people suggest new ideas)
- Reset votes without losing options
- Clear everything for a new poll

## Edge Cases

### No Votes Yet
- Show options with empty dot rows
- Display: "Waiting for votes..."
- Top choice shows: "No votes yet"

### Tie for First Place
- Show both options as "TOP CHOICE (tied)"
- Or show both with equal prominence

### Someone Removes Their Vote
- Option to click a vote dot to remove it
- Or click "Clear My Vote" button on voting interface

### Very Long Option Names
- Truncate at ~30 characters
- Show full name on hover or in voting interface

### Many Voters (15-20)
- Dots become small but still show initials
- Consider wrapping to multiple rows
- Or use "+5 more" collapse pattern

## Success Metrics

### Core Experience
- Time from opening URL to first vote: < 30 seconds
- Votes per person: 2-5 on average
- Vote changes per person: 1-3 (shows engagement)

### Social Dynamics
- Groups reach consensus naturally
- Red votes spark discussion
- Clear winner emerges in 90%+ of polls

### Usability
- No confusion about how to vote
- Dot visualization makes results intuitive
- No need to explain the system

## Future Enhancements (Out of Scope for V1)

- **Comments**: Let people explain their votes
- **Vote weights**: Make some voters' opinions count more
- **Time limits**: Set voting deadline
- **Anonymous mode**: Hide who voted what
- **History**: Track past polls and decisions
- **Templates**: Common poll types (restaurants, movies, dates)
- **Integrations**: Pull restaurant data, show maps, etc.

## Development Approach

### Phase 1: Admin Pattern (Base)
1. Create poll data structure
2. Add/remove options functionality
3. Display options list
4. Basic ranking algorithm
5. Reset controls

### Phase 2: Voting Mechanism
1. Add votes array to state
2. Implement voting UI (vote buttons)
3. Display votes as colored dots
4. Update ranking in real-time
5. Vote change functionality

### Phase 3: Voter Pattern (Multi-User)
1. Create voter sub-pattern
2. Name entry on first load
3. Connect to shared poll data via cell refs
4. Test with multiple instances
5. Verify real-time updates work

### Phase 4: Polish
1. Improve dot visualization
2. Add initials to dots
3. Top choice prominent display
4. Admin controls styling
5. Responsive layout
6. Edge case handling

## Technical Considerations

### Cell References
- Use cell references to share data between patterns
- Avoid copying data when possible
- Let reactivity handle updates automatically

### Vote Updates
- Use vote array with voter name + option ID + vote type
- Find and update existing vote, or add new vote
- Use `votes.get()` and `votes.set()` for updates

### Computed Values
- Ranking algorithm as computed cell
- Vote counts per option as computed
- Top choice as computed
- These update automatically when votes change

### Pattern Launching
- Main pattern provides "Join as Voter" button
- Or auto-detect if user is admin vs voter
- Pass poll data cells to voter pattern

### UUID Generation
- Use `crypto.randomUUID()` for option IDs
- Ensures uniqueness across options
- Stable IDs for vote references

## Open Questions for Development

1. **Voter pattern launching**: Button-based or automatic detection?
2. **Vote removal**: Explicit "Remove Vote" button or click-to-remove on dot?
3. **Styling**: Material design, minimalist, or playful/colorful?
4. **Mobile optimization**: How small can dots get while remaining usable?
5. **Poll persistence**: Should poll data persist between sessions?

## Example Usage Scenarios

### Scenario 1: Lunch Decision
- Team of 6 people
- 4 restaurant options
- Everyone votes in 2 minutes
- Clear winner emerges: Mexican place (0 reds, 5 greens)
- Everyone happy, decision made

### Scenario 2: Contentious Choice
- Team of 10 people
- 5 options
- One option gets 7 reds - clearly eliminated
- Two options tied with 0 reds each
- Tied options both have social support
- Group discusses the two finalists
- A few people switch from yellow to green
- Winner emerges with 6 greens vs 4 greens

### Scenario 3: Adding Options Mid-Vote
- Poll starts with 3 options
- Someone suggests a 4th option during voting
- Admin adds it
- Everyone sees new option appear
- People vote on it
- It becomes the winner!

---

**End of PRD**

This document should guide the implementation of the group-voter pattern. The key insight is the social transparency - everyone sees everything in real-time, which creates natural consensus and discussion.
