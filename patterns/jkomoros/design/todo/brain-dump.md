# Brain Dump Pattern - Design Doc

## Purpose

A voice-first capture tool that showcases the **suggestions machinery** recently landed in labs. Users speak their thoughts, TODOs, and notes, and the system intelligently routes them to appropriate patterns (shopping lists, todo lists, notes, etc.) using AI-powered suggestions.

## Core Concept

**Voice Input → Transcription → Automatic Suggestion Processing → Smart Routing**

This is essentially a showcase for how the `Suggestion` pattern can automatically handle user intent without manual intervention, using voice as the input modality.

## User Stories

### Story 1: Multi-part Input
**User says:** "Remember to buy milk and call dentist"

**System does:**
- Transcribes: "Remember to buy milk and call dentist"
- Suggestion splits into two actions:
  - Adds "milk" to shopping list pattern
  - Adds "call dentist" to todo list pattern
- Shows in processed section:
  - "Added to Shopping List" (link)
  - "Added to Todo List" (link)

### Story 2: Append to Existing Pattern
**User says:** "Add to my grocery list: eggs, bread, and butter"

**System does:**
- Transcribes the text
- Suggestion identifies intent to append to existing pattern
- Searches for shopping/grocery list (similar to omnibot's pattern discovery)
- Adds items to that list
- Shows: "Added to Grocery List" (link)

### Story 3: Create New Pattern
**User says:** "Create a new note about the meeting tomorrow with Alice. We need to discuss budget and timeline."

**System does:**
- Transcribes the text
- Suggestion identifies intent to create new note
- Creates a new note.tsx pattern with the content
- Shows: "Created Note: Meeting with Alice" (link)

### Story 4: Ambiguous - Needs Attention
**User says:** "The project deadline is next Friday"

**System does:**
- Transcribes the text
- Suggestion can't confidently route it
- Marks as "needs attention" with a flag indicator
- User can manually process later or system shows suggestion cards for options

### Story 5: Pattern Not Found - Show Suggestion
**User says:** "Add milk to shopping list" (but no shopping list exists)

**System does:**
- Transcribes the text
- Suggestion tries to find shopping list, fails
- Shows a suggestion card: "Create Shopping List pattern and add 'milk'?" (Accept/Decline)
- If accepted, creates pattern and adds item
- If declined, stays in "needs attention"

## Data Structures

### TranscriptionEntry
```typescript
interface TranscriptionEntry {
  id: string;                    // Unique ID from ct-voice-input
  text: string;                  // Full transcription text
  duration: number;              // Recording duration (seconds)
  timestamp: number;             // Unix timestamp
  status: ProcessingStatus;      // See below
  processingResult?: ProcessingResult;
}
```

### ProcessingStatus
```typescript
type ProcessingStatus =
  | "unprocessed"    // Just captured, not yet processed
  | "processing"     // Suggestion is running
  | "processed"      // Successfully handled
  | "needs-attention" // Ambiguous or failed
```

### ProcessingResult
```typescript
interface ProcessingResult {
  actions: ProcessedAction[];    // What was done
  error?: string;                // If something went wrong
  suggestionCard?: SuggestionCard; // For manual approval if needed
}

interface ProcessedAction {
  type: "added" | "created" | "updated";
  targetPattern: string;         // Pattern name/type
  targetCell?: Cell<any>;        // Link to the actual pattern instance
  description: string;           // Human-readable: "Added to Shopping List"
}

interface SuggestionCard {
  description: string;           // "Create Shopping List and add 'milk'?"
  suggestedAction: Cell<any>;    // The suggestion result
}
```

## UI Layout

### Three Main Sections

1. **Voice Input Area** (top)
   - `<ct-voice-input>` component
   - Instructions: "Hold to record. Release to process automatically."
   - Shows waveform visualization while recording

2. **To Process** (middle)
   - List of items with status "unprocessed" or "needs-attention"
   - Each item shows:
     - Timestamp
     - Full transcription text
     - Status indicator (processing spinner, attention flag)
     - For "needs-attention": Show suggestion cards if available
   - Sorted by most recent first

3. **Processed** (bottom, collapsible)
   - List of successfully processed items
   - Each item shows:
     - Timestamp
     - Original transcription text (truncated with expand)
     - Actions taken with links
     - Example: "Added to Shopping List, Created Todo"
   - Sorted by most recent first
   - Initially collapsed to focus on unprocessed items

## Technical Implementation

### Component Structure

```typescript
const BrainDump = pattern(({ title }) => {
  // State
  const transcriptions = cell<TranscriptionEntry[]>([]);
  const currentTranscription = cell<TranscriptionData | null>(null);

  // Computed
  const unprocessed = computed(() =>
    transcriptions.filter(t =>
      t.status === "unprocessed" ||
      t.status === "processing" ||
      t.status === "needs-attention"
    )
  );

  const processed = computed(() =>
    transcriptions.filter(t => t.status === "processed")
  );

  // Handlers
  const handleTranscriptionComplete = handler(...)
  const processCapturedVoice = handler(...)
  const dismissEntry = handler(...)
  const acceptSuggestion = handler(...)

  return { ... }
});
```

### Suggestion Integration

When a new transcription completes:

1. **Create TranscriptionEntry** with status "processing"
2. **Invoke Suggestion pattern:**
   ```typescript
   const suggestion = Suggestion({
     situation: `User said: "${transcription.text}". Route this to appropriate patterns (shopping list, todo list, notes, etc.) or split into multiple actions if needed.`,
     context: {
       transcriptionText: transcription.text,
       timestamp: transcription.timestamp,
       // Possibly: availablePatterns from pattern index
     }
   });
   ```

3. **Watch suggestion result:**
   - On success: Update status to "processed", store actions
   - On failure/ambiguous: Update status to "needs-attention", store suggestion card if available

4. **Render results** in appropriate section

### Key Technical Details

- **ct-voice-input**: Use "hold" recording mode with autoTranscribe
- **Suggestion pattern**: Import from labs/packages/patterns/suggestion.tsx
- **Pattern discovery**: Leverage omnibot's approach (listPatternIndex, fetchAndRunPattern tools)
- **Reactivity**: Use computed() for filtering transcriptions into sections
- **Cell references**: Store Cell<any> references to created/modified patterns for linking

## Future Enhancements (Post-MVP)

- **Voice feedback**: Text-to-speech confirmation of actions
- **Batch processing**: Process multiple unprocessed items at once
- **Custom routing rules**: User-defined keywords → patterns
- **Search/filter**: Search through processed items
- **Export**: Export all transcriptions as text/JSON
- **Templates**: Common patterns like "Daily standup notes"

## Open Questions for Implementation

1. **Todo list source**: Look for existing todo-list.tsx in labs, or create minimal one?
2. **Suggestion timeout**: How long to wait before marking as "needs-attention"?
3. **Multiple actions**: If suggestion splits one input into multiple actions, how to represent in UI?
4. **Pattern linking**: Best way to create clickable links to pattern instances?
5. **Error handling**: What if suggestion throws error vs. returns "couldn't process"?

## Success Criteria

A successful MVP should demonstrate:
- Voice capture works reliably
- Transcription is accurate
- Suggestions automatically route to appropriate patterns
- User can see what happened to each voice input
- System gracefully handles ambiguous inputs
- Acts as clear showcase for suggestion machinery

## Next Steps

1. Check labs for existing todo-list and shopping-list patterns
2. Implement basic UI structure with three sections
3. Wire up ct-voice-input and capture transcriptions
4. Integrate Suggestion pattern for processing
5. Test with various user stories
6. Iterate on UI/UX based on testing
