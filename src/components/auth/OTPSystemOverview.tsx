import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, QrCode, Smartphone, CheckCircle } from 'lucide-react';

export const OTPSystemOverview = () => {
  return (
    <div className="space-y-6">
      <Card className="tech-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            OTP Authentication System - Complete Implementation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="h-4 w-4 text-primary" />
                <span className="font-medium">QR Code Setup</span>
                <Badge variant="default">✓ Done</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Users can scan QR codes with authenticator apps like Google Authenticator, Authy, or Microsoft Authenticator
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="font-medium">Login Verification</span>
                <Badge variant="default">✓ Done</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatic OTP verification during login - just like Amazon's system
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <span className="font-medium">Trusted Devices</span>
                <Badge variant="default">✓ Done</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                "Don't require OTP on this browser" option with device management
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                <span className="font-medium">Security Settings</span>
                <Badge variant="default">✓ Done</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Complete 2FA management interface in user profile settings
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="font-medium">Enable/Disable</span>
                <Badge variant="default">✓ Done</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Users can easily enable or disable 2FA from their security settings
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <span className="font-medium">Device Management</span>
                <Badge variant="default">✓ Done</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                View and remove trusted devices from security settings
              </p>
            </div>
          </div>

          <div className="bg-accent/10 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">How it works:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>User enables 2FA in Security Settings by scanning QR code</li>
              <li>During login, system checks if 2FA is enabled</li>
              <li>If enabled and device isn't trusted, user enters OTP code</li>
              <li>Optional "remember this browser" checkbox</li>
              <li>Users can manage trusted devices in settings</li>
            </ol>
          </div>

          <div className="bg-primary/10 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">🚀 Ready to Use:</h3>
            <p className="text-sm">
              Your OTP system is now fully implemented and works exactly like Amazon's! 
              Users can set up 2FA, manage trusted devices, and enjoy secure login with optional device memory.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};