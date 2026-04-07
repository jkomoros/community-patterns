# ct-image-input Component Design Document

## Overview

A Common UI v2 component for capturing and uploading images with an emphasis on mobile-first camera capture while supporting traditional file upload flows.

## Use Cases

### Primary Use Cases
1. **Quick Camera Capture** - Take a photo directly from the camera (mobile/desktop)
   - Shopping receipts → extract items
   - Whiteboard notes → extract text
   - Product photos → identify/catalog
   - Document scanning → OCR processing

2. **File Upload** - Select existing images from device
   - Profile pictures
   - Gallery photos
   - Screenshot uploads
   - Batch image processing

3. **Drag & Drop** - Desktop workflow for bulk uploads
   - Design file reviews
   - Photo organization
   - Asset management

### Integration Patterns
- **With LLM Vision** - Pass base64 image to `llm()` with vision model
- **With Pattern Tools** - Image as input to pattern processing
- **With Cell Binding** - Reactive image data storage
- **Standalone** - Simple image preview and upload

## Design Goals

1. **Mobile-First Camera UX** - One tap to camera, not buried in file picker
2. **Progressive Enhancement** - Works with plain values, enhanced with Cells
3. **Flexible Output** - Support multiple formats (base64, blob URL, File object)
4. **Preview Built-In** - Show captured/uploaded images inline
5. **Multiple Images** - Support single or multiple image capture
6. **Minimal Configuration** - Works with sensible defaults
7. **EXIF Metadata** - Extract and expose image metadata (orientation, timestamp, location, etc.)

## Architecture Decision: Single Component

**One component handles both file upload and camera capture.**

The HTML5 `<input type="file">` naturally supports both:
- **Without `capture` attribute**: Shows file picker (desktop) or camera option in picker (mobile)
- **With `capture` attribute**: Opens camera directly on mobile devices

This means one `ct-image-input` component can handle all use cases via props, without needing separate components.

## API Design

### Component: `ct-image-input`

#### Properties

```typescript
interface CTImageInput {
  // Core behavior
  multiple?: boolean;              // Allow multiple images (default: false)
  maxImages?: number;              // Max number of images (default: unlimited)

  // Capture mode (maps to HTML5 capture attribute)
  capture?: "user" | "environment" | false;
  // - "user": Front-facing camera (selfies, video calls)
  // - "environment": Back-facing camera (documents, scenes)
  // - false: File picker, no forced camera (default)
  // Note: On desktop, always shows file picker regardless of capture value

  // Output format
  format?: "base64" | "blob" | "file"; // Default: "base64"

  // UI customization
  buttonText?: string;             // Custom button text (default: "📷 Add Photo")
  variant?: ButtonVariant;         // Button style (default: "outline")
  size?: ButtonSize;               // Button size (default: "default")

  // Preview
  showPreview?: boolean;           // Show image previews (default: true)
  previewSize?: "sm" | "md" | "lg"; // Preview thumbnail size (default: "md")
  removable?: boolean;             // Allow removing images (default: true)

  // State
  disabled?: boolean;

  // Cell integration (for reactive patterns)
  images?: Cell<ImageData[]>;      // Bidirectional binding
}

interface ImageData {
  id: string;                      // Unique ID
  name: string;                    // Filename or "Camera Photo"
  url: string;                     // Data URL or blob URL for preview
  data: string | Blob | File;      // Actual data in requested format
  timestamp: number;               // Capture time
  width?: number;                  // Image dimensions
  height?: number;
  size: number;                    // File size in bytes
  type: string;                    // MIME type (e.g., "image/jpeg")
  exif?: ExifData;                 // EXIF metadata if available
}

interface ExifData {
  // Core metadata
  dateTime?: string;               // Original capture date/time
  make?: string;                   // Camera manufacturer
  model?: string;                  // Camera model

  // Orientation
  orientation?: number;            // EXIF orientation (1-8)

  // Location (if available)
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsAltitude?: number;

  // Camera settings
  fNumber?: number;                // Aperture
  exposureTime?: string;           // Shutter speed
  iso?: number;                    // ISO speed
  focalLength?: number;            // Focal length in mm

  // Dimensions
  pixelXDimension?: number;
  pixelYDimension?: number;

  // Software
  software?: string;               // Editing software used

  // Raw EXIF tags for advanced use
  raw?: Record<string, any>;       // All EXIF tags
}
```

#### Events

```typescript
// Fired when image(s) are added
@fires ct-change - { images: ImageData[] }

// Fired when an image is removed
@fires ct-remove - { id: string, images: ImageData[] }

// Fired when camera access fails
@fires ct-error - { error: Error, message: string }
```

#### Slots

```typescript
// Optional: Custom button content
<slot name="button">Default: "📷 Add Photo"</slot>

// Optional: Custom empty state
<slot name="empty">Default: "No images"</slot>
```

## Usage Examples

### Example 1: Simple Camera Capture (Shopping List)

