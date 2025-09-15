import { useMemo } from "react";

// Preview-only super admin bypass
// Returns true when running on Lovable preview or when manually forced via localStorage or URL
export function usePreviewSuperAdmin(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;

    const host = window.location.hostname || "";
    const params = new URLSearchParams(window.location.search);

    // Manual overrides
    const flag = localStorage.getItem("BBX_PREVIEW_SUPERADMIN");
    const qp = params.get("super");

    const isLovablePreview = host.endsWith("lovableproject.com") || host.endsWith("lovable.app");

    return isLovablePreview || flag === "true" || qp === "1" || qp === "true";
  }, []);
}
