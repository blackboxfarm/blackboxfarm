import React, { useState } from 'react';
import { Search, Clock, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MintResultsDisplay } from './MintResultsDisplay';

interface TokenMint {
  mint: string;
  name?: string;
  symbol?: string;
  image?: string;
  timestamp: number;
}

interface WalletScanButtonsProps {
  walletAddress: string;
  sourceToken?: string;
  userId?: string;
}

export function WalletScanButtons({ walletAddress, sourceToken, userId }: WalletScanButtonsProps) {
  const [scanning, setScanning] = useState(false);
  const [addingToCron, setAddingToCron] = useState(false);
  const [cronEnabled, setCronEnabled] = useState(false);
  const [scanResults, setScanResults] = useState<TokenMint[] | null>(null);
  const { toast } = useToast();

  const handleScanNow = async () => {
    setScanning(true);
    setScanResults(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('mint-monitor-scanner', {
        body: {
          action: 'scan_now',
          walletAddress,
          maxAgeHours: 168 // 7 days
        }
      });

      if (error) throw error;

      if (data?.mints?.length > 0) {
        setScanResults(data.mints);
        toast({
          title: `Found ${data.mints.length} token(s)!`,
          description: `Wallet has minted tokens recently.`
        });
      } else {
        toast({
          title: 'No new mints found',
          description: 'This wallet has not minted any tokens in the last 7 days.'
        });
      }
    } catch (error: any) {
      console.error('Scan error:', error);
      toast({
        title: 'Scan failed',
        description: error.message || 'Failed to scan wallet',
        variant: 'destructive'
      });
    } finally {
      setScanning(false);
    }
  };

  const handleAddToCron = async () => {
    if (!userId) {
      toast({
        title: 'Login required',
        description: 'Please log in to enable cron monitoring.',
        variant: 'destructive'
      });
      return;
    }

    setAddingToCron(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('mint-monitor-scanner', {
        body: {
          action: cronEnabled ? 'remove_from_cron' : 'add_to_cron',
          walletAddress,
          userId,
          sourceToken
        }
      });

      if (error) throw error;

      setCronEnabled(!cronEnabled);
      toast({
        title: cronEnabled ? 'Removed from monitoring' : 'Added to cron monitoring!',
        description: cronEnabled 
          ? 'Wallet will no longer be scanned automatically.'
          : 'This wallet will be scanned every 15 minutes for new mints.'
      });
    } catch (error: any) {
      console.error('Cron error:', error);
      toast({
        title: 'Failed to update monitoring',
        description: error.message || 'Could not update cron settings',
        variant: 'destructive'
      });
    } finally {
      setAddingToCron(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleScanNow}
          disabled={scanning}
          className="text-xs"
        >
          {scanning ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Search className="h-3 w-3 mr-1" />
          )}
          Scan Now
        </Button>
        
        <Button 
          size="sm" 
          variant={cronEnabled ? "secondary" : "outline"}
          onClick={handleAddToCron}
          disabled={addingToCron}
          className="text-xs"
        >
          {addingToCron ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : cronEnabled ? (
            <X className="h-3 w-3 mr-1" />
          ) : (
            <Clock className="h-3 w-3 mr-1" />
          )}
          {cronEnabled ? 'Remove Cron' : 'Add to Cron'}
        </Button>
        
        {cronEnabled && (
          <span className="text-xs text-green-500 flex items-center gap-1">
            <Check className="h-3 w-3" />
            Monitoring every 15min
          </span>
        )}
      </div>
      
      {scanning && (
        <MintResultsDisplay mints={[]} walletAddress={walletAddress} isLoading={true} />
      )}
      
      {scanResults && (
        <MintResultsDisplay mints={scanResults} walletAddress={walletAddress} />
      )}
    </div>
  );
}
