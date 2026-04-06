import { useJourneyTracker } from '@/hooks/useJourneyTracker';
import { useAuth } from '@/hooks/useAuth';

/**
 * Global journey tracker — placed inside BrowserRouter to auto-log
 * page views for authenticated users. Renders nothing.
 */
export function JourneyTrackerProvider() {
  const { user } = useAuth();
  
  // Only activate tracking for authenticated users
  if (!user) return null;
  
  return <JourneyTrackerInner />;
}

function JourneyTrackerInner() {
  useJourneyTracker();
  return null;
}
