

## Reset Chat Dismiss State + Keyboard Shortcut

### Problem
The chat widget FAB disappears after dismissal (4-hour `localStorage` timer) and there's no way to manually invoke it.

### Changes

**1. Add keyboard shortcut to toggle chat widget**

Options considered:
- `Ctrl+Shift+O` — "O" for Oracle, unlikely to conflict
- `Ctrl+.` — common for assistants (GitHub Copilot uses this)
- `Ctrl+/` — used by many help systems
- `Alt+A` — "A" for Assistant, simple

Recommendation: **`Ctrl+Shift+O`** (Oracle) as primary, plus add a reset of dismiss state whenever the shortcut is used.

**2. Reset dismiss on shortcut invocation**

When the keyboard shortcut fires, clear `bb_chat_dismissed_at` from localStorage, set `fabVisible = true`, and open the chat panel immediately.

**3. One-time dismiss reset now**

Add a `useEffect` in `ChatWidget.tsx` that clears the dismiss key on mount if a URL param `?reset_chat=1` is present, OR simply clear the stale localStorage key. Since you want it reset right now, we'll remove the dismiss key on next deploy automatically by bumping the key name — but the cleaner fix is the keyboard shortcut which permanently solves re-access.

### Implementation

| File | Change |
|------|--------|
| `src/components/chat/ChatWidget.tsx` | Add `useEffect` with `keydown` listener for `Ctrl+Shift+O` that clears dismiss state, shows FAB, and opens chat. Also clear dismiss state if `?reset_chat=1` is in URL. |

### Code sketch

```typescript
// In ChatWidget, add keyboard shortcut
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'O') {
      e.preventDefault();
      localStorage.removeItem(DISMISS_KEY);
      setFabVisible(true);
      setIsOpen(true);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);

// Also reset if URL has ?reset_chat=1
useEffect(() => {
  if (new URLSearchParams(window.location.search).get('reset_chat') === '1') {
    localStorage.removeItem(DISMISS_KEY);
    setFabVisible(true);
  }
}, []);
```

Single file change, ~15 lines added. The shortcut **Ctrl+Shift+O** (or Cmd+Shift+O on Mac) will always bring back the Oracle regardless of dismiss state.

