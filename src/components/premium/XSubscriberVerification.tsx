import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserTier } from '@/hooks/useUserTier';
import { toast } from 'sonner';

export function XSubscriberVerification() {
  const { user } = useAuth();
  const { tierInfo, checkSubscription } = useUserTier();
  const [code, setCode] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [loading, setLoading] = useState(false);

  const isAlreadyVerified = tierInfo.isXSubscriber || tierInfo.tierKey === 'x_subscriber';

  const handleVerify = async () => {
    if (!user || !code.trim() || !xHandle.trim()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-x-code', {
        body: { code: code.trim().toUpperCase(), xHandle: xHandle.trim() },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('X Subscriber Verified!', {
          description: data.message,
        });
        setCode('');
        await checkSubscription();
      } else {
        toast.error(data?.message || 'Verification failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  if (isAlreadyVerified) {
    return (
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">X Subscriber Verified</p>
            <p className="text-xs text-muted-foreground">
              {tierInfo.xHandleLinked ? `@${tierInfo.xHandleLinked}` : 'Linked'} — Enhanced features & discounted Pro pricing unlocked
            </p>
          </div>
          <Badge variant="outline" className="border-blue-500/50 text-blue-400 shrink-0">
            <Sparkles className="h-3 w-3 mr-1" />
            Active
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <CardTitle className="text-base">Verify X Subscriber Access</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the verification code from our{' '}
          <a
            href="https://x.com/holdersintel"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
          >
            @holdersintel <ExternalLink className="h-2.5 w-2.5" />
          </a>{' '}
          subscriber community to unlock enhanced features and discounted pricing.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Input
            placeholder="@yourhandle"
            value={xHandle}
            onChange={(e) => setXHandle(e.target.value)}
            className="h-9 text-sm"
          />
          <Input
            placeholder="Enter community code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={20}
            className="h-9 text-sm font-mono tracking-wider"
          />
        </div>
        <Button
          onClick={handleVerify}
          disabled={loading || !code.trim() || !xHandle.trim()}
          className="w-full"
          size="sm"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Verifying...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Verify & Unlock
            </>
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">
          Not subscribed?{' '}
          <a
            href="https://x.com/holdersintel"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            Subscribe on X
          </a>{' '}
          to get the code from our community.
        </p>
      </CardContent>
    </Card>
  );
}
