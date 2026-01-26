

# Plan: Add Helius API Usage Tab to Super Admin Dashboard

## Current State
- A full-featured Helius Usage dashboard exists at `/helius-usage`
- It shows all API usage stats, rate limiting, charts, and recent logs
- **Not linked** from the Super Admin page - you have to know the URL to access it

## Solution
Embed the Helius Usage dashboard as a new tab within the Super Admin page for convenient access.

## Changes Required

### 1. Update `src/pages/SuperAdmin.tsx`

**Add lazy import** (around line 57):
```typescript
const HeliusUsageDashboard = lazy(() => import("./HeliusUsage"));
```

**Add new tab trigger** in the TabsList (around line 159):
```typescript
<TabsTrigger value="helius-api" className="flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500/30 data-[state=active]:to-red-500/20">
  ⚡ Helius API
</TabsTrigger>
```

**Add new TabsContent** (at the end of tabs, around line 430):
```typescript
<TabsContent value="helius-api">
  <ActiveTabOnly activeTab={activeTab} tabValue="helius-api">
    <HeliusUsageDashboard />
  </ActiveTabOnly>
</TabsContent>
```

### 2. Minor Update to `src/pages/HeliusUsage.tsx`

Make the component work both as a standalone page AND as an embedded component:
- Add an optional `embedded` prop to hide the outer container/padding when used inside Super Admin
- Or simply keep as-is since it works fine either way

## Result

After implementation:
- Navigate to `/super-admin?tab=helius-api` to directly access Helius stats
- Quick tab switch from other admin tools to monitor API usage
- All existing functionality preserved at `/helius-usage` for direct access

## What the Dashboard Shows

| Section | Details |
|---------|---------|
| Rate Limit Status | Real-time calls remaining (50/min), circuit breaker status |
| Summary Cards | Total calls, success rate, avg response time, monthly estimate |
| Charts | Credits by function, daily trends, hourly patterns |
| Recent Logs | Last 50 API calls with function, endpoint, status, timing |

## Files to Modify

1. `src/pages/SuperAdmin.tsx` - Add lazy import, tab trigger, and tab content

