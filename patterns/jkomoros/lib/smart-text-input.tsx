/// <cts-enable />
import {
  cell,
  Cell,
  computed,
  Default,
  derive,
  generateObject,
  ifElse,
  ImageData,
} from "commontools";

/**
 * SmartTextInput - Companion sub-pattern for ImportReview
 *
 * Handles multi-image upload with OCR, automatically concatenating
 * extracted text into a target Cell.
 *
 * Key features:
 * - Multi-image upload via ct-image-input
 * - Parallel OCR extraction using .map() pattern from store-mapper.tsx
 * - Auto-concatenate mode: OCR results automatically append to $value
 * - Auto-hide: Images disappear after their text is added
 * - Soft-delete pattern (hiddenImageIds) avoids array mutation bugs
 *
 * Usage:
 *   const notes = cell<string>("");
 *   const smartInput = SmartTextInput({ $value: notes });
 *
 *   // Full drop-in component
 *   {smartInput.ui.complete}
 *
 *   // Or compose individual pieces
 *   {smartInput.ui.textArea}
 *   {smartInput.ui.uploadArea}
 *   {smartInput.ui.imageList}
 */

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

interface SmartTextInputInput {
  // Required: Target text cell (bound bidirectionally)
  $value: Cell<Default<string, "">>;

  // Optional configuration
  placeholder?: string; // Default: "Type, paste, or upload images..."
  maxImages?: number; // Default: 50
  ocrPrompt?: string; // Custom prompt for image text extraction
  separator?: string; // Default: "\n\n---\n\n"
}

interface ImageResult {
  id: string; // Unique ID for the image
  name: string; // Original filename
  thumbnail: string; // Base64 data URL for preview
  pending: boolean; // OCR in progress
  error: unknown; // Error if failed
  extractedText: string | null; // OCR result (null until complete)
  committed: boolean; // True after text appended to $value
  hidden: boolean; // True after auto-hide
}

interface SmartTextInputOutput {
  // State (reactive)
  value: Cell<Default<string, "">>; // Same as input $value
  pendingCount: number; // Number of images being processed
  anyPending: boolean; // True if any OCR in progress

  // Image tracking
  imageResults: ImageResult[]; // Per-image status and results

