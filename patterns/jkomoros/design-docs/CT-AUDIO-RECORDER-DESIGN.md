# ct-audio-recorder Component Design

## Overview

A trusted UI component that enables voice recording and real-time transcription in CommonTools patterns. Similar to `ct-image-input`, this component handles browser APIs that patterns cannot access directly (MediaRecorder, getUserMedia) and provides transcribed text via reactive cells.

## Visual Design

### Microphone Button (Idle State)
```
┌───────────┐
│     🎤    │
│           │
└───────────┘
```

**Security Note:** Button always displays microphone icon - no custom text allowed to prevent misleading users about recording.

### Recording State (Animated)
```
┌─────────────────────┐
│  🔴 Recording...     │
│  ▂▃▅▇▅▃▂  0:03      │
│  Release to finish   │
└─────────────────────┘
```

- Animated waveform visualization showing audio input levels
- Timer showing recording duration
- Red pulsing indicator

### Processing State
```
┌─────────────────────┐
│  ⏳ Transcribing...  │
│  ▂▃▅▇▅▃▂           │
└─────────────────────┘
```

### Completed State
```
┌─────────────────────┐
│  ✓ Transcribed       │
│  Hold to re-record   │
└─────────────────────┘
```

## Component API

### Element Definition
```typescript
<ct-audio-recorder
  $transcription={transcription}
  recordingMode="hold"
  autoTranscribe={true}
  maxDuration={60}
  showWaveform={true}
/>
```

### Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `transcription` | `Cell<TranscriptionData \| TranscriptionData>` | - | Cell for bidirectional transcription binding |
| `recordingMode` | `"hold" \| "toggle"` | `"hold"` | Hold button to record, or click to start/stop |
| `autoTranscribe` | `boolean` | `true` | Automatically transcribe when recording stops |
| `maxDuration` | `number` | `60` | Max recording duration in seconds |
| `showWaveform` | `boolean` | `true` | Show audio waveform visualization |
| `disabled` | `boolean` | `false` | Disable recording |

### Data Structures

```typescript
interface TranscriptionChunk {
  timestamp: [number, number];  // [start_seconds, end_seconds]
  text: string;
}

interface TranscriptionData {
  id: string;                    // Unique ID for this recording
  text: string;                  // Full transcription text
  chunks?: TranscriptionChunk[]; // Timestamped segments
  audioData?: string;            // Base64 audio data (optional)
  duration: number;              // Recording duration in seconds
  timestamp: number;             // Unix timestamp when recorded
}
```

### Events

| Event | Detail | Description |
|-------|--------|-------------|
| `ct-recording-start` | `{ timestamp: number }` | Recording started |
| `ct-recording-stop` | `{ duration: number, audioData: Blob }` | Recording stopped |
| `ct-transcription-start` | `{ id: string }` | Transcription request sent |
| `ct-transcription-complete` | `{ transcription: TranscriptionData }` | Transcription received |
| `ct-transcription-error` | `{ error: Error, message: string }` | Transcription failed |

## Technical Implementation

### 1. Recording Flow

```typescript
class CTAudioRecorder extends BaseElement {
  // Cell controller for bidirectional binding
  private _cellController = createCellController<TranscriptionData>(this, {
    timing: { strategy: "immediate" },
    onChange: (newValue) => {
      this.emit("ct-change", { transcription: newValue });
    },
  });

  private mediaRecorder?: MediaRecorder;
  private audioChunks: Blob[] = [];
  private startTime?: number;

  async startRecording() {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      }
    });

    // Create MediaRecorder with appropriate codec
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    this.audioChunks = [];
    this.startTime = Date.now();

    // Collect audio chunks
    this.mediaRecorder.ondataavailable = (event) => {
      this.audioChunks.push(event.data);
    };

    // Handle recording completion
    this.mediaRecorder.onstop = () => {
      this.processRecording();
    };

    this.mediaRecorder.start();
    this.emit("ct-recording-start", { timestamp: this.startTime });
  }

  async processRecording() {
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const duration = (Date.now() - this.startTime!) / 1000;

    this.emit("ct-recording-stop", { duration, audioData: audioBlob });

    if (this.autoTranscribe) {
      await this.transcribeAudio(audioBlob);
    }
  }
}
```

### 2. Transcription Flow

