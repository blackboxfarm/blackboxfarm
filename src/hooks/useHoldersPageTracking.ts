import { usePageTracking } from './usePageTracking';

interface TrackingData {
  tokenPreloaded?: string;
  versionParam?: string;
}

/**
 * Legacy hook for /holders page tracking.
 * Now delegates to the generic usePageTracking hook with page_name='holders'.
 */
export const useHoldersPageTracking = (trackingData: TrackingData = {}) => {
  return usePageTracking('holders', trackingData);
};
