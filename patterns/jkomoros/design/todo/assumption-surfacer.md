# Assumption Surfacer Chatbot - PRD

## Overview

A chatbot pattern where a secondary LLM analyzes the primary LLM's responses in real-time to surface implicit assumptions. Users see these assumptions in a sidebar with clickable alternatives, allowing them to steer the conversation by correcting misunderstandings early.

## Problem Statement

LLMs make implicit assumptions when responding—about user intent, context, preferences, technical level, etc. Users often don't realize these assumptions exist until several exchanges deep, leading to wasted conversation turns and frustration. By surfacing assumptions proactively, users can course-correct immediately.

## Core Mechanics

### Dual-LLM Architecture

1. **Primary LLM**: Handles the main conversation (standard chatbot)
2. **Analyzer LLM**: Watches responses asynchronously, extracts assumptions

The analyzer runs continuously but asynchronously—it doesn't block the conversation. Assumptions appear in the sidebar as they're detected.

### Assumption Detection

The analyzer examines each assistant response (with full conversation context) and identifies:
- **Implicit assumptions** the LLM made
- **Alternative interpretations** (3 options per assumption)
- **Which alternative the LLM chose** (pre-selected in UI)

Variable number of assumptions per response based on complexity—could be 0-5+.

### User Context Notes

The system maintains a "user context" cell that accumulates notes about the user:
- Corrections they've made (e.g., "User prefers Python over JavaScript")
- Preferences revealed through alternative selections
- Explicit context they've shared

These notes are:
- Persisted across sessions
- Shared as hints to the analyzer (not mandatory constraints)
- Transparent to the user (can view/edit)

## User Experience

### Layout

```
┌─────────────────────────────────────┬──────────────────────┐
│                                     │   ASSUMPTIONS        │
│         CHAT AREA                   │                      │
│                                     │  ┌────────────────┐  │
│  User: How do I sort a list?        │  │ Language       │  │
│                                     │  │ ○ Python       │  │
│  Assistant: Here's how to sort...   │  │ ● JavaScript   │  │
│  [Python example shown]             │  │ ○ TypeScript   │  │
│                                     │  └────────────────┘  │
│                                     │                      │
│                                     │  ┌────────────────┐  │
│                                     │  │ Skill Level    │  │
│                                     │  │ ● Beginner     │  │
│                                     │  │ ○ Intermediate │  │
│                                     │  │ ○ Advanced     │  │
│                                     │  └────────────────┘  │
│                                     │                      │
├─────────────────────────────────────┤  [User Context]      │
│  [Message input]                    │  - Prefers concise   │
└─────────────────────────────────────┴──────────────────────┘
```

### Assumption Cards

Each assumption card shows:
- **Assumption label** (e.g., "Programming Language")
- **3 alternatives** as radio buttons
- **Pre-selected option** = what the LLM assumed
- Clicking a different option triggers a correction

### Correction Flow

When user clicks an alternative:
1. Auto-send a specially-styled message into the chat:
   ```
   Regarding programming language: TypeScript rather than JavaScript.
   ```
2. This message has distinct visual styling (different background, icon)
3. LLM responds to the correction naturally
4. User context notes updated: "User clarified: prefers TypeScript"

### User Context Panel

Collapsible section in sidebar showing accumulated context notes:
- View what the system has learned
- Edit/delete incorrect notes
- Notes influence future assumption analysis

## Data Model

### Core Types

```typescript
interface Assumption {
  id: string;
  label: string;                    // "Programming Language"
  description?: string;             // Context about why this matters
  alternatives: Alternative[];
  selectedIndex: number;            // Which one LLM assumed (pre-selected)
  messageId: string;                // Which message this relates to
  status: "active" | "resolved" | "dismissed";
}

interface Alternative {
  value: string;                    // "Python"
  description?: string;             // "General-purpose, beginner-friendly"
}

interface UserContextNote {
  id: string;
  content: string;                  // "Prefers TypeScript over JavaScript"
  source: "correction" | "explicit" | "inferred";
  createdAt: string;
  relatedAssumptionId?: string;
}

interface CorrectionMessage {
  type: "correction";
  originalAssumption: string;
  correctedTo: string;
}
```

### Cell Structure

```typescript
interface PatternInput {
  messages?: Cell<Default<BuiltInLLMMessage[], []>>;
  assumptions?: Cell<Default<Assumption[], []>>;
  userContext?: Cell<Default<UserContextNote[], []>>;
}
```

## Technical Implementation

### Analyzer Prompt

```
You are an assumption analyzer. Given a conversation and the latest assistant response, identify implicit assumptions the assistant made.

For each assumption:
1. Name it clearly (2-4 words)
2. Provide exactly 3 alternatives
3. Indicate which alternative the assistant assumed

Consider:
- User's technical level
- Domain/context assumptions
- Intent interpretations
- Preference assumptions
- Scope assumptions

User context notes (hints, not constraints):
{userContextNotes}

Output JSON array of assumptions.
```

### Async Analysis Pattern

Since `generateObject` must be called from pattern body:

```typescript
// Track which messages have been analyzed
const analyzedMessageIds = cell<Set<string>>(new Set());

// Computed that triggers analysis for new messages
const pendingAnalysis = computed(() => {
  const msgs = messages.get();
  const analyzed = analyzedMessageIds.get();

  // Find last assistant message not yet analyzed
  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i];
    if (msg.role === "assistant" && !analyzed.has(msg.id)) {
      return msg;
    }
  }
  return null;
});

// Analysis runs when pendingAnalysis changes
const analysisResult = generateObject<{ assumptions: Assumption[] }>({
  prompt: computed(() => buildAnalyzerPrompt(messages, pendingAnalysis, userContext)),
  system: ANALYZER_SYSTEM_PROMPT,
});

// When analysis completes, merge into assumptions cell
// and mark message as analyzed
```