```typescript
async transcribeAudio(audioBlob: Blob) {
  const id = this._generateId();
  this.emit("ct-transcription-start", { id });

  try {
    // Convert to WAV if needed (webm might not be supported)
    const wavBlob = await this.convertToWav(audioBlob);

    // Send to transcription API
    const response = await fetch('/api/ai/voice/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/wav',
      },
      body: wavBlob,
    });

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.statusText}`);
    }

    const result = await response.json();

    // Create transcription data
    const transcriptionData: TranscriptionData = {
      id,
      text: result.transcription,
      chunks: result.chunks,
      duration: this.recordingDuration,
      timestamp: Date.now(),
      // Optionally include audio data
      audioData: await this.blobToBase64(audioBlob),
    };

    // Update cell via controller
    this._cellController.setValue(transcriptionData);

    this.emit("ct-transcription-complete", { transcription: transcriptionData });

  } catch (error) {
    this.emit("ct-transcription-error", {
      error,
      message: error.message
    });
  }
}
```

### 3. Waveform Visualization

```typescript
private setupWaveformVisualization(stream: MediaStream) {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const microphone = audioContext.createMediaStreamSource(stream);

  microphone.connect(analyser);
  analyser.fftSize = 256;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  const draw = () => {
    if (!this.recording) return;

    analyser.getByteFrequencyData(dataArray);

    // Update waveform visualization
    this.waveformData = Array.from(dataArray).slice(0, 8);
    this.requestUpdate();

    requestAnimationFrame(draw);
  };

  draw();
}
```

## Usage in Patterns

### Basic Usage: Simple Transcription

```typescript
/// <cts-enable />
import { pattern, UI, NAME, Cell, Default } from "commontools";

interface Input {
  transcription: Cell<Default<TranscriptionData, null>>;
}

export default pattern<Input>(({ transcription }) => {
  return {
    [NAME]: "Voice Note",
    [UI]: (
      <div>
        <ct-audio-recorder
          $transcription={transcription}
          recordingMode="hold"
        />

        {transcription && (
          <div style={{ marginTop: "1rem" }}>
            <strong>Transcription:</strong>
            <p>{transcription.text}</p>
            <small>Duration: {transcription.duration}s</small>
          </div>
        )}
      </div>
    ),
    transcription,
  };
});
```

### Advanced Usage: Multiple Recordings

```typescript
interface VoiceNote {
  id: string;
  text: string;
  timestamp: number;
  duration: number;
}

interface Input {
  notes: Cell<Default<VoiceNote[], []>>;
}

export default pattern<Input>(({ notes }) => {
  const currentRecording = Cell.of<TranscriptionData | null>(null);

  // Handler to save recording to notes list
  const saveRecording = handler<
    { detail: { transcription: TranscriptionData } },
    { notes: Cell<VoiceNote[]>, currentRecording: Cell<TranscriptionData | null> }
  >(
    (event, { notes, currentRecording }) => {
      const transcription = event.detail.transcription;

      notes.push({
        id: transcription.id,
        text: transcription.text,
        timestamp: transcription.timestamp,
        duration: transcription.duration,
      });

      // Clear current recording
      currentRecording.set(null);
    }
  );

  return {
    [NAME]: "Voice Notes",
    [UI]: (
      <div>
        <ct-audio-recorder
          $transcription={currentRecording}
          onct-transcription-complete={saveRecording({ notes, currentRecording })}
        />

        <div style={{ marginTop: "2rem" }}>
          <h3>Saved Notes ({notes.length})</h3>
          {notes.map((note) => (
            <div style={{
              padding: "1rem",
              marginBottom: "0.5rem",
              border: "1px solid #ddd",
              borderRadius: "4px"
            }}>
              <p>{note.text}</p>
              <small>
                {new Date(note.timestamp).toLocaleString()}
                · {note.duration}s
              </small>
            </div>
          ))}
        </div>
      </div>
    ),
    notes,
  };
});
```

### Integration with LLM

```typescript
/// <cts-enable />
import { pattern, UI, NAME, Cell, Default, generateText } from "commontools";

interface Input {
  transcription: Cell<Default<TranscriptionData, null>>;
}

