import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Smartphone, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { authenticator } from "@otplib/preset-default";
import QRCode from "qrcode";

export function BlackBoxAuth() {
  const [user, setUser] = useState<any>(null);
  const [blackboxUser, setBlackboxUser] = useState<any>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isSetup2FA, setIsSetup2FA] = useState(false);

  useEffect(() => {
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        loadBlackboxUser(user.id);
      }
    });
  }, []);

  const loadBlackboxUser = async (userId: string) => {
    const { data, error } = await supabase
      .from('blackbox_users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      toast({ title: "Error loading profile", description: error.message });
      return;
    }

    if (data) {
      setBlackboxUser(data);
      setPhoneNumber(data.phone_number || "");
    }
  };

  const setup2FA = async () => {
    if (!user) return;

    const newSecret = authenticator.generateSecret();
    setSecret(newSecret);

    const otpauth = authenticator.keyuri(
      user.email,
      "BlackBox BumpBot",
      newSecret
    );

    try {
      const qrCodeUrl = await QRCode.toDataURL(otpauth);
      setQrCode(qrCodeUrl);
      setIsSetup2FA(true);
    } catch (error) {
      toast({ title: "Error generating QR code", description: "Please try again" });
    }
  };

  const verify2FA = async () => {
    if (!secret || !verificationCode) return;

    const isValid = authenticator.verify({
      token: verificationCode,
      secret: secret
    });

    if (!isValid) {
      toast({ title: "Invalid code", description: "Please check your authenticator app" });
      return;
    }

    try {
      // Save 2FA secret and enable 2FA
      const { error } = await supabase
        .from('blackbox_users')
        .upsert({
          user_id: user.id,
          two_factor_secret: secret,
          two_factor_enabled: true,
          phone_number: phoneNumber
        });

      if (error) throw error;

      toast({ title: "2FA enabled successfully", description: "Your account is now secured" });
      setIsSetup2FA(false);
      setVerificationCode("");
      loadBlackboxUser(user.id);
    } catch (error: any) {
      toast({ title: "Error enabling 2FA", description: error.message });
    }
  };

  const updatePhoneNumber = async () => {
    if (!user || !phoneNumber) return;

    try {
      const { error } = await supabase
        .from('blackbox_users')
        .upsert({
          user_id: user.id,
          phone_number: phoneNumber
        });

      if (error) throw error;

      toast({ title: "Phone number updated", description: "Successfully saved" });
      loadBlackboxUser(user.id);
    } catch (error: any) {
      toast({ title: "Error updating phone", description: error.message });
    }
  };

  if (!user) {
    return (
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Please log in to access security settings.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Account Status */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{user.email}</p>
                <p className="text-sm text-muted-foreground">Email verified</p>
              </div>
            </div>
            <Badge variant="secondary">Active</Badge>
          </div>

          {/* Phone Number */}
          <div className="space-y-3">
            <Label htmlFor="phone">Phone Number (Optional)</Label>
            <div className="flex gap-2">
              <div className="flex items-center">
                <Phone className="h-4 w-4 text-muted-foreground mr-2" />
              </div>
              <Input
                id="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
              />
              <Button onClick={updatePhoneNumber} variant="outline">
                Save
              </Button>
            </div>
          </div>

          {/* 2FA Setup */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of security to your account
                  </p>
                </div>
              </div>
              {blackboxUser?.two_factor_enabled ? (
                <Badge variant="secondary">Enabled</Badge>
              ) : (
                <Button onClick={setup2FA} variant="outline">
                  Enable 2FA
                </Button>
              )}
            </div>

            {isSetup2FA && (
              <div className="p-4 border rounded-lg space-y-4">
                <div className="text-center">
                  <p className="font-medium mb-2">Scan this QR code with your authenticator app:</p>
                  {qrCode && (
                    <img src={qrCode} alt="2FA QR Code" className="mx-auto" />
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Or enter this secret manually: <code className="bg-muted px-1 rounded">{secret}</code>
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="verification">Enter verification code:</Label>
                  <Input
                    id="verification"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                  />
                  <Button onClick={verify2FA} className="w-full">
                    Verify & Enable 2FA
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}