  // Pre-composed UI components (chatbot.tsx pattern)
  ui: {
    complete: JSX.Element; // Full drop-in component
    textArea: JSX.Element; // Just the textarea
    uploadArea: JSX.Element; // Just the image upload button
    imageList: JSX.Element; // Thumbnails with status
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PLACEHOLDER = "Type, paste, or upload images...";
const DEFAULT_MAX_IMAGES = 50;
const DEFAULT_OCR_PROMPT = "Extract all text from this image exactly as written. Return the text verbatim.";
const DEFAULT_SEPARATOR = "\n\n---\n\n";

const OCR_SCHEMA = {
  type: "object" as const,
  properties: {
    text: {
      type: "string" as const,
      description: "The extracted text from the image",
    },
  },
  required: ["text"],
};

// ═══════════════════════════════════════════════════════════════════════════
// SMART TEXT INPUT SUB-PATTERN
// ═══════════════════════════════════════════════════════════════════════════

export function SmartTextInput(
  input: SmartTextInputInput
): SmartTextInputOutput {
  const {
    $value,
    placeholder = DEFAULT_PLACEHOLDER,
    maxImages = DEFAULT_MAX_IMAGES,
    ocrPrompt = DEFAULT_OCR_PROMPT,
    separator = DEFAULT_SEPARATOR,
  } = input;

  // ═══════════════════════════════════════════════════════════════════════
  // 1. IMAGE STATE (soft-delete pattern from store-mapper.tsx)
  // ═══════════════════════════════════════════════════════════════════════

  const uploadedImages = cell<ImageData[]>([]); // From ct-image-input
  const hiddenImageIds = cell<string[]>([]); // Soft-delete tracking
  const committedImageIds = cell<string[]>([]); // Already-appended tracking

  // Visible images = uploaded minus hidden
  const visibleImages = derive(
    [uploadedImages, hiddenImageIds] as const,
    ([imgs, hidden]: [ImageData[], string[]]) =>
      imgs.filter((img: ImageData) => !hidden.includes(img.id))
  );

  // ═══════════════════════════════════════════════════════════════════════
  // 2. PARALLEL OCR (from store-mapper.tsx .map() pattern)
  // ═══════════════════════════════════════════════════════════════════════

  const imageExtractions = uploadedImages.map((image, index) => {
    const extraction = generateObject({
      system: "You are an OCR assistant. Extract text exactly as written.",
      prompt: derive(image, (img) => {
        // Safety check: image might be undefined after deletion
        if (!img || !img.data) return [];
        return [
          { type: "image" as const, image: img.data },
          { type: "text" as const, text: ocrPrompt },
        ];
      }),
      schema: OCR_SCHEMA,
      model: "anthropic:claude-sonnet-4-5",
    });

    return {
      id: image.id,
      name: image.name || `Image ${index + 1}`,
      thumbnail: image.data,
      pending: extraction.pending,
      error: extraction.error,
      extractedText: derive(extraction.result, (r) => r?.text ?? null),
    };
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. AUTO-COMMIT EFFECT (concatenate mode)
  // Using computed instead of effect for framework-safe reactivity
  // ═══════════════════════════════════════════════════════════════════════

  // Track which images need to be committed (completed extraction, not yet committed)
  const _autoCommitTracker = computed(() => {
    const committed = committedImageIds.get() ?? [];
    const hidden = hiddenImageIds.get() ?? [];
    const currentValue = $value.get() ?? "";

    let newValue = currentValue;
    const newCommitted: string[] = [...committed];
    const newHidden: string[] = [...hidden];

    for (const extraction of imageExtractions) {
      const id = extraction.id;
      const pending = extraction.pending;
      const error = extraction.error;
      const extractedText = extraction.extractedText;

      // Skip if: pending, errored, already committed, or already hidden
      if (pending || error || committed.includes(id) || hidden.includes(id)) {
        continue;
      }

      // Skip if no text extracted
      const text =
        typeof extractedText === "string"
          ? extractedText
          : (extractedText as { get?: () => string | null })?.get?.() ?? null;
      if (!text || text.trim() === "") {
        continue;
      }

      // Append text to value
      newValue = newValue ? `${newValue}${separator}${text}` : text;

      // Mark as committed and auto-hide
      newCommitted.push(id);
      newHidden.push(id);
    }

    // Update state if changes occurred
    if (newCommitted.length > committed.length) {
      $value.set(newValue);
      committedImageIds.set(newCommitted);
      hiddenImageIds.set(newHidden);
    }

    return null; // This computed is just for side effects
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. COMPUTED STATE
  // ═══════════════════════════════════════════════════════════════════════

  const pendingCount = computed(() =>
    imageExtractions.filter((e) => e.pending).length
  );

  const anyPending = computed(() => pendingCount > 0);

  const imageResults = computed<ImageResult[]>(() => {
    const committed = committedImageIds.get() ?? [];
    const hidden = hiddenImageIds.get() ?? [];
    return imageExtractions.map((e) => ({
      id: e.id,
      name: e.name,
      thumbnail: e.thumbnail,
      pending: e.pending,
      error: e.error,
      extractedText:
        typeof e.extractedText === "string"
          ? e.extractedText
          : (e.extractedText as { get?: () => string | null })?.get?.() ?? null,
      committed: committed.includes(e.id),
      hidden: hidden.includes(e.id),
    }));
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 5. UI COMPONENTS (chatbot.tsx pattern)
  // ═══════════════════════════════════════════════════════════════════════

  const textArea = (
    <ct-textarea $value={$value} placeholder={placeholder} rows={6} />
  );

  const uploadArea = (
    <ct-image-input $images={uploadedImages} multiple maxImages={maxImages}>
      <ct-button variant="secondary" size="sm">
        {ifElse(
          anyPending,
          <span>Processing...</span>,
          <span>Add Images</span>
        )}
      </ct-button>
    </ct-image-input>
  );

  const imageList = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {visibleImages.map((img: ImageData, index: number) => {
        const result = derive(imageResults, (results: ImageResult[]) =>
          results.find((r: ImageResult) => r.id === img.id)
        );
        return (
          <div
            key={index}
            style={{
              position: "relative",
              width: "60px",
              height: "60px",
            }}
          >
            <img
              src={img.data}
              alt={img.name || "Uploaded image"}
              style={{
                width: "60px",
                height: "60px",
                objectFit: "cover",
                borderRadius: "4px",
              }}
            />
            {ifElse(
              derive(result, (r: ImageResult | undefined) => r?.pending ?? false),
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  background: "rgba(0,0,0,0.5)",
                  borderRadius: "4px",
                  padding: "4px",
                }}
              >
                <ct-loader size="sm" />
              </div>,
              null
            )}
            {ifElse(
              derive(result, (r: ImageResult | undefined) => (r?.error ? true : false)),
              <div
                style={{
                  position: "absolute",
                  bottom: "0",
                  left: "0",
                  background: "red",
                  color: "white",
                  fontSize: "10px",
                  padding: "2px 4px",
                  borderRadius: "2px",
                }}
              >
                Error
              </div>,
              null
            )}
            {ifElse(
              derive(result, (r: ImageResult | undefined) => r?.committed ?? false),
              <div
                style={{
                  position: "absolute",
                  bottom: "0",
                  left: "0",
                  background: "green",
                  color: "white",
                  fontSize: "10px",
                  padding: "2px 4px",
                  borderRadius: "2px",
                }}
              >
                Done
              </div>,
              null
            )}
          </div>
        );
      })}
    </div>
  );

  const complete = (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {textArea}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {uploadArea}
        {ifElse(
          anyPending,
          <span style={{ fontSize: "14px", color: "#666" }}>
            Processing {pendingCount} image(s)...
          </span>,
          null
        )}
      </div>
      {ifElse(
        derive(visibleImages, (imgs: ImageData[]) => imgs.length > 0),
        imageList,
        null
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════
  // 6. RETURN
  // ═══════════════════════════════════════════════════════════════════════

  return {
    value: $value,
    pendingCount,
    anyPending,
    imageResults,
    ui: {
      complete,
      textArea,
      uploadArea,
      imageList,
    },
  };
}
