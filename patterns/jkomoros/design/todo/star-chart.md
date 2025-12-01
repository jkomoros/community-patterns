# Star Chart - PRD

## Overview

A reward calendar for children learning daily habits. Shows a rolling 30-day timeline with gold stars for successful days and empty circles for missed days. Includes streak tracking with milestone celebrations and streak protection.

## Target Use Cases

- Potty training (dry nights, no daytime accidents)
- Behavioral goals (no tantrums, sharing toys)
- Routine building (brushed teeth, made bed)
- Any single habit a child is working on

## Core Features

### 1. Rolling 30-Day Timeline

- **Layout:** Horizontal scrollable row of last 30 days + today
- **Days shown:** Only past days and today (no future days visible)
- **Day display:** Date number with circle underneath
- **Visual:** Recent days more prominent, older days can be smaller

### 2. Gold Star System

- **Star state:** Tap a day to toggle the gold star on/off
- **Animation:** When star is awarded:
  - Star appears with scale-up animation
  - Sparkle burst radiates outward (adapt from reward-spinner)
  - Shimmer effect on the star
  - Sound optional (if platform supports)
- **Empty state:** Simple empty circle outline (neutral, not discouraging)

### 3. Streak Tracking

- **Current streak:** Prominently displayed (e.g., "5 days!")
- **Streak protection:** One "oops" day doesn't break the streak
  - Visual: Maybe show the protected day differently (half star? shield?)
  - Only one protection active at a time
- **Best streak:** Track and show personal best

### 4. Milestone Celebrations

Trigger special animations at these milestones:
- **3 days:** Small celebration (first achievement!)
- **7 days:** Medium celebration (one week!)
- **14 days:** Bigger celebration (two weeks!)
- **30 days:** Epic celebration (one month!)

Celebration ideas:
- Multiple star bursts
- Confetti animation
- Larger sparkle effects
- Special message ("Amazing! One whole week!")

### 5. Configurable Goal Name

- **Goal text:** Editable label (e.g., "Dry Night", "Big Kid Day")
- **Display:** Shows at top of the chart
- **Default:** "Gold Star Goal" or similar

## UI Layout

### Main View (Vertical Timeline)

```
+------------------------------------------+
|          [Goal Name]                      |
|           "Dry Nights"                   |
|                                          |
|    Current Streak: 5 days!              |
|                                          |
|  +------------------------------------+  |
|  | TODAY - Nov 30                     |  |
|  |                                    |  |
|  |    [ Big "Award Star" Button ]     |  |
|  |    (Parent taps to enable)         |  |
|  |                                    |  |
|  |    Then kid taps to place star!    |  |
|  +------------------------------------+  |
|                                          |
|  [Scrollable vertical timeline]          |
|                                          |
|  Nov 29  ⭐ (slightly tilted, shimmery)  |
|  Nov 28  ⭐ (different tilt, glowy)      |
|  Nov 27  ○  (empty circle)               |
|  Nov 26  ☆  (dimmed - protected day)     |
|  Nov 25  ⭐ (tilted other way)           |
|  ...                                     |
|                                          |
|  [Details/Corrections] (small link)      |
+------------------------------------------+
```

### Star Placement Flow

1. Parent taps "Award Star" button (unlocks placement)
2. Big celebratory star appears, waiting to be placed
3. Kid taps/touches the star to "stick" it on today
4. Sparkle burst + celebration animation plays
5. Star settles into place with random slight rotation

### Correction/Details View (Parent Mode)

```
+------------------------------------------+
|  < Back                                  |
|                                          |
|  Edit Past Days                          |
|                                          |
|  Nov 30  [○] → [⭐]  (toggle)            |
|  Nov 29  [⭐] → [○]  (toggle)            |
|  Nov 28  [⭐]                            |
|  ...                                     |
|                                          |
+------------------------------------------+
```

### Star Visual Style ("Magical Stickers")

