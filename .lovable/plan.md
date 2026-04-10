

# Contact Form Security + Ticket System Connectivity

## Three Issues Found

1. **No CAPTCHA on contact form** -- The contact form at `/contact` has only a honeypot. Spam like "Sophie Lane" gets through and creates real tickets/emails.
2. **Ticket alerts are dead-ends** -- The Admin Alerts popover shows ticket notifications (🎫 Tickets tab), but clicking them does nothing. No way to jump from the alert to the actual Tickets sub-tab in Super Admin.
3. **No TG group notification** -- When a ticket is submitted, it creates an `admin_notifications` DB row and sends an email to `support@blackbox.farm`, but does NOT post to the BlackBox TG group.

---

## Plan

### 1. Add Cloudflare Turnstile to Contact Form

- Install `@marsidev/react-turnstile` (lightweight React wrapper for Cloudflare Turnstile)
- Add a Turnstile widget to `src/pages/ContactUs.tsx` above the Submit button
- Store the `CLOUDFLARE_TURNSTILE_SITE_KEY` as a `VITE_` env var (public, safe for client)
- Store `CLOUDFLARE_TURNSTILE_SECRET_KEY` as a Supabase Edge Function secret
- Update `send-contact-email` edge function to verify the Turnstile token server-side before processing the ticket (POST to `https://challenges.cloudflare.com/turnstile/v0/siteverify`)
- Block submission if verification fails

**Files**: Edit `src/pages/ContactUs.tsx`, edit `supabase/functions/send-contact-email/index.ts`

### 2. Make Ticket Alerts Clickable (Navigate to Tickets Tab)

- In `AdminNotificationsBadge.tsx`, add a click handler for `support_ticket` and `ticket_reply` type notifications
- On click: close the popover, set the Super Admin active tab to `"tickets"` via a shared state mechanism (URL search param or a context/event)
- The simplest approach: emit a custom event `window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'tickets' }))` and listen in `SuperAdmin.tsx` to switch `activeTab`
- Optionally highlight the specific ticket by passing `ticket_id` from the notification metadata

**Files**: Edit `src/components/admin/AdminNotificationsBadge.tsx`, edit `src/pages/SuperAdmin.tsx`

### 3. Send TG Group Notification on New Ticket

- In `send-contact-email` edge function, after creating the ticket and admin notification, POST a message to the BlackBox TG group via the Telegram Bot API
- Use the existing `TELEGRAM_BOT_TOKEN` and `BLACKBOX_GROUP_CHAT_ID` secrets (already used by the bot webhook)
- Format: `🎫 New Ticket #N | Priority | Category\nFrom: Name\nSubject: ...\nPreview: first 200 chars...`

**Files**: Edit `supabase/functions/send-contact-email/index.ts`

---

## Technical Details

### Turnstile Integration
```text
ContactUs.tsx:
  - Add <Turnstile siteKey={...} onSuccess={setToken} /> widget
  - Pass token in body to send-contact-email
  - Disable submit until token is set

send-contact-email/index.ts:
  - Extract cf_turnstile_token from request body
  - POST to challenges.cloudflare.com/turnstile/v0/siteverify
  - Return 403 if verification fails
```

### Notification Click-Through
```text
AdminNotificationsBadge.tsx:
  - Detect notification_type === 'support_ticket' || 'ticket_reply'
  - On click: dispatch 'navigate-admin-tab' event with detail { tab: 'tickets', ticketId }
  - Close popover

SuperAdmin.tsx:
  - Listen for 'navigate-admin-tab' event
  - setActiveTab(event.detail.tab)
```

### TG Group Alert
```text
send-contact-email/index.ts (after ticket insert):
  - fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: GROUP_CHAT_ID,
      text: formatted ticket summary,
      parse_mode: 'HTML'
    })
```

### Secrets Needed
- `VITE_CLOUDFLARE_TURNSTILE_SITE_KEY` -- added to `.env` (you'll need to create a Turnstile widget at dash.cloudflare.com)
- `CLOUDFLARE_TURNSTILE_SECRET_KEY` -- added as Supabase edge function secret