export default pattern<Input>(({ transcription }) => {
  // Generate AI response based on transcription
  const aiResponse = transcription?.text
    ? generateText({
        prompt: transcription.text,
        system: "You are a helpful assistant. Respond to the user's voice message.",
      })
    : null;

  return {
    [NAME]: "Voice AI Assistant",
    [UI]: (
      <div>
        <ct-audio-recorder
          $transcription={transcription}
        />

        {transcription && (
          <div style={{ marginTop: "1rem" }}>
            <div style={{
              padding: "1rem",
              backgroundColor: "#f0f9ff",
              borderRadius: "8px"
            }}>
              <strong>You said:</strong>
              <p>{transcription.text}</p>
            </div>

            {aiResponse && (
              <div style={{
                padding: "1rem",
                marginTop: "1rem",
                backgroundColor: "#f0fdf4",
                borderRadius: "8px"
              }}>
                <strong>AI Response:</strong>
                {aiResponse.pending ? (
                  <p>Thinking...</p>
                ) : aiResponse.error ? (
                  <p>Error: {aiResponse.error}</p>
                ) : (
                  <p>{aiResponse.result}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    ),
    transcription,
  };
});
```

## Browser Compatibility

### Required APIs
- **MediaDevices.getUserMedia()** - For microphone access
- **MediaRecorder** - For audio recording
- **AudioContext** - For waveform visualization (optional)
- **Fetch API** - For transcription requests

### Supported Formats
- **Preferred**: WAV (PCM) - Best compatibility with transcription API
- **Fallback**: WebM (Opus) - Convert to WAV before sending

### Error Handling
```typescript
try {
  await navigator.mediaDevices.getUserMedia({ audio: true });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    // User denied permission
    this.emit("ct-error", {
      error,
      message: "Microphone permission denied"
    });
  } else if (error.name === 'NotFoundError') {
    // No microphone found
    this.emit("ct-error", {
      error,
      message: "No microphone found"
    });
  } else {
    // Other error
    this.emit("ct-error", {
      error,
      message: `Failed to access microphone: ${error.message}`
    });
  }
}
```

## Implementation Phases

### Phase 1: Basic Recording
- [ ] Microphone permission handling
- [ ] Start/stop recording with MediaRecorder
- [ ] Basic button UI (hold to record)
- [ ] Audio blob collection
- [ ] Duration tracking

### Phase 2: Transcription
- [ ] API integration with `/api/ai/voice/transcribe`
- [ ] Audio format conversion (WebM → WAV)
- [ ] Cell binding with CellController
- [ ] Event emission (ct-transcription-complete, etc.)
- [ ] Error handling

### Phase 3: Visual Polish
- [ ] Waveform visualization with AudioContext
- [ ] Recording state animations
- [ ] Timer display
- [ ] Pending/processing states
- [ ] Error state UI

### Phase 4: Advanced Features
- [ ] Toggle recording mode
- [ ] Playback of recorded audio
- [ ] Volume indicator
- [ ] Keyboard shortcuts (spacebar to record)
- [ ] Save audio data option

## Open Questions

1. **Audio Format**: Should we always convert to WAV, or try WebM first and fallback?
   - **Recommendation**: Always convert to WAV (16kHz, mono) for best compatibility

2. **Max Duration**: What's reasonable default? (Current: 60 seconds)
   - **Consideration**: API costs, storage, UX for long recordings

3. **Waveform Style**: Should match CommonTools design system
   - **Options**: Bar chart, line graph, circular meter

4. **Cell Binding**: Single transcription vs. array of recordings?
   - **Recommendation**: Support both - `$transcription` for single, `$transcriptions` for array

5. **Audio Storage**: Should we include raw audio data in the cell?
   - **Pro**: Allows playback, re-transcription
   - **Con**: Large data size, storage concerns
   - **Recommendation**: Make it optional via `includeAudio` property

6. **Streaming Transcription**: Should we support progressive transcription?
   - **Not in v1**: API doesn't support streaming, adds complexity
   - **Future**: Could add if API supports WebSocket streaming

## Security Considerations

- Component runs in trusted context (not sandboxed)
- Microphone permission prompt handled by browser
- Audio data sent to CommonTools backend (not third-party)
- No PII should be logged during transcription
- Transcription cached by audio hash (privacy consideration)

## Testing Strategy

### Unit Tests
- MediaRecorder mock
- Audio format conversion
- Cell binding
- Event emission

### Integration Tests
- Real microphone recording (requires user interaction)
- Transcription API integration
- Error scenarios (no mic, denied permission, API failure)

### Manual Testing
- Test on Chrome, Firefox, Safari
- Mobile browser testing (iOS Safari, Chrome Mobile)
- Different microphone types
- Background noise handling
