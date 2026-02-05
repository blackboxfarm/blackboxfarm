

## Add ASCII Bar Graphs to TG Notifications

### Changes

**1. Create bar graph utility function**
- Add `generateAsciiBar(percentage: number, width: number = 10)` helper
- Uses `█` for filled, `░` for empty

**2. Update `notifyTelegramGroup` in `BaglessHoldersReport.tsx`**
- Calculate tier percentages (Whales, Serious, Retail, Dust)
- Add bar graph section to message:
```
📊 Distribution
Whales  ████░░░░░░ 40%
Serious ██████░░░░ 60%
Retail  ███░░░░░░░ 30%
Dust    ██░░░░░░░░ 20%
```

**3. Update `holders-intel-poster/index.ts`**
- Same bar graph addition for XBot TG posts
- Uses existing `stats.whaleCount`, `stats.seriousCount`, etc.

### Message Format Preview
```
📊 *Holders Report Generated*

🪙 *$TOKEN*
├ Total: 1,234
├ Real: 890
└ Grade: B+

📈 Distribution
Whales  ████░░░░░░ 35%
Serious ██████░░░░ 48%
Retail  ███░░░░░░░ 12%
Dust    █░░░░░░░░░  5%

🔗 blackbox.farm/holders?token=...
```

