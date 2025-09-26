import { useMemo } from "react";

// Preview-only super admin bypass
// Returns true when running on Lovable preview or when manually forced via localStorage or URL
export function usePreviewSuperAdmin(): boolean {
  // Disabled for security: never bypass auth in production or preview.
  return useMemo(() => false, []);
}
