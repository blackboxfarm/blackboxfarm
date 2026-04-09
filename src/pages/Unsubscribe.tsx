import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const CATEGORIES = [
  { key: 'marketing', label: 'Marketing & Promotions', description: 'Sales, campaigns, feature promotions' },
  { key: 'product_updates', label: 'Product Updates', description: 'New features, changelogs, platform news' },
  { key: 'weekly_digest', label: 'Weekly Digest', description: 'Weekly summary of activity and insights' },
] as const;

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, boolean>>({
    marketing: true,
    product_updates: true,
    weekly_digest: true,
  });
  const [unsubscribedAll, setUnsubscribedAll] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, [user]);

  const loadPreferences = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase
        .from('email_preferences')
        .select('marketing, product_updates, weekly_digest')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setPreferences({
          marketing: data.marketing,
          product_updates: data.product_updates,
          weekly_digest: data.weekly_digest,
        });
      }
    } catch {
      // use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: string, value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('email_preferences')
        .upsert(
          {
            user_id: user.id,
            ...preferences,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      if (error) throw error;
      toast({ title: 'Preferences saved' });
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUnsubscribeAll = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const allOff = { marketing: false, product_updates: false, weekly_digest: false };
      const { error } = await supabase
        .from('email_preferences')
        .upsert(
          { user_id: user.id, ...allOff, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      if (error) throw error;
      setPreferences(allOff);
      setUnsubscribedAll(true);
      toast({ title: 'Unsubscribed from all marketing emails' });
    } catch {
      toast({ title: 'Failed to unsubscribe', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Mail className="h-10 w-10 mx-auto text-primary mb-2" />
          <CardTitle className="text-xl">Email Preferences</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Manage what emails you receive from BlackBox Farm.
            Support and security emails cannot be turned off.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {unsubscribedAll ? (
            <div className="text-center py-4 space-y-2">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm font-medium">You have been unsubscribed from all marketing emails.</p>
              <p className="text-xs text-muted-foreground">You will still receive security and support emails.</p>
            </div>
          ) : (
            <>
              {CATEGORIES.map((cat) => (
                <div key={cat.key} className="flex items-center justify-between py-2">
                  <div>
                    <Label className="text-sm font-medium">{cat.label}</Label>
                    <p className="text-xs text-muted-foreground">{cat.description}</p>
                  </div>
                  <Switch
                    checked={preferences[cat.key]}
                    onCheckedChange={(val) => handleToggle(cat.key, val)}
                  />
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Preferences'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleUnsubscribeAll}
                  disabled={saving}
                  className="text-xs"
                >
                  Unsubscribe All
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                Security alerts, password resets, and account notifications will always be delivered.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
