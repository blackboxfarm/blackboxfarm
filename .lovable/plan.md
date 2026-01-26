

# Plan: Automatic Redirect from Lovable Subdomain to Custom Domain

## What This Does

When a public user lands on `blackboxfarm.lovable.app`, they will be automatically redirected to `https://blackbox.farm` - preserving their path and query parameters.

## Key Logic

The redirect will **NOT** trigger in these scenarios (to keep development working):
- **Editor preview** (`id-preview--*.lovable.app`) - your live development environment
- **Already on custom domain** (`blackbox.farm`)
- **Localhost** for local development

## Implementation

### Create New Hook: `src/hooks/useDomainRedirect.ts`

```typescript
import { useEffect } from "react";

export function useDomainRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const host = window.location.hostname;
    
    // Skip redirect for:
    // 1. Editor preview (id-preview--*.lovable.app)
    // 2. Already on custom domain
    // 3. Localhost
    const isEditorPreview = host.includes('id-preview--');
    const isCustomDomain = host === 'blackbox.farm' || host === 'www.blackbox.farm';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    
    if (isEditorPreview || isCustomDomain || isLocalhost) {
      return; // Don't redirect
    }
    
    // Redirect any lovable.app subdomain to custom domain
    const isLovableSubdomain = host.endsWith('.lovable.app');
    
    if (isLovableSubdomain) {
      const newUrl = `https://blackbox.farm${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.replace(newUrl);
    }
  }, []);
}
```

### Update `src/App.tsx`

Add the hook call at the top of the App component:

```typescript
import { useDomainRedirect } from "@/hooks/useDomainRedirect";

const App = () => {
  useDomainRedirect(); // Redirect lovable.app → blackbox.farm
  
  return (
    <QueryClientProvider client={queryClient}>
      // ... rest of app
    </QueryClientProvider>
  );
};
```

## Redirect Behavior

| Current URL | Action |
|-------------|--------|
| `blackboxfarm.lovable.app/holders` | → Redirect to `https://blackbox.farm/holders` |
| `blackboxfarm.lovable.app/?foo=bar` | → Redirect to `https://blackbox.farm/?foo=bar` |
| `id-preview--*.lovable.app/*` | No redirect (editor preview) |
| `blackbox.farm/*` | No redirect (already correct) |
| `localhost:*` | No redirect (development) |

## Files to Create/Modify

1. **Create** `src/hooks/useDomainRedirect.ts` - Redirect logic
2. **Modify** `src/App.tsx` - Import and call the hook

## Result

- Public visitors who somehow land on the Lovable subdomain get seamlessly redirected to your branded domain
- All paths, query params, and hash fragments are preserved
- Development workflow remains unaffected
- The redirect uses `window.location.replace()` so it doesn't create a browser history entry (clean back-button behavior)

