

## Problem

The "🚩 1 Flagged" badge in the Mesh Bubble Map shows that a node is flagged but gives zero context about **why** — no flag type, no severity, no short description. You have to click it to open a dialog, and even then it only jumps to the first flagged node. There's no inline preview of the reason.

## Solution

Add an inline explainer next to the Flagged badge so you can immediately see the flag reason without clicking.

### Changes

**File: `src/components/admin/oracle/MeshGraphVisualizer.tsx`**

1. **Expand the "🚩 X Flagged" badge area** to include a short summary of all flag types detected. Instead of just `🚩 1 Flagged`, show something like:

   `🚩 1 Flagged — No KYC Link (critical)`
   
   or for multiple flags:
   
   `🚩 3 Flagged — Circular Funding (2), No KYC Link (1)`

2. **Add a tooltip on hover** with the full list of flagged entities and their flag short labels, so you get instant context without opening the dialog.

3. **Keep the click behavior** — clicking still opens the detailed explainer dialog, but now the dialog will cycle through ALL flagged nodes (not just the first one), with prev/next navigation.

### Technical Detail

- Collect all flags from `displayData.nodes` into a summary: group by `flag.shortLabel`, count occurrences
- Render the summary inline after the badge text
- Add a `title` attribute or Tooltip component with per-node breakdown
- In the dialog opener, pass all flagged nodes instead of just the first match, and add simple prev/next state to navigate between them

