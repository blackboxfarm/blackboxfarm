import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Key, ShieldCheck, AlertTriangle, ExternalLink, Loader2, CheckCircle2, Copy } from 'lucide-react';

interface HeliusKeyRotationAlertProps {
  rotationStatus: {
    status: 'overdue' | 'upcoming' | 'ok';
    days: number;
    color: string;
  } | null;
  lastRotated: string | null;
  onRotationComplete: () => void;
}

export function HeliusKeyRotationAlert({ rotationStatus, lastRotated, onRotationComplete }: HeliusKeyRotationAlertProps) {
  const [showInput, setShowInput] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [isRotating, setIsRotating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; secretsUrl?: string } | null>(null);
  const { toast } = useToast();

  // Only show if rotation is overdue or upcoming
  if (!rotationStatus || rotationStatus.status === 'ok') return null;

  const isOverdue = rotationStatus.status === 'overdue';

  const handleRotate = async () => {
    if (!newKey.trim() || newKey.length < 10) {
      toast({ title: 'Invalid key', description: 'Please paste a valid Helius API key', variant: 'destructive' });
      return;
    }

    setIsRotating(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/rotate-helius-key`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ newApiKey: newKey, rotationIntervalDays: 7 }),
        }
      );

      const data = await resp.json();

      if (!resp.ok) {
        setResult({
          success: false,
          message: data.details || data.error || 'Rotation failed',
          secretsUrl: data.secretsUrl,
        });
        return;
      }

      if (data.manualUpdate) {
        setResult({
          success: true,
          message: data.message,
          secretsUrl: data.secretsUrl,
        });
      } else {
        setResult({ success: true, message: 'Key rotated successfully! Next rotation in 7 days.' });
        toast({ title: '✅ Helius Key Rotated', description: `Next rotation: ${data.nextRotation}` });
      }

      setNewKey('');
      onRotationComplete();
    } catch (err: any) {
      setResult({ success: false, message: err.message });
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <Card className={`border ${isOverdue ? 'border-destructive/50 bg-destructive/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {isOverdue ? (
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            ) : (
              <Key className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className={`font-semibold ${isOverdue ? 'text-destructive' : 'text-yellow-500'}`}>
                  Helius API Key — {isOverdue ? `Rotation ${rotationStatus.days}d Overdue` : `Rotation Due in ${rotationStatus.days}d`}
                </p>
                <Badge variant={isOverdue ? 'destructive' : 'outline'} className="text-xs">
                  Weekly Rotation
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {lastRotated 
                  ? `Last rotated: ${new Date(lastRotated).toLocaleDateString()}`
                  : 'Never rotated'
                }
                {' · '}Security best practice: rotate API keys weekly to minimize exposure risk.
              </p>
            </div>
          </div>

          {!showInput && !result && (
            <Button
              variant={isOverdue ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setShowInput(true)}
              className="shrink-0"
            >
              <Key className="h-4 w-4 mr-2" />
              Rotate Now
            </Button>
          )}
        </div>

        {/* Input section */}
        {showInput && !result && (
          <div className="mt-4 space-y-3 pl-8">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Steps:</p>
            </div>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>
                Go to{' '}
                <a
                  href="https://dev.helius.xyz/dashboard/app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  Helius Dashboard <ExternalLink className="h-3 w-3" />
                </a>
                {' '}and generate a new API key
              </li>
              <li>Paste the new key below — we'll validate it before saving</li>
            </ol>

            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Paste new Helius API key..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="font-mono text-sm"
                disabled={isRotating}
              />
              <Button
                onClick={handleRotate}
                disabled={isRotating || !newKey.trim()}
                className="shrink-0"
              >
                {isRotating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Validate & Save
                  </>
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowInput(false); setNewKey(''); }} disabled={isRotating}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Result section */}
        {result && (
          <div className={`mt-4 pl-8 p-3 rounded-lg ${result.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-destructive/10 border border-destructive/20'}`}>
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="space-y-2">
                <p className={`text-sm ${result.success ? 'text-green-500' : 'text-destructive'}`}>
                  {result.message}
                </p>
                {result.secretsUrl && (
                  <a
                    href={result.secretsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline inline-flex items-center gap-1"
                  >
                    Open Supabase Secrets <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={() => { setResult(null); setShowInput(false); }}>
                    Dismiss
                  </Button>
                  {!result.success && (
                    <Button variant="outline" size="sm" onClick={() => { setResult(null); }}>
                      Try Again
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
