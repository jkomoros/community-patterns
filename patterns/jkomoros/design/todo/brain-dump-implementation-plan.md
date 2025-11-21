# Brain Dump - Implementation Plan

## Research Summary

### Existing Patterns Found
- **note.tsx** - `/Users/alex/Code/labs/packages/patterns/note.tsx:107` - For creating notes
- **todo-list.tsx** - `patterns/examples/todo-list.tsx:28` - For todo items
- **ct-list.tsx** - `/Users/alex/Code/labs/packages/patterns/ct-list.tsx:15` - Generic list (can be shopping list)
- **Suggestion** - `/Users/alex/Code/labs/packages/patterns/suggestion.tsx:17` - AI routing pattern

### Key Technical APIs

**fetchAndRunPattern** (`common-tools.tsx:219`):
```typescript
fetchAndRunPattern({ url, args })
// Returns: { cell: Cell<any>, error }
// Instantiates a pattern and returns cell reference
```

**listPatternIndex** (`common-tools.tsx:266`):
```typescript
listPatternIndex()
// Returns: { result: string } (markdown index)
```

**navigateTo** (`common-tools.tsx:251`):
```typescript
navigateTo(cell)
// Navigates to pattern's UI
```

**Suggestion Pattern** (`suggestion.tsx:17`):
```typescript
Suggestion({ situation: string, context: object })
// Uses generateObject with tools to decide action
// Returns: { cell: Cell<any> } or undefined if pending
```

**ct-voice-input** (`ct-voice-input.ts:71`):
```typescript
<ct-voice-input
  $transcription={transcriptionCell}
  recordingMode="hold"
  autoTranscribe={true}
  maxDuration={120}
  showWaveform={true}
  onct-transcription-complete={handler}
/>
// Fires ct-transcription-complete with:
// { detail: { transcription: TranscriptionData } }
```

## Implementation Steps

### Phase 1: Basic Structure (MVP)

#### 1.1: Set up pattern skeleton
```typescript
import {
  Cell,
  cell,
  computed,
  Default,
  derive,
  handler,
  ifElse,
  NAME,
  pattern,
  UI,
} from "commontools";
import { Suggestion } from "../../../labs/packages/patterns/suggestion.tsx";

interface TranscriptionEntry {
  id: string;
  text: string;
  duration: number;
  timestamp: number;
  status: "unprocessed" | "processing" | "processed" | "needs-attention";
  processingResult?: ProcessingResult;
}

interface ProcessingResult {
  actions: ProcessedAction[];
  error?: string;
  suggestionCell?: Cell<any>;
}

interface ProcessedAction {
  type: "added" | "created" | "updated";
  targetPattern: string;
  targetCell?: Cell<any>;
  description: string;
}

const BrainDump = pattern(({ title }) => {
  const transcriptions = cell<TranscriptionEntry[]>([]);
  const currentTranscription = cell<TranscriptionData | null>(null);

  // ... handlers and UI

  return {
    [NAME]: title,
    [UI]: <ct-screen>...</ct-screen>,
    transcriptions,
  };
});
```

#### 1.2: Wire up ct-voice-input
```typescript
const handleTranscriptionComplete = handler<
  { detail: { transcription: TranscriptionData } },
  { transcriptions: Cell<TranscriptionEntry[]> }
>(({ detail }, { transcriptions }) => {
  const entry: TranscriptionEntry = {
    id: detail.transcription.id,
    text: detail.transcription.text,
    duration: detail.transcription.duration,
    timestamp: detail.transcription.timestamp,
    status: "processing",
  };

  transcriptions.push(entry);

  // Trigger processing (Phase 2)
});
```

#### 1.3: Build UI layout with three sections
```typescript
const unprocessed = computed(() =>
  transcriptions.get().filter(t =>
    t.status === "unprocessed" ||
    t.status === "processing" ||
    t.status === "needs-attention"
  )
);

const processed = computed(() =>
  transcriptions.get().filter(t => t.status === "processed")
);

// UI:
<ct-screen>
  <div slot="header">...</div>

  <ct-vstack gap="3">
    {/* Section 1: Voice Input */}
    <ct-card>
      <ct-voice-input
        $transcription={currentTranscription}
        recordingMode="hold"
        autoTranscribe
        onct-transcription-complete={handleTranscriptionComplete({ transcriptions })}
      />
    </ct-card>

    {/* Section 2: To Process */}
    {ifElse(
      computed(() => unprocessed.get().length > 0),
      <ct-card>
        <h3>To Process</h3>
        {unprocessed.map((entry) => (
          <TranscriptionEntryView entry={entry} />
        ))}
      </ct-card>,
      null
    )}

    {/* Section 3: Processed (collapsible) */}
    {ifElse(
      computed(() => processed.get().length > 0),
      <ct-card>
        <ct-chevron-button ... />
        {/* Processed items list */}
      </ct-card>,
      null
    )}
  </ct-vstack>
</ct-screen>
```

### Phase 2: Suggestion Integration

