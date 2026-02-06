# Plan: Dynamic "Paid" Banner Composite Images for Social Sharing

## ✅ IMPLEMENTED

### Part 1: Cleaner URLs via Domain Redirect
- ✅ Added `public/_redirects` to proxy `/og/*` to Supabase edge functions
- URLs like `blackbox.farm/og/holders-og?token=xxx` now work

### Part 2: Paid Badge Composite Image Generation
- ✅ Created `generate-paid-composite` edge function using Lovable AI
- ✅ Created `paid-og` edge function for OG meta serving
- ✅ Added `paid_composite_url` column to `banner_orders` table
- ✅ Uploaded `paid.png` to `public/` for reference

### Part 3: Checkout Flow Enhancement
- ✅ Added "Share Proof of Payment" section to `BannerCheckout.tsx`
- ✅ Shows composite image preview when available
- ✅ Copy Link and Post on X buttons

### Part 4: Token X Dashboard Integration
- ✅ Updated `generatePostText()` to use cleaner `blackbox.farm/og/holders-og` URL

### Part 5: Banner Order Processor Integration
- ✅ Triggers composite generation after order creation

---

## Remaining Tasks (Manual)

1. **Upload badge variants to Supabase Storage** (`OG` bucket):
   - `paid_24h.png` (copy from public/paid.png)
   - `paid_48h.png`
   - `paid_72h.png`  
   - `paid_1week.png`

---

## Summary

The implementation provides:
1. Professional-looking share URLs (`blackbox.farm/og/...`)
2. AI-generated composite images with "Paid" verification badge
3. Share Proof section in checkout for advertisers
4. Token X Dashboard uses cleaner URL format

