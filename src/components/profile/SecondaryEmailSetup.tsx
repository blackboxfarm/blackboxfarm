import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Mail, CheckCircle, Loader2 } from 'lucide-react';

export function SecondaryEmailSetup() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [currentSecondary, setCurrentSecondary] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load current secondary email
  if (user && !loaded) {
    setLoaded(true);
    supabase
      .from('profiles')
      .select('secondary_email, secondary_email_verified')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.secondary_email) {
          setCurrentSecondary(data.secondary_email);
          setEmail(data.secondary_email);
          setVerified(data.secondary_email_verified || false);
        }
      });
  }

  const handleSave = async () => {
    if (!user || !email.trim()) return;
    if (email.trim() === user.email) {
      toast({ title: 'Cannot use your primary email', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          secondary_email: email.trim(),
          secondary_email_verified: false,
        })
        .eq('user_id', user.id);
      if (error) throw error;

      setCurrentSecondary(email.trim());
      setVerified(false);

      // Trigger verification email
      await supabase.functions.invoke('send-verification-email', {
        body: { email: email.trim(), userId: user.id, type: 'secondary' },
      });

      toast({ title: 'Verification email sent to your secondary address' });
    } catch (err: any) {
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase
        .from('profiles')
        .update({ secondary_email: null, secondary_email_verified: false })
        .eq('user_id', user.id);
      setCurrentSecondary(null);
      setEmail('');
      setVerified(false);
      toast({ title: 'Secondary email removed' });
    } catch {
      toast({ title: 'Failed to remove', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1">
        <Mail className="h-3 w-3" />
        Backup Email
        {currentSecondary && (
          <Badge variant={verified ? 'default' : 'secondary'} className="text-[10px] ml-1">
            {verified ? <><CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Verified</> : 'Unverified'}
          </Badge>
        )}
      </Label>
      <div className="flex gap-1.5">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="backup@example.com"
          className="h-8 text-sm flex-1"
          type="email"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleSave}
          disabled={saving || !email.trim()}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
        </Button>
      </div>
      {currentSecondary && (
        <button
          onClick={handleRemove}
          className="text-[10px] text-destructive hover:underline"
          disabled={saving}
        >
          Remove backup email
        </button>
      )}
    </div>
  );
}