#### 2.1: Process transcription with Suggestion
```typescript
const processTranscription = (entry: TranscriptionEntry) => {
  const situation = `
User spoke: "${entry.text}"

Your task: Route this voice input to appropriate patterns.
- If it mentions shopping/groceries: add to shopping list
- If it's a task/todo: add to todo list
- If it's a note/thought: create a new note
- If it contains multiple intents: split into multiple actions
- If unclear: return suggestion for user to approve

Available actions:
- fetchAndRunPattern to instantiate patterns
- listPatternIndex to see what's available
- navigateTo to show created patterns
`;

  const suggestion = Suggestion({
    situation,
    context: {
      transcriptionText: entry.text,
      timestamp: entry.timestamp,
    },
  });

  // Watch suggestion result with derive
  return derive(suggestion, (result) => {
    if (!result) return; // Still pending

    if (result.cell) {
      // Success! Update entry status
      updateTranscriptionStatus(entry.id, "processed", {
        actions: [{
          type: "created",
          targetPattern: "Unknown", // Extract from result
          targetCell: result.cell,
          description: "Processed successfully",
        }],
      });
    } else {
      // Failed or ambiguous
      updateTranscriptionStatus(entry.id, "needs-attention", {
        error: "Could not process automatically",
        suggestionCell: result.cell,
      });
    }
  });
};
```

#### 2.2: Update transcription status helper
```typescript
const updateTranscriptionStatus = (
  id: string,
  status: TranscriptionEntry["status"],
  processingResult?: ProcessingResult
) => {
  const entries = transcriptions.get();
  const index = entries.findIndex(e => e.id === id);
  if (index >= 0) {
    const updated = [...entries];
    updated[index] = {
      ...updated[index],
      status,
      processingResult,
    };
    transcriptions.set(updated);
  }
};
```

### Phase 3: Display Results

#### 3.1: TranscriptionEntryView component
```typescript
const TranscriptionEntryView = ({ entry }: { entry: TranscriptionEntry }) => {
  const statusIcon = {
    unprocessed: "⏳",
    processing: "🔄",
    processed: "✅",
    "needs-attention": "⚠️",
  }[entry.status];

  const timestamp = new Date(entry.timestamp).toLocaleString();

  return (
    <div style={{ padding: "1rem", borderBottom: "1px solid #eee" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span>{statusIcon}</span>
        <small style={{ color: "#666" }}>{timestamp}</small>
      </div>

      <p style={{ margin: "0.5rem 0" }}>{entry.text}</p>

      {entry.status === "processed" && entry.processingResult && (
        <div style={{ marginTop: "0.5rem" }}>
          {entry.processingResult.actions.map((action) => (
            <div style={{ fontSize: "0.9em", color: "#0066cc" }}>
              {action.description}
              {action.targetCell && (
                <ct-button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateTo(action.targetCell)}
                >
                  View →
                </ct-button>
              )}
            </div>
          ))}
        </div>
      )}

      {entry.status === "needs-attention" && entry.processingResult?.suggestionCell && (
        <div style={{ marginTop: "0.5rem" }}>
          {/* Show suggestion card for manual approval */}
          <ct-button onClick={/* accept suggestion */}>
            Accept Suggestion
          </ct-button>
        </div>
      )}
    </div>
  );
};
```

### Phase 4: Polish & Error Handling

#### 4.1: Handle Suggestion errors gracefully
- Timeout after 30 seconds
- Show error message in UI
- Allow retry

#### 4.2: Add manual actions
- Delete entry
- Retry processing
- Manually route to pattern

#### 4.3: Improve Suggestion prompt
- Include more context about available patterns
- Better examples of splitting multi-part inputs
- Clear success/failure criteria

## Open Implementation Questions

1. **Import path for Suggestion**: Should we use relative import or copy to lib/?
2. **Pattern URL format**: How to construct URL for fetchAndRunPattern? (e.g., "/api/patterns/note.tsx")
3. **Suggestion response format**: What exactly does Suggestion return? Need to test.
4. **Cell linking**: How to extract pattern name/title from result cell?
5. **Multiple actions**: If Suggestion splits into multiple patterns, how to represent in result?

## Testing Plan

### Test Cases
1. **Simple shopping item**: "Buy milk" → Add to shopping list
2. **Simple todo**: "Call dentist" → Add to todo list
3. **Multi-part**: "Buy milk and call dentist" → Split into two actions
4. **Create note**: "Note about meeting: discuss budget" → Create new note
5. **Ambiguous**: "Project deadline Friday" → Needs attention
6. **No pattern exists**: "Add to shopping list" (no list exists) → Show suggestion to create

### Manual Testing Steps
1. Deploy pattern with `deno task ct charm new`
2. Test voice recording and transcription
3. Verify Suggestion processing
4. Check UI updates correctly
5. Test navigation to created patterns
6. Test error cases

## Next Steps

1. Start with Phase 1: Basic structure + voice input
2. Test transcription capture works
3. Add Phase 2: Suggestion integration (may need iteration)
4. Add Phase 3: Results display
5. Polish and test edge cases
