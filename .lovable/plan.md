

# Intel Briefings — Auto-Metadata & Inline Gallery Images

## Overview

Three enhancements to the Intel Briefings editor:

1. **Auto-fill metadata from pasted/uploaded markdown** — parse the article content to extract title, subtitle, category, and tags automatically so you can just paste and save.
2. **Inline "flavour" images via Gallery picker** — add a button in the editor toolbar that opens the existing Social Media Gallery in pick mode, inserting the selected image as a markdown image tag at the cursor position.
3. **Hero image sizing guidance** — display recommended dimensions (1200x630px, the standard OG/social share ratio) next to the upload button.

## How Auto-Fill Works

When you paste markdown or import a `.md` file, the system will:

- Extract the **first `# heading`** as the title
- Extract the **first paragraph or second heading** as the subtitle
- Scan for keyword patterns to suggest a **category** (e.g., "holder" → `holder-analysis`, "wallet" → `wallet-tracing`, "scam"/"rug" → `scam-detection`, "guide"/"how to" → `platform-guides`)
- Pull any `**bold keywords**` or hashtags as **tags**
- Auto-generate the **slug** from the extracted title
- You can still override any field before saving

## Inline Flavour Images

- Add an "Insert Gallery Image" button next to the "Import .md" button in the editor toolbar
- Clicking it opens the existing `GalleryPickerButton` dialog (reusing the Social Media Gallery component in `pick` mode)
- On selection, inserts `![image](url)` at the current cursor position in the markdown textarea
- This means you get access to all Uploaded and AI Generated images from the gallery without re-uploading

## Hero Image

- Recommended size: **1200 x 630px** (2:1 ratio, optimized for OG/social cards and article headers)
- Add helper text below the upload button showing this recommendation
- No hard enforcement — any image works, but this ratio renders best

## Files to Edit

| Action | File | What |
|--------|------|------|
| Edit | `src/components/admin/IntelBriefingsManager.tsx` | Add auto-parse logic on md import/paste, add gallery picker button, add hero size hint |

No new database changes needed. Reuses the existing `GalleryPickerButton` and `ImageGallery` components.

