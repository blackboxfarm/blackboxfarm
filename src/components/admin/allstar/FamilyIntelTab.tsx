import React, { useState } from 'react';
import { FamilyDashboard } from './FamilyDashboard';
import { FamilyGraph } from './FamilyGraph';
import { FamilyMintFeed } from './FamilyMintFeed';

type View = 'dashboard' | 'graph' | 'feed';

export function FamilyIntelTab() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  function handleSelectFamily(familyId: string) {
    setSelectedFamilyId(familyId);
    setView('graph');
  }

  function handleBackToDashboard() {
    setSelectedFamilyId(null);
    setView('dashboard');
  }

  return (
    <div className="space-y-4">
      {/* Mini view switcher */}
      {view !== 'graph' && (
        <div className="flex gap-2">
          <button
            onClick={() => setView('dashboard')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'dashboard'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            📊 Families
          </button>
          <button
            onClick={() => setView('feed')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === 'feed'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            🚨 Mint Feed
          </button>
        </div>
      )}

      {view === 'dashboard' && <FamilyDashboard onSelectFamily={handleSelectFamily} />}
      {view === 'graph' && selectedFamilyId && (
        <FamilyGraph familyId={selectedFamilyId} onBack={handleBackToDashboard} />
      )}
      {view === 'feed' && <FamilyMintFeed />}
    </div>
  );
}
