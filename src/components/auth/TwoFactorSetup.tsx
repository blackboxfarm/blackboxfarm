import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Shield, Smartphone, Key, CheckCircle, ArrowLeft } from 'lucide-react';

interface TwoFactorSetupProps {
  onComplete?: () => void;
  onBack?: () => void;
}

type View = 'choose' | 'sms-setup' | 'sms-verify' | 'totp-setup' | 'totp-verify';

export const TwoFactorSetup = ({ onComplete, onBack }: TwoFactorSetupProps) => {
  const [view, setView] = useState<View>('choose');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [existingPhone, setExistingPhone] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone_number, phone_verified, two_factor_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profile) {
        setSmsEnabled(!!profile.phone_verified);
        setTotpEnabled(!!profile.two_factor_enabled);
        if (profile.phone_number) {
          setExistingPhone(profile.phone_number);
          setPhoneNumber(profile.phone_number);
        }
      }
    };
    load();
  }, [user]);

  const sendPhoneVerification = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-verification', {
        body: { phoneNumber, type: 'sms' }
      });
      if (error) throw error;
      toast({ title: 'Verification code sent', description: 'Check your phone for the SMS code' });
      setView('sms-verify');
    } catch (error: any) {
      toast({ title: 'Failed to send code', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const verifyPhoneCode = async () => {
    if (!verificationCode) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('verify-phone', {
        body: { phoneNumber, code: verificationCode }
      });
      if (error) throw error;
      setSmsEnabled(true);
      setExistingPhone(phoneNumber);
      toast({ title: 'Phone verified!', description: 'SMS 2FA is now active' });
      setView('choose');
      setVerificationCode('');
    } catch (error: any) {
      toast({ title: 'Verification failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startTotpSetup = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-totp', {
        body: {}
      });
      if (error) throw error;
      setSecret(data.secret);
      setQrCode(data.qrCode);
      setView('totp-verify');
    } catch (error: any) {
      toast({ title: 'Failed to generate TOTP', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const enableTotp = async () => {
    if (!totpCode) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('enable-2fa', {
        body: { secret, totpCode }
      });
      if (error) throw error;
      setTotpEnabled(true);
      toast({ title: '2FA Enabled', description: 'Google Authenticator is now active' });
      setView('choose');
      setTotpCode('');
    } catch (error: any) {
      toast({ title: '2FA setup failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const disableSms = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await supabase
        .from('profiles')
        .update({ phone_verified: false })
        .eq('user_id', user.id);
      setSmsEnabled(false);
      toast({ title: 'SMS 2FA disabled' });
    } catch {
      toast({ title: 'Failed to disable SMS 2FA', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const disableTotp = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await supabase
        .from('profiles')
        .update({ two_factor_enabled: false })
        .eq('user_id', user.id);
      setTotpEnabled(false);
      toast({ title: 'Authenticator 2FA disabled' });
    } catch {
      toast({ title: 'Failed to disable 2FA', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Method chooser view
  if (view === 'choose') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Two-Factor Authentication</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Add extra security to your account. Enable one or both methods below.
        </p>

        {/* SMS Method */}
        <div className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-blue-500" />
              <div>
                <span className="text-xs font-medium">SMS Verification</span>
                {existingPhone && smsEnabled && (
                  <p className="text-[10px] text-muted-foreground">{existingPhone}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {smsEnabled && (
                <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30">
                  <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Active
                </Badge>
              )}
            </div>
          </div>
          {smsEnabled ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-7 text-destructive hover:text-destructive"
              onClick={disableSms}
              disabled={loading}
            >
              Disable SMS 2FA
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-7"
              onClick={() => setView('sms-setup')}
            >
              Set up SMS verification
            </Button>
          )}
        </div>

        {/* TOTP Method */}
        <div className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-medium">Authenticator App</span>
            </div>
            <div className="flex items-center gap-2">
              {totpEnabled && (
                <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30">
                  <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Active
                </Badge>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Google Authenticator, Authy, or any TOTP app
          </p>
          {totpEnabled ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-7 text-destructive hover:text-destructive"
              onClick={disableTotp}
              disabled={loading}
            >
              Disable Authenticator
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-7"
              onClick={() => { setView('totp-setup'); startTotpSetup(); }}
            >
              Set up Authenticator
            </Button>
          )}
        </div>

        {(smsEnabled || totpEnabled) && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2.5 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-[11px] text-green-400">
              Your account is protected with {smsEnabled && totpEnabled ? 'SMS + Authenticator' : smsEnabled ? 'SMS verification' : 'Authenticator app'}
            </span>
          </div>
        )}
      </div>
    );
  }

  // SMS Setup view
  if (view === 'sms-setup') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView('choose')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">SMS Verification</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Phone Number</Label>
          <Input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1234567890"
            className="h-8 text-sm"
          />
        </div>
        <Button onClick={sendPhoneVerification} disabled={loading || !phoneNumber} className="w-full h-8 text-xs">
          {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
          Send Verification Code
        </Button>
      </div>
    );
  }

  // SMS Verify view
  if (view === 'sms-verify') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView('sms-setup')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">Enter Code</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter the 6-digit code sent to {phoneNumber}
        </p>
        <div className="space-y-2">
          <Input
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            placeholder="123456"
            maxLength={6}
            className="h-8 text-sm text-center tracking-widest font-mono"
          />
        </div>
        <Button onClick={verifyPhoneCode} disabled={loading || verificationCode.length !== 6} className="w-full h-8 text-xs">
          {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
          Verify & Enable SMS 2FA
        </Button>
      </div>
    );
  }

  // TOTP Setup/Verify view
  if (view === 'totp-setup' || view === 'totp-verify') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView('choose')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">Authenticator Setup</span>
          </div>
        </div>

        {loading && !qrCode ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Scan this QR code with Google Authenticator, Authy, or any TOTP app
            </p>
            {qrCode && (
              <div className="flex justify-center bg-white rounded-lg p-3">
                <img src={qrCode} alt="QR Code" className="w-40 h-40" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Manual entry key</Label>
              <Input value={secret} readOnly className="h-7 text-[10px] font-mono bg-muted" />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs">Enter 6-digit code from your app</Label>
              <Input
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                className="h-8 text-sm text-center tracking-widest font-mono"
              />
            </div>
            <Button onClick={enableTotp} disabled={loading || totpCode.length !== 6} className="w-full h-8 text-xs">
              {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Verify & Enable Authenticator
            </Button>
          </>
        )}
      </div>
    );
  }

  return null;
};
