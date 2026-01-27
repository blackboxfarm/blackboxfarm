
# AI Integration for Dailies Dashboard

## Overview
Add AI-powered token analysis directly into the Dailies Dashboard, allowing you to quickly generate contextual phrases and post them to the @HoldersIntel X account.

## User Workflow
1. Click on a token's X Community link to visit/join
2. Click the **AI** button on that token row
3. AI generates two editable phrases using Constructive tone and Mode A
4. Edit the phrases if needed
5. Click **POST** to publish directly to @HoldersIntel

---

## Implementation Details

### 1. New Component: `DailiesAIPanel`
A modal or expandable panel that appears when clicking the AI button, containing:

- **Tone Selector**: Dropdown with Balanced/Constructive/Cautionary (default: Constructive)
- **Two Editable Text Areas**:
  - "Status Overview" (3-7 sentences, longer analysis)
  - "Social Summary" (1-2 sentences, Twitter-ready)
- **POST Button**: Posts the Social Summary (or Status Overview based on selection) to X

### 2. UI Changes to DailiesDashboard

**New Column or Row Action:**
- Purple **AI** button with white text in each token row
- When clicked, opens the AI panel for that specific token

**Technical Flow:**
```text
Click AI Button
     ↓
Fetch token report via bagless-holders-report (if not cached)
     ↓
Call token-ai-interpreter with:
  - tone: selected (default "constructive")
  - forceMode: "A" (hardcoded)
     ↓
Display editable phrases
     ↓
POST button → post-share-card-twitter with twitterHandle: "HoldersIntel"
```

### 3. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/admin/DailiesAIPanel.tsx` | Create | AI panel component with tone selector, editable inputs, POST button |
| `src/components/admin/DailiesDashboard.tsx` | Modify | Add AI button column, integrate panel, add state management |

### 4. DailiesAIPanel Component Structure

```text
┌─────────────────────────────────────────────────────────┐
│  $TOKEN AI Analysis                              [X]    │
├─────────────────────────────────────────────────────────┤
│  Tone: [Constructive ▼]                                 │
├─────────────────────────────────────────────────────────┤
│  Status Overview                                        │
│  ┌─────────────────────────────────────────────────────┐│
│  │ This token shows a resilient holder structure...   ││
│  │ (editable textarea - 3-7 sentences)                ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  Social Summary (Twitter-ready)                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Strong retail base with healthy distribution...    ││
│  │ (editable textarea - 1-2 sentences, max 280 chars) ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│  [POST to @HoldersIntel]                                │
└─────────────────────────────────────────────────────────┘
```

### 5. Technical Implementation

**DailiesAIPanel Props:**
- `tokenMint: string`
- `tokenSymbol: string | null`
- `onClose: () => void`

**State:**
- `tone: 'balanced' | 'constructive' | 'cautionary'` (default: constructive)
- `statusOverview: string` (editable)
- `socialSummary: string` (editable)
- `isLoading: boolean`
- `isPosting: boolean`

**API Calls:**
1. `bagless-holders-report` - Fetch holder data for the token
2. `token-ai-interpreter` - Generate AI phrases (forceMode: "A", tone: selected)
3. `post-share-card-twitter` - Post to X with `twitterHandle: "HoldersIntel"`

### 6. Button Styling
```text
AI Button: bg-purple-600 text-white hover:bg-purple-700
POST Button: bg-primary text-primary-foreground (standard action button)
```

### 7. Dashboard Table Changes
Add new column after the Community checkbox column:
- Header: AI icon
- Cell: Purple "AI" button that opens the panel

---

## Edge Cases Handled

1. **Token without holder data**: Fetch fresh data when AI button clicked
2. **Rate limiting**: Show error toast if AI API rate limited
3. **X API errors**: Display friendly error message with troubleshooting tips
4. **Character limit**: Show character count for Social Summary (Twitter limit)
5. **Loading states**: Disable buttons and show spinners during API calls

## Dependencies
- Existing `token-ai-interpreter` edge function (already supports tone + forceMode)
- Existing `post-share-card-twitter` edge function (already supports twitterHandle)
- Existing `bagless-holders-report` edge function (for fetching holder data)

No database changes required - all infrastructure is already in place.
