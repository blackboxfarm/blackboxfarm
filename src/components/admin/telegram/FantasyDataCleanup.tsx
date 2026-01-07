import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Trash2, Search, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CorruptedPosition {
  id: string;
  token_symbol: string | null;
  token_mint: string;
  status: string;
  entry_price_usd: number;
  current_price_usd: number;
  sold_price_usd: number;
  current_multiplier: string;
  sold_multiplier: string;
  unrealized_pnl_usd: number;
  realized_pnl_usd: number;
  issue: string;
}

export function FantasyDataCleanup() {
  const [scanning, setScanning] = useState(false);
  const [corrupted, setCorrupted] = useState<CorruptedPosition[]>([]);
  const [scannedTotal, setScannedTotal] = useState(0);
  const [hasScanned, setHasScanned] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);

  const scanForCorrupted = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-fantasy-price-update', {
        body: { action: 'scan_corrupted' }
      });

      if (error) throw error;

      setCorrupted(data.corrupted || []);
      setScannedTotal(data.scannedTotal || 0);
      setHasScanned(true);
      
      if (data.corrupted?.length > 0) {
        toast.warning(`Found ${data.corrupted.length} corrupted positions`);
      } else {
        toast.success('No corrupted positions found!');
      }
    } catch (error: any) {
      toast.error(`Scan failed: ${error.message}`);
    } finally {
      setScanning(false);
    }
  };

  const fixPosition = async (position: CorruptedPosition, action: 'delete' | 'mark_corrupted') => {
    setFixing(position.id);
    try {
      if (action === 'delete') {
        const { error } = await supabase
          .from('telegram_fantasy_positions')
          .delete()
          .eq('id', position.id);
        
        if (error) throw error;
        toast.success(`Deleted position ${position.token_symbol || position.token_mint.slice(0, 8)}`);
      } else {
        const { error } = await supabase
          .from('telegram_fantasy_positions')
          .update({
            status: 'corrupted',
            notes: `Flagged: impossible ${position.current_multiplier}x multiplier`
          })
          .eq('id', position.id);
        
        if (error) throw error;
        toast.success(`Marked position as corrupted`);
      }
      
      // Remove from list
      setCorrupted(prev => prev.filter(p => p.id !== position.id));
    } catch (error: any) {
      toast.error(`Fix failed: ${error.message}`);
    } finally {
      setFixing(null);
    }
  };

  const fixAll = async () => {
    if (!confirm(`This will mark ${corrupted.length} positions as corrupted. Continue?`)) return;
    
    setFixing('all');
    let fixed = 0;
    
    for (const pos of corrupted) {
      try {
        const { error } = await supabase
          .from('telegram_fantasy_positions')
          .update({
            status: 'corrupted',
            notes: `Auto-flagged: impossible ${pos.current_multiplier}x multiplier`
          })
          .eq('id', pos.id);
        
        if (!error) fixed++;
      } catch (e) {
        console.error('Error fixing position:', e);
      }
    }
    
    toast.success(`Fixed ${fixed} of ${corrupted.length} positions`);
    setCorrupted([]);
    setFixing(null);
  };

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Fantasy Data Cleanup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Button 
            onClick={scanForCorrupted} 
            disabled={scanning}
            variant="outline"
          >
            <Search className="h-4 w-4 mr-2" />
            {scanning ? 'Scanning...' : 'Scan for Corrupted Data'}
          </Button>
          
          {hasScanned && (
            <span className="text-sm text-muted-foreground">
              Scanned {scannedTotal} positions
            </span>
          )}
          
          {corrupted.length > 0 && (
            <Button 
              onClick={fixAll} 
              disabled={fixing === 'all'}
              variant="destructive"
              size="sm"
            >
              Fix All ({corrupted.length})
            </Button>
          )}
        </div>

        {hasScanned && corrupted.length === 0 && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-950/30 p-3 rounded-lg">
            <CheckCircle className="h-5 w-5" />
            <span>All positions have valid data!</span>
          </div>
        )}

        {corrupted.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entry $</TableHead>
                  <TableHead>Current $</TableHead>
                  <TableHead>Multiplier</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corrupted.map(pos => (
                  <TableRow key={pos.id} className="bg-destructive/5">
                    <TableCell className="font-mono">
                      {pos.token_symbol || pos.token_mint.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{pos.status}</Badge>
                    </TableCell>
                    <TableCell>${pos.entry_price_usd?.toFixed(8)}</TableCell>
                    <TableCell>${pos.current_price_usd?.toFixed(4)}</TableCell>
                    <TableCell className="text-destructive font-bold">
                      {pos.current_multiplier}x
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {pos.issue.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fixPosition(pos, 'mark_corrupted')}
                          disabled={fixing === pos.id}
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => fixPosition(pos, 'delete')}
                          disabled={fixing === pos.id}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <strong>Sanity Checks Active:</strong> Price updates are now rejected if multiplier &gt; 1000x. 
          Price sources (Jupiter/DexScreener) are logged for debugging.
        </div>
      </CardContent>
    </Card>
  );
}
