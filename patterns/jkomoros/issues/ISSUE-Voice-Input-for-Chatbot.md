# Voice Input for Chatbot Pattern

## Summary

Add optional voice input support to the `chatbot.tsx` pattern in labs, enabling voice-to-text for omnibot and any pattern using Chatbot.

## Current State

- `ct-voice-input` component exists and works well
  - Location: `/packages/ui/src/v2/components/ct-voice-input/ct-voice-input.ts`
  - Features: hold or toggle recording, auto-transcription via Whisper, returns text + timestamps
- `chatbot.tsx` and `omnibox-fab.tsx` have **no voice input**
- Users must type all interactions with omnibot

## Proposed Solution

### Option C: Add `showVoice` prop to Chatbot pattern (Recommended)

Add an opt-in `showVoice?: boolean` prop that includes `ct-voice-input` alongside `ct-prompt-input`.

### Implementation

**1. Update chatbot.tsx type:**

```tsx
type ChatInput = {
  messages?: Cell<Default<Array<BuiltInLLMMessage>, []>>;
  tools?: any;
  theme?: any;
  system?: string;
  showVoice?: boolean;  // NEW: Enable voice input
};
```

**2. Add voice transcription handler:**

```tsx
interface TranscriptionData {
  id: string;
  text: string;
  chunks?: { timestamp: [number, number]; text: string }[];
  duration: number;
  timestamp: number;
}

const handleVoiceTranscription = handler<
  { detail: { transcription: TranscriptionData } },
  { addMessage: Stream<BuiltInLLMMessage> }
>(({ detail: { transcription } }, { addMessage }) => {
  const text = transcription.text?.trim();
  if (text) {
    addMessage.send({
      role: "user",
      content: [{ type: "text", text }],
    });
  }
});
```

**3. Modify promptInput rendering (~line 208):**

```tsx
const promptInput = showVoice ? (
  <ct-hstack align="center" gap="tight" style="width: 100%;">
    <ct-voice-input
      recordingMode="toggle"
      showWaveform={false}
      autoTranscribe
      onct-transcription-complete={handleVoiceTranscription({ addMessage })}
      style="flex-shrink: 0;"
    />
    <ct-prompt-input
      style="flex: 1;"
      slot="footer"
      placeholder="Ask the LLM a question..."
      pending={pending}
      $mentionable={mentionable}
      modelItems={items}
      $model={model}
      onct-send={sendMessage({ addMessage })}
      onct-stop={cancelGeneration}
    />
  </ct-hstack>
) : (
  <ct-prompt-input
    slot="footer"
    placeholder="Ask the LLM a question..."
    pending={pending}
    $mentionable={mentionable}
    modelItems={items}
    $model={model}
    onct-send={sendMessage({ addMessage })}
    onct-stop={cancelGeneration}
  />
);
```

**4. Enable voice in omnibox-fab.tsx:**

```tsx
const omnibot = Chatbot({
  system: "You are a polite but efficient assistant...",
  tools: { ... },
  showVoice: true,  // Enable voice for omnibot
});
```

## UX Considerations

### Voice Button Placement

The microphone button should appear to the left of the text input, similar to how many chat apps handle it. This keeps the "send" action on the right (expected location) and adds voice as an alternative input method on the left.

### Recording Mode

`toggle` mode (click to start, click to stop) is recommended over `hold` mode for chat:
- Works better on desktop (no need to hold mouse button)
- Clearer state indication (button shows recording status)
- Users can take their time speaking

### Voice-to-Chat Flow

1. User clicks microphone button
2. Recording starts (button shows recording indicator)
3. User speaks their message
4. User clicks button again to stop
5. Audio is transcribed via Whisper
6. Transcription is automatically sent as a user message
7. LLM processes and responds

No intermediate "review" step - voice goes directly to chat. This matches the existing text input behavior (Enter sends immediately).

## Alternative Approaches Considered

### Option A: Always show voice in all chatbots

**Rejected:** Too aggressive. Many chatbot uses are desktop-only where voice isn't needed.

### Option B: Modify only omnibox-fab.tsx

**Rejected:** Voice-to-chat pattern isn't reusable. Other patterns using Chatbot would need to duplicate the implementation.

### Option D: New composite component

**Rejected:** Unnecessary complexity. The existing components can be composed without a new wrapper.

## Files to Modify

| File | Changes |
|------|---------|
| `packages/patterns/chatbot.tsx` | Add `showVoice` prop, voice handler, conditional rendering (~20 lines) |
| `packages/patterns/omnibox-fab.tsx` | Add `showVoice: true` to Chatbot call (1 line) |

## Related Components

- `/packages/ui/src/v2/components/ct-voice-input/ct-voice-input.ts` - Already exists, production-ready
- `/packages/patterns/voice-note.tsx` - Example pattern using ct-voice-input
- `/packages/toolshed/routes/ai/voice/` - Transcription API (FAL AI Whisper)

## Future Enhancements

1. **Voice indicator in chat log**: Show which messages came from voice vs typed
2. **Streaming transcription**: Show transcription as it's being processed
3. **Voice response**: TTS for assistant responses (full voice assistant experience)
4. **Wake word**: "Hey Omnibot" to start voice recording hands-free
