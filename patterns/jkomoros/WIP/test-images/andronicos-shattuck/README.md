# Andronico's (Shattuck Ave, Berkeley) - Test Images

## Store Information
- **Store Name**: Andronico's Community Market
- **Location**: Shattuck Avenue, Berkeley, CA
- **Images Captured**: November 10, 2025
- **Total Images**: 13 photos

## Purpose
Test images for store mapping feature development. These photos document the aisle layout and signage of a real grocery store to test:
- Vision LLM extraction of aisle names and sections
- Store layout generation from photos
- Photo wizard workflow

## Format Notes
- **Format**: JPEG
- **Source**: iPhone camera (originally HEIC, converted to JPEG)
- **File Size**: ~4-5MB per image
- **Total**: 13 images, ~60MB

### Why JPEG?
**Production Reality:**
- iOS Safari automatically converts HEIC → JPEG when using `<input type="file" capture>`
- ct-image-input component receives JPEG from iPhones (no HEIC handling needed)
- Claude's vision API supports JPEG, PNG, GIF, WebP (NOT HEIC)

**Test Image Preparation:**
- Converted from iPhone HEIC using macOS `sips` tool
- HEIC files NOT committed to keep repo size smaller
- JPEGs match what the component sees in production

## Image Contents
Expected aisle/section labels visible in these photos:
- Produce sections
- Bakery
- Deli/Prepared foods
- International foods
- Dairy & refrigerated
- Frozen foods
- Beverages
- Snacks & candy
- Health & beauty
- Household items

## Usage
These images can be used to test:
1. Store mapper photo wizard upload
2. Vision LLM aisle extraction
3. Store outline generation
4. End-to-end store mapping workflow
