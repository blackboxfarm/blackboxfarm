import { useState, useEffect } from 'react';
import { User, Shield, LogOut, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { SecondaryEmailSetup } from '@/components/profile/SecondaryEmailSetup';
import { UnlinkProvider } from '@/components/auth/UnlinkProvider';
import { TelegramLinkCode } from '@/components/settings/TelegramLinkCode';
import { TwoFactorSetup } from '@/components/auth/TwoFactorSetup';
import { format } from 'date-fns';

interface SolSubscription {
  id: string;
  amount_sol: number;
  status: string;
  payment_wallet_pubkey: string;
  paid_at: string | null;
  expires_at: string | null;
}

interface ProfilePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfilePanel({ open, onOpenChange }: ProfilePanelProps) {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [solSubs, setSolSubs] = useState<SolSubscription[]>([]);
  const [show2FASetup, setShow2FASetup] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    const load = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, two_factor_enabled, phone_verified')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profile?.display_name) setDisplayName(profile.display_name);
      setTwoFactorEnabled(profile?.two_factor_enabled || false);
      setPhoneVerified(profile?.phone_verified || false);

      const { data: subs } = await supabase
        .from('tg_sol_subscriptions')
        .select('id, amount_sol, status, payment_wallet_pubkey, paid_at, expires_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      setSolSubs((subs as SolSubscription[]) || []);
    };
    load();
    // Reset 2FA view when dialog closes
    if (!open) setShow2FASetup(false);
  }, [user, open]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() || null })
        .eq('user_id', user.id);
      if (error) throw error;
      toast({ title: 'Profile updated' });
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const has2FA = twoFactorEnabled || phoneVerified;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Account Settings
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="px-6 pb-6 max-h-[calc(85vh-80px)]">
          <div className="space-y-5 pr-2">
            {show2FASetup ? (
              <TwoFactorSetup
                onBack={() => {
                  setShow2FASetup(false);
                  // Refresh status
                  supabase
                    .from('profiles')
                    .select('two_factor_enabled, phone_verified')
                    .eq('user_id', user.id)
                    .maybeSingle()
                    .then(({ data }) => {
                      setTwoFactorEnabled(data?.two_factor_enabled || false);
                      setPhoneVerified(data?.phone_verified || false);
                    });
                }}
                onComplete={() => {
                  setShow2FASetup(false);
                  setTwoFactorEnabled(true);
                }}
              />
            ) : (
              <>
                {/* Identity */}
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identity</h4>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Display Name</Label>
                    <div className="flex gap-1.5">
                      <Input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Enter your name (optional)"
                        className="h-8 text-sm flex-1"
                      />
                      <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </section>

                <Separator />

                {/* Secondary Email */}
                <section>
                  <SecondaryEmailSetup />
                </section>

                <Separator />

                {/* Registration Code */}
                <section>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Telegram Link</h4>
                  <TelegramLinkCode compact />
                </section>

                <Separator />

                {/* Linked Accounts */}
                <section>
                  <UnlinkProvider />
                </section>

                <Separator />

                {/* 2FA Status */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium">Two-Factor Authentication</span>
                    </div>
                    {has2FA ? (
                      <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30">
                        Active
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Not set up</span>
                    )}
                  </div>
                  {has2FA && (
                    <div className="flex gap-1.5 flex-wrap">
                      {phoneVerified && (
                        <Badge variant="secondary" className="text-[10px]">SMS ✓</Badge>
                      )}
                      {twoFactorEnabled && (
                        <Badge variant="secondary" className="text-[10px]">Authenticator ✓</Badge>
                      )}
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs"
                    onClick={() => setShow2FASetup(true)}
                  >
                    {has2FA ? 'Manage 2FA Methods' : 'Set Up 2FA'}
                  </Button>
                </section>

                {/* SOL Subscriptions */}
                {solSubs.length > 0 && (
                  <>
                    <Separator />
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Wallet className="h-3.5 w-3.5" />
                        SOL Subscriptions
                      </h4>
                      <div className="space-y-2">
                        {solSubs.map((sub) => (
                          <div key={sub.id} className="bg-muted/50 rounded-lg p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium">{sub.amount_sol} SOL</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  sub.status === 'paid' ? 'bg-green-500/10 text-green-500 border-green-500/30' :
                                  sub.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' :
                                  'bg-muted text-muted-foreground'
                                }`}
                              >
                                {sub.status}
                              </Badge>
                            </div>
                            {sub.paid_at && (
                              <div className="text-[10px] text-muted-foreground">
                                Paid: {format(new Date(sub.paid_at), 'MMM d, yyyy')}
                              </div>
                            )}
                            {sub.expires_at && (
                              <div className="text-[10px] text-muted-foreground">
                                Expires: {format(new Date(sub.expires_at), 'MMM d, yyyy')}
                              </div>
                            )}
                            <a
                              href={`https://solscan.io/account/${sub.payment_wallet_pubkey}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-primary hover:underline"
                            >
                              View on Solscan →
                            </a>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                )}

                <Separator />

                {/* Sign Out */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive gap-2"
                  onClick={() => { onOpenChange(false); signOut(); }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </Button>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
