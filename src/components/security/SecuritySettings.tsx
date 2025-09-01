import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Shield, Settings, User, Bell, Lock, Key } from 'lucide-react';
import { TwoFactorSettings } from '../auth/TwoFactorSettings';
import { useAuth } from '@/hooks/useAuth';

export const SecurityDashboard = () => {
  const [currentView, setCurrentView] = useState('overview');
  const { user } = useAuth();

  const renderContent = () => {
    switch (currentView) {
      case '2fa':
        return <TwoFactorSettings />;
      default:
        return (
          <div className="space-y-6">
            <Card className="tech-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        <span className="font-medium">Two-Factor Authentication</span>
                      </div>
                      <Badge variant="secondary">Setup Required</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Add an extra layer of security to your account
                    </p>
                    <Button 
                      size="sm" 
                      className="mt-3"
                      onClick={() => setCurrentView('2fa')}
                    >
                      Configure 2FA
                    </Button>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        <span className="font-medium">Account Security</span>
                      </div>
                      <Badge variant="default">Good</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Your account has basic security measures in place
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="tech-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Security Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div 
                    className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setCurrentView('2fa')}
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="h-4 w-4" />
                      <div>
                        <p className="font-medium">Two-Factor Authentication</p>
                        <p className="text-sm text-muted-foreground">Manage OTP settings and trusted devices</p>
                      </div>
                    </div>
                    <Badge variant="outline">Configure</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4" />
                      <div>
                        <p className="font-medium">Account Information</p>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                      </div>
                    </div>
                    <Badge variant="default">Verified</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Bell className="h-4 w-4" />
                      <div>
                        <p className="font-medium">Security Notifications</p>
                        <p className="text-sm text-muted-foreground">Get notified of security events</p>
                      </div>
                    </div>
                    <Badge variant="default">Enabled</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {currentView !== 'overview' && (
        <Button
          variant="outline"
          onClick={() => setCurrentView('overview')}
          className="mb-4"
        >
          ← Back to Security Overview
        </Button>
      )}
      
      {renderContent()}
    </div>
  );
};