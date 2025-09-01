import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Shield, Smartphone, Key } from 'lucide-react';

interface TwoFactorSetupProps {
  onComplete?: () => void;
}

export const TwoFactorSetup = ({ onComplete }: TwoFactorSetupProps) => {
  const [step, setStep] = useState<'phone' | 'verify' | 'totp' | 'complete'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const { user } = useAuth();
  const { toast } = useToast();

  const sendPhoneVerification = async () => {
    if (!phoneNumber) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-verification', {
        body: { phoneNumber, type: 'sms' }
      });

      if (error) throw error;

      toast({
        title: "Verification Sent",
        description: "Check your phone for the verification code"
      });
      setStep('verify');
    } catch (error: any) {
      toast({
        title: "Failed to Send Verification",
        description: error.message,
        variant: "destructive"
      });
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

      // Generate TOTP secret and QR code
      const { data: totpData, error: totpError } = await supabase.functions.invoke('setup-totp', {
        body: { phoneNumber }
      });

      if (totpError) throw totpError;

      setSecret(totpData.secret);
      setQrCode(totpData.qrCode);
      setStep('totp');

      toast({
        title: "Phone Verified",
        description: "Now set up your authenticator app"
      });
    } catch (error: any) {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const enableTwoFactor = async () => {
    if (!totpCode) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('enable-2fa', {
        body: { secret, totpCode }
      });

      if (error) throw error;

      setStep('complete');
      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication is now active"
      });
      
      // Call onComplete callback if provided
      if (onComplete) {
        setTimeout(() => onComplete(), 1500);
      }
    } catch (error: any) {
      toast({
        title: "2FA Setup Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Two-Factor Authentication Setup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'phone' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="pl-10"
                />
              </div>
            </div>
            <Button onClick={sendPhoneVerification} disabled={loading || !phoneNumber} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send Verification Code
            </Button>
          </>
        )}

        {step === 'verify' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
              />
            </div>
            <Button onClick={verifyPhoneCode} disabled={loading || !verificationCode} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify Phone
            </Button>
          </>
        )}

        {step === 'totp' && (
          <>
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app
              </p>
              {qrCode && (
                <div className="flex justify-center">
                  <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
              )}
              <div className="space-y-2">
                <Label>Secret Key (manual entry)</Label>
                <Input value={secret} readOnly className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totp">Enter 6-digit code from your app</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="totp"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
            <Button onClick={enableTwoFactor} disabled={loading || !totpCode} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enable 2FA
            </Button>
          </>
        )}

        {step === 'complete' && (
          <div className="text-center space-y-4">
            <div className="text-green-500 text-4xl">✓</div>
            <h3 className="text-lg font-semibold">2FA Setup Complete</h3>
            <p className="text-sm text-muted-foreground">
              Your account is now protected with two-factor authentication
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};