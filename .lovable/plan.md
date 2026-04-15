

## Plan: FAB Position, Thought Bubble Styling & Timing

### 1. FAB Default Position

**Desktop**: Position top-right, calculated so the top edge of the FAB sits 5px below the nav bar bottom. The nav is roughly 90px tall (header + nav strip). Left edge at 80% from left (i.e. 20% from right edge). Using `top: 95px; right: 20%` equivalent via CSS calc.

**Mobile**: Keep current `bottom-5 right-5` position (which you confirmed looks good).

**File**: `src/components/chat/ChatWidget.tsx` line 367-370
- Use `useIsMobile()` (already imported) to switch default position
- Desktop default: `top-[95px] right-[20%]`
- Mobile default: `bottom-5 right-5`

### 2. Thought Bubble Position — Keep Above FAB

No change to the `-top-14` positioning. The bubble stays above the FAB as it currently is. Only the FAB itself moves.

### 3. Thought Bubble Timing

**File**: `src/components/chat/AvatarThoughtBubble.tsx` lines 14-15
- Change exit from `4800` → `6500` ms
- Change cleanup from `5200` → `7000` ms
- Net visible time: ~6.5 seconds (up from ~4.8s)

### 4. Thought Bubble Visual Redesign — Cloud Shape

**File**: `src/components/chat/AvatarThoughtBubble.tsx` lines 28-34

- **Background**: off-white (`#f5f5f0` / `bg-[#f5f5f0]`)
- **Border**: 1px solid black (`border border-black`)
- **Font**: Comic Sans (`font-[Comic_Sans_MS,cursive]`)
- **Shape**: Cloud-like with extra `border-radius` bumps using a custom CSS approach — multiple layered pseudo-elements or a chunky `rounded-full` with padding. Practical approach: use `rounded-[20px]` with visible cloud-puff circles at corners via extra divs.
- **Max width**: ~220px with text wrapping (`max-w-[220px] whitespace-normal` instead of `whitespace-nowrap`)
- **Tail**: Keep the two descending circles (already cloud-like), update their color to off-white with black border

### 5. Feed Default Sort (from approved plan)

**File**: `src/pages/Feed.tsx`
- Default `sortField` → `'last_top_200_rank'`
- Default `sortDir` → `'asc'`

### Current defaults (to answer your questions)
- **Bubble width**: Currently unlimited (`whitespace-nowrap`) — text renders as a single line, no max-width. On desktop a long nudge could be 300-400px wide.
- **Mobile FAB default**: Currently `bottom-5 right-5` (bottom-right corner, 20px from edges).

### Files Modified
1. `src/components/chat/ChatWidget.tsx` — FAB default position (desktop vs mobile)
2. `src/components/chat/AvatarThoughtBubble.tsx` — timing, cloud shape, off-white bg, Comic Sans, black border, max-width wrap
3. `src/pages/Feed.tsx` — default sort order

