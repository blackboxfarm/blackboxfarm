## Fix
In `src/components/admin/launchers/LauncherMintTimeline.tsx` line 39, change the "Detected" cell from time-only to short date + time.

**Before:** `{new Date(e.detected_at).toLocaleTimeString()}`  
**After:** renders as two lines — e.g. `Jul 7` on top, `1:40:12 PM` below — so the table stays narrow but the date is always visible.

No other changes.