- **Random rotation:** Each star has slight random skew (-15° to +15°)
- **Shimmer effect:** Subtle golden gradient animation
- **Jiggle:** Very subtle periodic wiggle (like it's alive)
- **Glow:** Soft golden outer glow/shadow
- **Feel:** Like physical gold star stickers placed by a child

### Protected Day Visual

- Same star shape but **dimmed/desaturated**
- No shimmer or glow effects
- Looks "used up" or faded
- Still counts toward streak but doesn't celebrate

Legend:
  ⭐ = Gold star (magical, shimmery, slightly tilted)
  ○  = Empty circle (neutral, not earned)
  ☆  = Protected day (dimmed star, no magic)
  [ ] = Today's award button

## Technical Notes

### State Schema

```typescript
interface DayRecord {
  date: string;           // YYYY-MM-DD
  earned: boolean;        // Did they earn a star?
  protected: boolean;     // Is this a streak-protected day?
  rotation: number;       // Random rotation for sticker effect (-15 to 15)
}

interface StarChartInput {
  goalName: Cell<Default<string, "Gold Star Goal">>;
  // Array of day records (last 30 days)
  days: Cell<Default<DayRecord[], []>>;
  // Is the "Award Star" button currently enabled? (parent pressed it)
  awardEnabled: Cell<Default<boolean, false>>;
  // Current view mode
  viewMode: Cell<Default<"main" | "corrections", "main">>;
  // Best streak ever achieved
  bestStreak: Cell<Default<number, 0>>;
  // Animation trigger counter (to restart celebrations)
  celebrationCount: Cell<Default<number, 0>>;
}
```

### Key Computeds

- `currentStreak`: Calculate from days data, accounting for protection
- `bestStreak`: Track max streak ever achieved
- `displayDays`: Last 30 days as array for rendering
- `milestoneReached`: Which milestones have been hit

### Animation Strategy

Adapt from reward-spinner:
- Use CSS keyframe animations for sparkle bursts
- Toggle animation class/key to restart animations
- Multiple sparkle elements at different angles/speeds
- Gold shimmer can be subtle gradient animation

## Design Decisions (Resolved)

1. **Past day editing:** Yes, via separate "Details/Corrections" view for parents
   - Main view optimized for daily star awarding
   - Corrections hidden away so kids focus on today

2. **Star placement flow:** Two-step parent-then-child process
   - Parent taps "Award Star" button to enable
   - Child taps to actually place the star
   - Makes it a collaborative celebration moment

3. **Star visual style:** "Magical stickers" aesthetic
   - Random slight rotation on each star (-15° to +15°)
   - Shimmer/glow effects (golden gradient animation)
   - Subtle jiggle animation (alive feeling)
   - Like real gold star stickers placed by a child

4. **Protected day visual:** Dimmed star, no magic effects

5. **Layout:** Vertical scrollable timeline (today at top)

6. **Scope:** One child/streak per charm instance

## Open Questions

1. How does streak protection trigger?
   - **Tentative:** Auto-protect if you had 3+ day streak and miss one day
   - Protection resets when you earn the next star

2. Week/month boundaries - any special visual treatment?
   - **Tentative:** Maybe subtle dividers or month labels

## Implementation Phases

### Phase 1: Core Structure ✅
- [x] Vertical timeline displaying days with stars
- [x] Basic day records with date display
- [x] Empty circles for unearned days (via ifElse)
- [x] Goal name display at top
- [x] Basic star emoji for earned days
- [x] Award button that adds stars for today

### Phase 2: Award Flow ✅
- [x] "Award Star" button for today
- [x] ~~Two-step flow (parent enables → child places)~~ Simplified to single tap
- [x] ~~awardEnabled state toggle~~ Removed, single tap adds star
- [x] Basic star placement on tap
- [x] Clear instructions for parent/child

### Phase 3: Magical Stars ✅
- [x] Random rotation per star (-15° to +15°, stored in record)
- [x] Golden shimmer CSS animation
- [x] Subtle jiggle animation
- [x] Glow/shadow effect
- [x] Sparkle burst on placement (8 particles with animation)

### Phase 3.5: Horizontal Timeline ✅
- [x] Horizontal scrollable timeline showing all 30 days
- [x] Dates displayed above each day slot
- [x] Stars for earned days, dashed circles for empty days
- [x] Uses derive() to pre-compute timeline data

### Phase 4: Streak System
- [ ] Current streak calculation
- [ ] Streak display prominently
- [ ] Best streak tracking
- [ ] Streak protection logic
- [ ] Dimmed star visual for protected days

### Phase 5: Celebrations
- [ ] Milestone detection (3, 7, 14, 30 days)
- [ ] Milestone celebration animations
- [ ] Celebration messages

### Phase 6: Corrections View
- [ ] Toggle to corrections/details view
- [ ] Simple list with toggle buttons
- [ ] Back navigation to main view

### Phase 7: Polish
- [ ] Goal name editing
- [ ] Smooth scrolling
- [ ] Month/week dividers
- [ ] Edge case handling

## References

- `reward-spinner.tsx` - Sparkle burst animations, slot machine effects
- patterns/examples/ - UI patterns and styling

---

## Session Notes

### 2025-11-30 - Debug Refactoring

**Changed debug approach from embedded panel to linked charm:**
- Removed embedded debug panel (toggle button, date picker, clear data button)
- Added `debugDate` input that can be linked to external date picker charm
- Added documentation in pattern comments explaining how to use linked charms for debugging
- This keeps the UI clean for end users while allowing debugging via CLI

**Key insight about computed() vs Cells:**
- Inside `computed()`, Cells use `.get()` to access values: `days.get()`
- Inside `computed()`, other computed values are accessed directly (no `.get()`): `effectiveToday as unknown as string`
- Cast to unknown then to target type for TypeScript when accessing computed values

**Phases 1-3 complete:**
- Core structure with vertical timeline
- Two-step award flow (parent enables, child places)
- Magical star effects (shimmer, jiggle, glow via CSS animations)
- Sparkle burst animation deferred for later

### 2025-12-01 - Horizontal Timeline & Simplification

**Simplified award flow:**
- Removed two-step parent/child flow
- Single tap on star button adds star immediately
- More intuitive for daily use

**Added sparkle burst animation:**
- 8 sparkle particles (✦) burst outward on star placement
- Star pops with scale/rotate animation
- Uses sparkleKey state to trigger animation replay

**Horizontal scrolling timeline:**
- Changed from vertical list of only starred days to horizontal scroll of ALL days
- Shows last 30 days with date labels above each slot
- Stars appear for earned days, dashed circles for empty days
- Uses derive() to pre-compute timeline data (avoid infinite loops from computed in map)

**Key insight about derive():**
- Inside derive callback, Cell parameters may still need .get() for arrays
- String cells may be unwrapped or not - use defensive check:
  `typeof val === "string" ? val : val?.get?.() ?? ""`

**Current charm ID:** baedreibqhryzc47fk3aaxbalyg36hmicozpcsb4glrl6ge7kqwciko6asa
