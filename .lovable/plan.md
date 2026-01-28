

# Plan: Consolidate Token Input Triggers & Remove Refresh Icon

## Problem Summary

Currently the `/holders` page has **3 different trigger mechanisms** with inconsistent behavior:

| Trigger | Normalize | Metadata | Full Report | Share Card | KOL Match |
|---------|:---------:|:--------:|:-----------:|:----------:|:---------:|
| **URL Pre-load** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Paste Address** | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| **Generate Button** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Refresh Icon** | ❌ | ❌ | ⚠️ (price only) | ❌ | ❌ |

**Issues identified:**
1. **Refresh Icon** - Calls the full `bagless-holders-report` edge function (2-8s) but only uses the price, wasting resources
2. **Paste Trigger Bug** - The useEffect at line 321-329 only auto-generates if `!report`, so pasting a new token over an existing report does nothing
3. **Generate Button** - Doesn't re-normalize or refresh metadata, relying on existing state

---

## Solution Overview

1. **Remove the Refresh Icon** entirely (it's redundant and wasteful)
2. **Fix the paste trigger** to detect when a NEW token is pasted and auto-regenerate
3. **Consolidate behavior** so all paths follow the URL preload pattern

---

## Technical Implementation

### Step 1: Remove the Refresh Icon (lines 1015-1024)

Delete this block from the UI:
```tsx
{useAutoPricing && (
  <Button 
    variant="outline"
    onClick={fetchTokenPrice}
    disabled={!tokenMint.trim() || isFetchingPrice}
    size="icon"
  >
    <RefreshCw className={`h-4 w-4 ${isFetchingPrice ? 'animate-spin' : ''}`} />
  </Button>
)}
```

### Step 2: Fix the Auto-Trigger to Detect New Tokens

Replace the current useEffect (lines 320-329):

**Before:**
```tsx
// Auto-generate report when token metadata is successfully fetched
useEffect(() => {
  if (tokenData && !report && !isLoading && tokenMint.trim()) {
    // Small delay to ensure metadata is fully processed
    const timer = setTimeout(() => {
      generateReport();
    }, 500);
    return () => clearTimeout(timer);
  }
}, [tokenData]);
```

**After:**
```tsx
// Auto-generate report when token metadata is successfully fetched
// Triggers on: initial load, URL preload, or when a NEW token is pasted
useEffect(() => {
  if (tokenData && !isLoading && tokenMint.trim()) {
    // Check if this is a new token (different from current report)
    const currentReportToken = report?.tokenMint;
    const normalizedMint = tokenMint.trim();
    
    // Generate if: no report exists OR the token changed
    if (!currentReportToken || currentReportToken !== normalizedMint) {
      const timer = setTimeout(() => {
        generateReport();
      }, 500);
      return () => clearTimeout(timer);
    }
  }
}, [tokenData, tokenMint]);
```

### Step 3: Add Clear Report on Token Change

Add a new useEffect to clear the old report when token changes, ensuring a clean state:

```tsx
// Clear report when token changes to a different value
const previousTokenRef = useRef<string>('');
useEffect(() => {
  const normalized = tokenMint.trim();
  if (previousTokenRef.current && previousTokenRef.current !== normalized && normalized) {
    // Token changed - clear old report to allow new generation
    setReport(null);
    setShareCardImageUrl(null);
    setShareCardPageUrl(null);
    setKolMatches([]);
  }
  previousTokenRef.current = normalized;
}, [tokenMint]);
```

---

## Changes Summary

| File | Change | Purpose |
|------|--------|---------|
| `src/components/BaglessHoldersReport.tsx` | Remove RefreshCw button (lines 1015-1024) | Eliminate redundant/wasteful UI element |
| `src/components/BaglessHoldersReport.tsx` | Update auto-trigger useEffect (lines 320-329) | Detect new tokens and regenerate |
| `src/components/BaglessHoldersReport.tsx` | Add token change detection useEffect | Clear old state when token changes |
| `src/components/BaglessHoldersReport.tsx` | Add `useRef` import | Track previous token value |
| `src/components/BaglessHoldersReport.tsx` | Remove `fetchTokenPrice` function (lines 454-502) | No longer needed since refresh icon is removed |
| `src/components/BaglessHoldersReport.tsx` | Clean up unused state: `isFetchingPrice`, `discoveredPrice`, `priceSource` | Code cleanup |

---

## Final Behavior

After these changes, all three remaining triggers will behave identically:

| Trigger | Flow |
|---------|------|
| **URL Pre-load** | Normalize → Metadata → Report → Share Card → KOL Match |
| **Paste Address** | Normalize → Clear old report → Metadata → Report → Share Card → KOL Match |
| **Generate Button** | Uses current state → Report → Share Card → KOL Match |

**User Experience:**
- Paste a token address → Report auto-generates (even if previous report exists)
- Click Generate → Regenerates current token
- No confusing refresh icon

---

## Testing Checklist

After implementation:
1. Visit `/holders` with no token - verify input is empty
2. Paste a token address - verify report auto-generates
3. Paste a DIFFERENT token over existing report - verify NEW report generates
4. Click Generate button - verify it regenerates current token
5. Visit `/holders?token=ABC...` - verify URL preload still works
6. Verify refresh icon is completely removed from UI

