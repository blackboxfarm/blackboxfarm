

## Fix: Content Repurposer AI Results Not Visible

### What's Actually Happening
The AI repurposing **is working** -- drafts are being created with repurposed text and images. Two drafts exist in the database with proper AI-rewritten content. However, there are display and workflow issues preventing you from seeing the results.

### Problems Found

1. **Image stored as 1.8MB base64 blob** -- The AI-generated image is saved as a raw base64 data URI in the database column. This is enormous, may not render in `<img>` tags, and can break queries. It should be uploaded to Supabase Storage and stored as a URL instead.

2. **No auto-switch to Drafts tab** -- After clicking "Repurpose Text", a toast says "Check the Drafts tab" but the UI stays on the Scraped Posts tab. The user has to manually navigate.

3. **Re-generation from Drafts tab is broken** -- The "Re-gen Text" and "Re-gen Image" buttons send `draft_id` + `regenerate` parameters, but the edge function only accepts `post_id`. These buttons silently fail.

### Plan

**Step 1: Fix image storage in edge function**
- In `repurpose-content/index.ts`, after AI returns a base64 image, upload it to a Supabase Storage bucket (e.g., `repurposed-images`)
- Store the public URL instead of the base64 string
- Create the storage bucket via migration if it doesn't exist

**Step 2: Auto-switch to Drafts tab after repurposing**
- In `ContentRepurposer.tsx`, after successful repurpose, programmatically switch the active tab from "scraped" to "drafts"

**Step 3: Fix re-generation flow in edge function**
- Add `draft_id` + `regenerate` parameter handling to the edge function
- When `draft_id` is provided, fetch the draft, re-run AI on the original text (for text) or original image (for image), and update the existing draft in-place

**Step 4: Create storage bucket**
- Migration to create `repurposed-images` bucket with public access

### Technical Details

- Storage bucket: `repurposed-images`, public read
- Base64 decode + upload: use `Uint8Array` from base64 string, upload as `.png`
- Edge function: add branching -- if `draft_id` present, update existing draft; if `post_id` present, create new draft
- Tab switching: lift tab state or use a callback from `ScrapedPostsPanel` to parent `ContentRepurposer`