### Correction Handler

```typescript
const selectAlternative = handler<
  { assumptionId: string; alternativeIndex: number },
  { addMessage: Stream<BuiltInLLMMessage>; assumptions: Cell<Assumption[]>; userContext: Cell<UserContextNote[]> }
>((event, { addMessage, assumptions, userContext }) => {
  const { assumptionId, alternativeIndex } = event;
  const assumption = assumptions.get().find(a => a.id === assumptionId);

  if (!assumption || alternativeIndex === assumption.selectedIndex) return;

  const selected = assumption.alternatives[alternativeIndex];
  const original = assumption.alternatives[assumption.selectedIndex];

  // Send correction message
  addMessage.send({
    role: "user",
    content: [{
      type: "text",
      text: `Regarding ${assumption.label.toLowerCase()}: ${selected.value} rather than ${original.value}.`
    }],
    metadata: { isCorrection: true }
  });

  // Update assumption status
  assumptions.update(list =>
    list.map(a => a.id === assumptionId
      ? { ...a, status: "resolved", selectedIndex: alternativeIndex }
      : a
    )
  );

  // Add to user context
  userContext.push({
    id: crypto.randomUUID(),
    content: `User clarified: prefers ${selected.value} over ${original.value} for ${assumption.label}`,
    source: "correction",
    createdAt: new Date().toISOString(),
    relatedAssumptionId: assumptionId
  });
});
```

## Future Enhancements (v2+)

### Crowdsourced Assumption Priors

Track which assumptions get corrected most often across all users:
- "70% of users correct 'beginner' to 'intermediate' for skill level"
- Feed these stats to analyzer as priors
- Better default selections over time

### Assumption Categories

Group assumptions by type for better organization:
- Technical context
- User preferences
- Intent/scope
- Domain knowledge

### Proactive Clarification

If an assumption has historically high correction rate, prompt user BEFORE answering:
- "Before I respond, are you working in Python or JavaScript?"

### Confidence Scores

Show analyzer confidence per assumption:
- High confidence = smaller UI treatment
- Low confidence = highlight for attention

## Known Issues & Workarounds

### Frame Mismatch Error with Nested Array Mapping (RESOLVED via different approach)

**Issue:** `patterns/jkomoros/issues/ISSUE-Frame-Mismatch-Nested-Array-JSX-Map.md`
**Superstition:** `community-docs/superstitions/2025-06-12-jsx-nested-array-map-frame-mismatch.md`

**Problem:** Mapping over `assumption.alternatives` in JSX triggers a "Frame mismatch" error.

**Resolution:** Instead of flattening into cells, we now display `generateObject` result directly in JSX. This avoids both the Frame mismatch bug AND the CPU loop bug (see below). The pattern iterates over `result.assumptions` and `assumption.alternatives` using regular for-loops inside a computed that returns JSX.

### CPU Loop with computed() calling .set() (RESOLVED)

**Superstition:** `community-docs/superstitions/2025-12-06-computed-set-causes-cpu-loop.md`

**Problem:** Using `computed()` to automatically copy `generateObject` results into cells causes 100% CPU loop.

**Resolution:** Don't copy `generateObject` results to cells. Instead:
1. Display `analysisResult.result` directly in JSX (it's already reactive)
2. Only store user CORRECTIONS in cells (mutations from handlers)
3. Merge result + corrections in computed for display

**Key pattern:**
```typescript
// Read generateObject result directly
const result = analysisResult.result;
const correctionsList = corrections.get();

// Merge for display
const selectedIndex = correction ? correction.correctedIndex : assumption.selectedIndex;
```

---

## Implementation Phases

### Phase 1: MVP
- [x] Define PRD (this document)
- [x] Basic chat with sidebar layout
- [x] Analyzer LLM integration
- [x] Workaround nested array Frame mismatch bug (avoided via direct result display)
- [x] Workaround CPU loop bug (don't copy generateObject to cells - see superstition)
- [x] Assumption cards with radio buttons
- [x] Correction message flow
- [x] Basic styling

### Phase 2: Context
- [x] User context notes cell
- [x] Context panel in sidebar
- [ ] Notes fed to analyzer
- [ ] Edit/delete notes

### Phase 3: Polish
- [ ] Assumption dismissal
- [ ] Message-to-assumption linking (highlight related)
- [ ] Loading states for async analysis
- [ ] Assumption history view

### Phase 4: Future
- [ ] Crowdsourced priors infrastructure
- [ ] Proactive clarification mode
- [ ] Confidence scores

## Decisions Made

1. **Analyzer model**: Haiku by default for speed/cost, toggleable in options to use same model as chat
2. **Assumption scrolling**: Sidebar scrolls in sync with chat—assumptions appear next to their related messages
3. **Pattern/branch name**: `assumption-surfacer`

## Open Questions

1. **Rate limiting**: How often to run analyzer if user sends rapid messages?
2. **Multi-assumption corrections**: Can user correct multiple at once?

## Success Metrics

- Reduced conversation turns to reach user's actual goal
- User engagement with assumption corrections
- Quality of analyzer's assumption detection
- User context note accuracy

---

*Created: 2024-12-06*
*Status: Draft PRD - Ready for review*
