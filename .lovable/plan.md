

# BubbleMap AI-Guided Experience + Rate Limit Overhaul

## Summary

Transform the BubbleMap from a static tool into an AI-guided interactive experience where The Signal avatar coaches users through features, while simplifying the tier model to "1 full deep scan per day" for free/anon users.

## Rate Limit Changes

**Current state**: 20 lookups/day (testing values), confusing "node cap" concept.

**New model**:
- Anon (IP/fingerprint): 1 complete deep bubblemap per day, full features
- Free signed-in: 1 complete deep bubblemap per day, full features  
- X Subscriber / Pro $9.99: Unlimited

**Changes in `useBubbleMapRateLimit.ts`**:
- Set `DAILY_LIMIT_ANON = 1`, `DAILY_LIMIT_FREE_AUTH = 1`, `DISPLAY_LIMIT = 1`
- Remove node cap restrictions (give full node cap to everyone)

**Banner wording update** in `PublicBubbleMap.tsx`:
- Replace current banner text with: "ONLY 1 Complete* Bubblemap Per Day — Multi Node · 100% Exposed Structures · as DEEP as we can go!!"
- When used: "Daily scan used! Subscribe for unlimited."

## AI Avatar Scripted Journey

All changes in `PublicBubbleMap.tsx` using the existing `dispatchThought` system, extended with a new `dispatchThoughtCustom(text)` function that sends arbitrary text (not just from quip pools).

### Phase 1: Empty State
When page loads with empty input, dispatch a thought bubble: random from pool like "put in a token address and let's look", "paste a contract, let's trace it", "got a token? drop it in".

### Phase 2: Token Address Entered (input onChange detection)
When valid Solana address detected in input:
1. Auto-resolve dev wallet (already works)
2. AI bubble: random from "nice, we have the Dev wallet", "dev wallet locked in", "got the creator"
3. Dev wallet bar gets a 5-second CSS pulse animation (`animate-pulse` with gold border)
4. Trace button turns gold (`bg-gold text-black`) with 3-second pulse
5. If no click in 20 seconds: AI bubble "click Trace to map it out" + button pulses again

### Phase 3: After Initial Graph Display
- Solar Min mode buttons get a light gold tint when active (already `secondary` variant, add gold accent)
- If no user action for 15 seconds after graph renders: AI bubble suggests a feature, random from:
  - "want the wallet mesh? click Deep Spider"
  - "backtrace the Dev with Find KYC Root"
  - "Map X Community shows Admins and Mods too"
  - "try Find All Tokens to see what else they made"

### Phase 4: After Feature Button Click + Results
- Replace ALL toast notifications from feature buttons with AI avatar chat bubbles instead
  - KYC: "tracing the funding chain..." → "KYC root locked in" (instead of toast)
  - Find All Tokens: "scanning for token mints..." → "found X tokens"
  - Deep Spider: "deep spidering the mesh..." → "mesh expanded"
  - Map X Community: "scanning X community..." → "community mapped"
- After results display, AI suggests view switching: "try Solar Clusters to regroup" or "switch to Tree view for hierarchy" with 3-second pulse on those buttons
- Alternate suggestions: "change the line spacing with +/- controls", "use the mini map to navigate clusters" with minimap border pulse

### Phase 5: Shakey-Shake
- Currently works (resets node positions + reheat). Add:
  - Button depress animation on click (scale-95 transition)
  - Brief 1-second CSS shake animation on the graph container (`@keyframes shake`)
  - AI bubble: "shaking it out..." or "reshuffling the mesh"

## Technical Implementation

### New utility: `dispatchThoughtCustom`
Add to `AvatarThoughtBubble.tsx`:
```typescript
export function dispatchThoughtCustom(text: string) {
  window.dispatchEvent(new CustomEvent('signal-thought', { detail: { text } }));
}
```

### New CSS classes in `tailwind.config.ts` or inline:
- `animate-pulse-gold`: gold-bordered pulse for trace button / dev wallet bar
- `animate-shake`: graph container shake for Shakey-Shake
- `animate-depress`: scale-95 on button press

### Idle timer system in `PublicBubbleMap.tsx`:
- `useRef` for idle timers
- Reset on any user interaction (button click, input change)
- Fire AI suggestions at 15-20 second intervals
- Max 3 suggestions before going quiet (avoid annoyance)

### Files Modified
1. **`src/hooks/useBubbleMapRateLimit.ts`** — Change limits to 1/day, remove node cap logic
2. **`src/components/chat/AvatarThoughtBubble.tsx`** — Add `dispatchThoughtCustom`, add BubbleMap-specific quip pools
3. **`src/components/bubble-map/PublicBubbleMap.tsx`** — Main changes:
   - Rate limit banner wording
   - Remove node cap enforcement (everyone gets full depth)
   - AI avatar scripted journey (phases 1-5)
   - Replace toasts with AI bubbles for feature actions
   - Gold Trace button + pulse animations
   - Dev wallet pulse animation
   - Shakey-Shake visual feedback
   - Idle timer suggestion system
   - Solar Min gold tint
   - View switch pulse suggestions
   - Minimap border pulse suggestion
4. **`src/index.css`** — Add `@keyframes shake` and pulse-gold animations

### Guardrails Against Annoyance
- Max 3-4 AI suggestions per session before going silent
- Minimum 15 seconds between suggestions
- No suggestions while user is actively clicking/interacting
- Reset suggestion count on new token search

