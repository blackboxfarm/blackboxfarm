import React, { ReactNode, Suspense } from 'react';
import { LazyLoader } from './lazy-loader';

interface ActiveTabOnlyProps {
  activeTab: string;
  tabValue: string;
  children: ReactNode;
}

/**
 * Renders children ONLY when the tab is active.
 * This prevents inactive tabs from mounting, running effects, or consuming resources.
 * When the tab becomes inactive, the entire subtree is unmounted.
 */
export const ActiveTabOnly = ({ activeTab, tabValue, children }: ActiveTabOnlyProps) => {
  if (activeTab !== tabValue) {
    return null;
  }

  return (
    <Suspense fallback={<LazyLoader />}>
      {children}
    </Suspense>
  );
};
