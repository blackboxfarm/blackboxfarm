

# Plan: Dynamic "Paid" Banner Composite Images for Social Sharing

## Overview

This plan implements two main features:
1. **Cleaner share URLs** - Use `blackbox.farm/og/...` format instead of exposing the Supabase function URL
2. **AI-composited "Paid" badge images** - When sharing proof of banner payment, generate a composite image that overlays a "Paid" badge onto the original token banner

---

## How It Works

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER FLOW                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Advertiser completes banner payment                                 │
│                     ↓                                                    │
│  2. System generates composite image:                                   │
│     ┌──────────────────────────────────────┐                            │
│     │  Original Token Banner (1500x500)     │                            │
│     │  ┌─────────────┐                     │                            │
│     │  │ PAID Badge  │                     │                            │
│     │  │ (24hrs)     │  ← Top-left corner  │                            │
│     │  └─────────────┘     with padding    │                            │
│     └──────────────────────────────────────┘                            │
│                     ↓                                                    │
│  3. Composite saved to storage, URL stored in banner_orders             │
│                     ↓                                                    │
│  4. Checkout page shows "Share Proof of Payment" section                │
│     - Copy Link button → blackbox.farm/og/paid?order=xxx                │
│     - Open X Compose                                                    │
│                     ↓                                                    │
│  5. Twitter bot hits the URL, gets the composite image as og:image     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Cleaner URLs via Domain Redirect

**Goal**: Use `blackbox.farm/og/holders?token=xxx` instead of the raw Supabase function URL

**Approach**: Add a rewrite rule in `netlify.toml` or `vercel.json` (depending on hosting) to proxy `/og/*` paths to the edge function.

For Lovable projects (typically Netlify-based), add to `netlify.toml`:
```toml
[[redirects]]
  from = "/og/*"
  to = "https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/:splat"
  status = 200
  force = true
```

This means:
- `blackbox.farm/og/holders-og?token=xxx` → proxies to the edge function
- Bots see the dynamic OG image; humans get redirected to the SPA

---

## Part 2: Paid Badge Composite Image Generation

### 2.1 Upload the "Paid" Badge Images

Store duration-specific badge images in the `OG` storage bucket:
- `OG/paid_24h.png` 
- `OG/paid_48h.png`
- `OG/paid_72h.png`
- `OG/paid_1week.png`

The uploaded `paid.png` file will be copied to storage as the 24hr variant.

### 2.2 New Edge Function: `generate-paid-composite`

This function:
1. Takes `bannerUrl` (original token banner) and `durationHours` as input
2. Uses Lovable AI image editing to composite the "Paid" badge onto the banner
3. Saves the result to storage
4. Returns the composite image URL

```typescript
// supabase/functions/generate-paid-composite/index.ts
// Uses Lovable AI with image editing capability
// Prompt: "Place this badge image in the top-left corner with 20px padding"
```

### 2.3 Extend `banner-order-processor`

After payment confirmation, trigger composite generation:
1. Fetch the banner order's `image_url`
2. Call `generate-paid-composite` with the banner and duration
3. Store the result URL in a new column: `banner_orders.paid_composite_url`

### 2.4 Database Schema Change

Add column to `banner_orders`:
```sql
ALTER TABLE banner_orders 
ADD COLUMN paid_composite_url TEXT;
```

### 2.5 New Edge Function: `paid-og`

Similar to `holders-og`, but specifically for paid banner proof:
- Accepts `?order=xxx` parameter
- Looks up the `banner_orders` record
- Serves the `paid_composite_url` as the `og:image`
- Redirects humans to `/holders?token=xxx`

---

## Part 3: Checkout Flow Enhancement

### 3.1 Update `BannerCheckout.tsx`

After payment is confirmed, show a new "Share Proof" section:

```text
┌─────────────────────────────────────────┐
│  ✓ Payment Complete!                    │
│                                         │
│  Share your paid banner with community: │
│  ┌─────────────────────────────────────┐│
│  │ [Copy Link]  [Open X Compose]       ││
│  └─────────────────────────────────────┘│
│                                         │
│  Preview of composite image shown below │
└─────────────────────────────────────────┘
```

The "Copy Link" generates:
`https://blackbox.farm/og/paid-og?order=<orderId>`

---

## Part 4: Token X Dashboard Integration

Update `TokenXDashboard.tsx` `generatePostText()` to use the cleaner URL format:
```typescript
const holdersUrl = `https://blackbox.farm/og/holders-og?token=${token.token_mint}&utm_community=${token.x_community_id}`;
```

---

## Technical Details

### Files to Create:
1. `supabase/functions/generate-paid-composite/index.ts` - AI image compositing
2. `supabase/functions/paid-og/index.ts` - OG meta server for paid proofs

### Files to Modify:
1. `netlify.toml` or `public/_redirects` - Add `/og/*` proxy rule
2. `supabase/functions/banner-order-processor/index.ts` - Trigger composite generation on payment
3. `src/pages/BannerCheckout.tsx` - Add "Share Proof" UI section
4. `src/components/admin/TokenXDashboard.tsx` - Use cleaner URL format
5. `supabase/config.toml` - Register new edge functions

### Assets to Upload:
1. Copy `paid.png` to `public/` for reference
2. Upload to Supabase storage `OG/paid_24h.png` (and variants for other durations)

### Database Migration:
```sql
ALTER TABLE banner_orders ADD COLUMN paid_composite_url TEXT;
```

---

## Summary

This implementation provides:
1. Professional-looking share URLs (`blackbox.farm/og/...`)
2. AI-generated composite images showing the token banner with a "Paid" verification badge
3. Seamless integration into the checkout flow for advertisers
4. A new marketing tool for paid advertisers to prove their support in their communities

