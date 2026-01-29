

## Plan: OG Image Default Toggle + V-Parameter Investigation

Based on my investigation, I've identified why the `v=` parameter isn't changing the OG image on Twitter and how to fix it.

### Problem Found

The `v=` parameter **is correctly handled** in the edge function code, but **Twitter never reaches it**. Here's what happens:

1. Twitter scrapes `https://blackbox.farm/holders?v=newimage`
2. Your static hosting serves `index.html` (which has the hardcoded default image)
3. Twitter reads the hardcoded image, ignores the edge function

The code in `holders-og` edge function correctly:
- Reads `v=` parameter 
- Looks for `holders_og_[nickname].png`
- Falls back to `holders_og.png` if not found

But it only works if Twitter hits the edge function URL directly.

### Hardcoded Locations Found

| File | Issue |
|------|-------|
| `index.html` | 4 hardcoded references to `holders_og.png` |
| `public/holders-og/index.html` | 4 hardcoded references to `holders_og.png` |
| Edge function | Dynamic (correct) |

### Solution: Add "Set as Default" Toggle

Since Twitter will always hit the static HTML first, the most reliable solution is to let you **swap which image is the default** from the UI:

**What You'll Be Able to Do:**
- Click a "Set as Default" button on any uploaded image
- That image gets copied to `holders_og.png` (replacing the current default)
- Twitter/Discord/etc. will immediately show the new image

**UI Changes:**
- Add a star/crown icon button next to each non-default image
- Show "Default" badge on the current default image
- Clicking the button on any image promotes it to default
- Confirmation dialog before replacing

### Technical Details

```text
OGImageManager.tsx Changes:
┌─────────────────────────────────────────────────────────┐
│ [Thumbnail] ?v=newpromo  [Copy][Open][Edit][Set Default]│
│ [Thumbnail] Default ⭐   [Copy][Open]                   │
│ [Thumbnail] ?v=winter    [Copy][Open][Edit][Set Default]│
└─────────────────────────────────────────────────────────┘
```

**New "Set as Default" function:**
1. Download the selected versioned image
2. Upload it as `holders_og.png` (upsert)
3. Refresh the list to show the new default thumbnail
4. Toast success message

### Files to Modify

1. **`src/components/admin/OGImageManager.tsx`**
   - Add `handleSetAsDefault` function
   - Add "Set as Default" button with star icon
   - Update UI to show which image is current default
   - Add confirmation dialog

### Why This Approach

- **No server changes needed** - works with existing static hosting
- **Instant effect** - Twitter cache aside, the next scrape shows the new image
- **Simple UX** - one-click to change what Twitter shows
- **Keeps versioning** - you can still use `v=` for edge function direct links

### Alternative Consideration

If you want `v=` to work on Twitter directly, that would require:
- Custom domain routing rules (not available in Lovable)
- Edge middleware to intercept `/holders` requests and proxy to the edge function
- This is significantly more complex and may not be possible with current hosting

### Testing After Implementation

1. Upload a new test image with nickname `test123`
2. Click "Set as Default" on that image
3. Verify `holders_og.png` in storage shows the new image
4. Use Twitter Card Validator to verify the change
5. Clear Twitter's cache or wait for it to expire