```tsx
// In shopping-list-launcher.tsx
const handlePhotoUpload = handler<
  { detail: { images: ImageData[] } },
  { items: Cell<ShoppingItem[]> }
>(async ({ detail }, { items }) => {
  for (const image of detail.images) {
    // Use vision LLM to extract shopping items
    const extractedItems = await llm({
      model: "claude-3-5-sonnet-20241022",
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.type, // Use actual MIME type
              data: image.data.split(',')[1], // Remove data:image/jpeg;base64, prefix
            }
          },
          {
            type: "text",
            text: "Extract all shopping items from this image as a JSON array of strings. Example: [\"milk\", \"eggs\", \"bread\"]"
          }
        ]
      }]
    });

    // Parse and add items
    const itemList = JSON.parse(extractedItems.result);
    itemList.forEach(itemText => {
      items.push({ title: itemText, done: false });
    });
  }
});

// In UI - Opens camera directly on mobile
<ct-image-input
  capture="environment"
  buttonText="📸 Scan Shopping List"
  onct-change={handlePhotoUpload({ items })}
/>
```

### Example 2: Profile Picture Upload (Camera or File)

```tsx
const profilePhoto = cell<ImageData | null>(null);

// On mobile: Opens front camera
// On desktop: Opens file picker
<ct-image-input
  capture="user"
  multiple={false}
  buttonText="Upload Photo"
  variant="primary"
  $images={profilePhoto}
/>
```

### Example 2b: Profile Picture (File Only - No Camera)

```tsx
const profilePhoto = cell<ImageData | null>(null);

// Always shows file picker, no camera capture
<ct-image-input
  capture={false}
  multiple={false}
  buttonText="Choose Photo"
  variant="primary"
  $images={profilePhoto}
/>
```

### Example 3: Multiple Images with Preview (File Picker)

```tsx
const photos = cell<ImageData[]>([]);

// File picker mode - good for uploading multiple existing photos
<ct-image-input
  multiple
  maxImages={5}
  capture={false}
  showPreview
  removable
  $images={photos}
/>
```

### Example 4: Receipt Scanner with EXIF

```tsx
const handleReceipt = handler<{ detail: { images: ImageData[] } }>(
  async ({ detail }) => {
    const receipt = detail.images[0];

    // Log when the receipt was captured
    console.log("Receipt captured at:", receipt.exif?.dateTime);
    console.log("Location:", receipt.exif?.gpsLatitude, receipt.exif?.gpsLongitude);

    const analysis = await llm({
      model: "claude-3-5-sonnet-20241022",
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: receipt.type, data: receipt.data.split(',')[1] } },
          { type: "text", text: "Extract total, date, merchant, and line items from this receipt as JSON" }
        ]
      }]
    });
    // Process receipt data...
  }
);

<ct-image-input
  capture="environment"
  buttonText="📄 Scan Receipt"
  showPreview={false}
  onct-change={handleReceipt}
/>
```

## Technical Implementation Notes

### HTML5 Capture Attribute
```html
<!-- File picker (default) -->
<input type="file" accept="image/*">

<!-- Mobile camera capture - back camera -->
<input type="file" accept="image/*" capture="environment">

<!-- Mobile camera capture - front camera -->
<input type="file" accept="image/*" capture="user">
```

**Behavior by device:**
- **Mobile with `capture`**: Opens camera directly
- **Mobile without `capture`**: Shows picker with camera option
- **Desktop (always)**: Shows file picker (some browsers may offer webcam option)

This is why one component works for both use cases.

### File Reading Strategy
- Use `FileReader.readAsDataURL()` for base64
- Use `URL.createObjectURL()` for blob URLs (better performance for large images)
- Provide raw `File` object when requested

### EXIF Extraction
- Use a lightweight EXIF parser library (e.g., `exif-js` or `piexifjs`)
- Extract on file load, before emitting event
- Handle missing EXIF gracefully (many images don't have it)
- Auto-rotate images based on EXIF orientation if needed

### Preview Rendering
- Use `<img>` with blob URL or data URL
- Add remove button overlay when `removable={true}`
- Grid layout for multiple images
- Loading state while reading files

### Mobile Considerations
- Large touch target for camera button
- Handle orientation changes
- Compress large images before upload (optional prop?)
- Show image count badge when multiple

### Accessibility
- Proper ARIA labels for file input
- Keyboard navigation for remove buttons
- Alt text for preview images
- Error announcements

## Component Structure

```
packages/ui/src/v2/components/ct-image-input/
├── ct-image-input.ts       # Main component
├── index.ts                # Export and registration
└── styles.ts               # Optional: complex styles
```

## Design Decisions (Finalized)

✅ **Single Component** - One `ct-image-input` handles both file upload and camera capture via `capture` prop

✅ **EXIF Metadata** - Extract and include in `ImageData.exif` field

✅ **No Crop/Edit UI** - Keep component focused; create separate `ct-image-editor` if needed later

## Open Questions

1. **Image Compression?** - Should we auto-compress large images or leave that to the pattern?
   - Pro: Better performance, smaller payloads to LLM
   - Con: Loss of quality, added complexity
   - **Proposal**: Add optional `maxWidth` / `maxHeight` / `quality` props

2. **Progress Indication?** - For large uploads or processing?
   - **Proposal**: Show spinner while reading file, emit `ct-loading` event

3. **Auto-rotation?** - Should we auto-rotate images based on EXIF orientation?
   - Pro: Images display correctly
   - Con: Modifies the image data
   - **Proposal**: Add optional `autoRotate` prop (default: true)

## Next Steps

1. Review this design with team/user
2. Create component implementation
3. Test on mobile devices (camera capture)
4. Test on desktop (file picker, drag & drop)
5. Build shopping-list integration
6. Document in UI package
