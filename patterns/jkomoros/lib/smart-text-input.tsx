/// <cts-enable />
import {
  cell,
  Cell,
  computed,
  Default,
  derive,
  generateObject,
  handler,
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
  // Accepts both Cell<string> and pattern input types (OpaqueCell)
  // deno-lint-ignore no-explicit-any
  $value: any; // Cell<string> | OpaqueCell - framework handles type coercion

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
  // deno-lint-ignore no-explicit-any
  value: any; // Same as input $value
  pendingCount: number; // Number of images being processed
  anyPending: boolean; // True if any OCR in progress
  hasUncommitted: boolean; // True if there are completed OCR results to commit

  // Image tracking
  imageResults: ImageResult[]; // Per-image status and results

  // Handler to commit OCR results to textarea
  // deno-lint-ignore no-explicit-any
  commitResults: any; // Pre-bound handler

  // Pre-composed UI components (chatbot.tsx pattern)
  ui: {
    complete: JSX.Element; // Full drop-in component
    textArea: JSX.Element; // Just the textarea
    uploadArea: JSX.Element; // Just the image upload button
    imageList: JSX.Element; // Thumbnails with status
    commitButton: JSX.Element; // Button to add OCR results to textarea
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
// HANDLER (defined outside function per blessed docs)
// ═══════════════════════════════════════════════════════════════════════════

// Handler to commit OCR results to textarea
// Per blessed docs: define handlers OUTSIDE the pattern function
// Per superstition: pass Cells as handler parameters, not closure captures
const commitResultsHandler = handler<unknown, {
  $value: Cell<string>;
  committedImageIds: Cell<string[]>;
  hiddenImageIds: Cell<string[]>;
  separator: string;
  // We pass the extraction data as a JSON string to avoid Cell unwrapping issues
  extractionDataJson: string;
}>(
  (
    _event,
    {
      $value,
      committedImageIds,
      hiddenImageIds,
      separator,
      extractionDataJson,
    }
  ) => {
    // Parse the extraction data (passed as JSON to avoid Cell unwrapping)
    let textsToAdd: Array<{ id: string; text: string }> = [];
    try {
      textsToAdd = JSON.parse(extractionDataJson || "[]");
    } catch {
      return; // Invalid JSON, nothing to do
    }

    if (textsToAdd.length === 0) return;

    const committed = committedImageIds.get() ?? [];
    const hidden = hiddenImageIds.get() ?? [];
    let currentValue = $value.get() ?? "";

    const newCommitted: string[] = [...committed];
    const newHidden: string[] = [...hidden];

    for (const item of textsToAdd) {
      currentValue = currentValue
        ? `${currentValue}${separator}${item.text}`
        : item.text;
      newCommitted.push(item.id);
      newHidden.push(item.id);
    }

    $value.set(currentValue);
    committedImageIds.set(newCommitted);
    hiddenImageIds.set(newHidden);
  }
);

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
  // 3. COMMIT HANDLER (concatenate mode)
  // Called when user clicks "Add Text" button to commit completed extractions
  // ═══════════════════════════════════════════════════════════════════════

  // Compute uncommitted extraction data as JSON string
  // NOTE: JSON string workaround is necessary because:
  // - When computed values containing objects/arrays pass through handler binding,
  //   they get incorrectly unwrapped at the OpaqueRef boundary
  // - String primitives are safe to pass through
  // - JSON serialization preserves structure through the opaque boundary
  // See: community-docs/superstitions/2025-01-24-pass-cells-as-handler-params-not-closure.md
  const uncommittedDataJson = computed(() => {
    const committed = committedImageIds.get() ?? [];
    const textsToAdd: Array<{ id: string; text: string }> = [];

    for (const e of imageExtractions) {
      // Skip if pending, error, or already committed
      if (e.pending || e.error || committed.includes(e.id)) {
        continue;
      }
      // Framework auto-unwraps OpaqueRefs in computed() context
      const text = e.extractedText;
      if (text && typeof text === "string" && text.trim() !== "") {
        textsToAdd.push({ id: e.id, text });
      }
    }

    return JSON.stringify(textsToAdd);
  });

  // Check if there are uncommitted results
  const hasUncommitted = derive(uncommittedDataJson, (json) => {
    if (!json) return false;
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) && arr.length > 0;
    } catch {
      return false;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. COMPUTED STATE
  // ═══════════════════════════════════════════════════════════════════════

  // Count pending extractions
  // Use computed() with direct property access - framework auto-unwraps OpaqueRefs
  const pendingCount = computed(() => {
    let count = 0;
    for (const extraction of imageExtractions) {
      if (extraction.pending) {
        count++;
      }
    }
    return count;
  });

  const anyPending = derive(pendingCount, (count) => count > 0);

  const imageResults = computed<ImageResult[]>(() => {
    const committed = committedImageIds.get() ?? [];
    const hidden = hiddenImageIds.get() ?? [];
    return imageExtractions.map((e) => ({
      id: e.id,
      name: e.name,
      thumbnail: e.thumbnail,
      pending: e.pending,
      error: e.error,
      // Framework auto-unwraps OpaqueRefs in computed() context
      extractedText: e.extractedText as string | null,
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

  // Pre-bind the commit handler with all needed dependencies
  // Use external handler defined at module level to avoid closure issues
  // Pass JSON string for extraction data to avoid Cell unwrapping issues
  const boundCommitResults = commitResultsHandler({
    $value,
    committedImageIds,
    hiddenImageIds,
    separator,
    extractionDataJson: uncommittedDataJson,
  });

  const commitButton = (
    <ct-button
      variant="primary"
      size="sm"
      onClick={boundCommitResults}
      disabled={derive(hasUncommitted, (has: boolean) => !has)}
    >
      Add OCR Text
    </ct-button>
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
        {ifElse(hasUncommitted, commitButton, null)}
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
    hasUncommitted,
    imageResults,
    commitResults: boundCommitResults,
    ui: {
      complete,
      textArea,
      uploadArea,
      imageList,
      commitButton,
    },
  };
}
