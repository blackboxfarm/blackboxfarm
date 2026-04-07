

## Mouse-Aware Contextual Avatar — "The Oracle Watches"

### Concept

Track the user's mouse hover over key UI elements. When they linger on something for 2+ seconds, the Oracle avatar briefly peeks in near the cursor with a contextual tooltip — a single short line relevant to what they're hovering over. Not a chat opener, just a whisper. Click it to open the full chat with context pre-loaded.

### How It Works

1. **Hover zones**: Define specific CSS selectors or data attributes (`data-oracle-hint`) on key elements across the site — subscription cards, holder analysis inputs, bubblemaps, nav items, etc.

2. **Dwell detection**: A global `mousemove` listener tracks cursor position. When the cursor stays within a hover zone for ~2.5 seconds, a small floating Oracle avatar (40px circle) fades in near the cursor with a one-line hint bubble.

3. **Contextual hints**: Each zone maps to a short message:
   - Hovering over subscription cards → "Curious about Pro? I can explain the differences."
   - Hovering over holder analysis input → "Paste a token address — I'll walk you through the results."
   - Hovering over bubblemaps → "Want to trace a dev wallet? Try it."
   - Hovering over nav items → "This section shows live token activity."

4. **Click to engage**: Clicking the peek avatar opens ChatWidget with a pre-seeded context message like "The user was looking at [holder analysis]. Help them."

5. **Anti-annoyance rules**:
   - Only triggers once per zone per session (sessionStorage tracking)
   - Never triggers if chat is already open
   - Never triggers if user dismissed (muted) the widget
   - Maximum 3 peeks per session total
   - Fades away after 4 seconds if not clicked
   - Disabled on mobile (touch devices have no hover)

### Architecture

```text
┌─────────────────────────────────┐
│  OracleHoverProvider (context)  │
│  - global mousemove listener    │
│  - dwell timer per zone         │
│  - peek state + position        │
│  - session limit counter        │
└──────────┬──────────────────────┘
           │
    ┌──────┴──────┐
    │ OraclePeek  │  ← 40px floating avatar + speech bubble
    │ (portal)    │     positioned near cursor
    └─────────────┘
           │
    ┌──────┴──────┐
    │ ChatWidget  │  ← receives context hint on click
    └─────────────┘
```

### Files to Create/Change

| File | Change |
|------|--------|
| `src/components/chat/OracleHoverProvider.tsx` | New — context provider with mousemove listener, dwell detection, peek state management |
| `src/components/chat/OraclePeek.tsx` | New — small floating avatar + hint bubble rendered via portal |
| `src/components/chat/ChatWidget.tsx` | Accept optional `contextHint` prop to pre-seed AI conversation context |
| `src/components/layout/SiteLayout.tsx` | Wrap children in `OracleHoverProvider` |
| Various page components | Add `data-oracle-hint="..."` attributes to key interactive elements (subscription cards, search inputs, nav items) |

### Privacy Note

No mouse coordinates are stored or transmitted. All tracking is ephemeral in React state. Only the fact that a peek was shown (zone ID) is stored in sessionStorage to prevent repeats.

