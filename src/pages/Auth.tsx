import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/auth/AuthModal';
import { TwoFactorSetup } from '@/components/auth/TwoFactorSetup';
import { useAuth } from '@/hooks/useAuth';
import { WalletBalanceMonitor } from '@/components/WalletBalanceMonitor';
import { Badge } from '@/components/ui/badge';
import { Shield, UserPlus, Mail, Smartphone, Key, CheckCircle } from 'lucide-react';

export default function AuthPage() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup'>('signin');
  const { user, signOut } = useAuth();

  const openSignIn = () => {
    setAuthModalTab('signin');
    setShowAuthModal(true);
  };

  const openSignUp = () => {
    setAuthModalTab('signup');
    setShowAuthModal(true);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (user) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container mx-auto max-w-4xl space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Welcome, {user.email}</h1>
              <p className="text-muted-foreground">Manage your BlackBox Trading account</p>
            </div>
            <Button variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Security Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>Email Verified</span>
                  </div>
                  <Badge variant={user.email_confirmed_at ? "default" : "secondary"}>
                    {user.email_confirmed_at ? <CheckCircle className="h-3 w-3" /> : "Pending"}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    <span>Phone Verification</span>
                  </div>
                  <Badge variant="secondary">Not Set</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    <span>Two-Factor Auth</span>
                  </div>
                  <Badge variant="secondary">Disabled</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm space-y-2">
                  <div><strong>User ID:</strong> {user.id}</div>
                  <div><strong>Email:</strong> {user.email}</div>
                  <div><strong>Created:</strong> {new Date(user.created_at).toLocaleDateString()}</div>
                  <div><strong>Last Sign In:</strong> {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'N/A'}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <TwoFactorSetup />
          
          <WalletBalanceMonitor />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">BlackBox Trading</h1>
          <p className="text-gray-300">
            Professional trading platform with advanced security
          </p>
        </div>

        <Card className="bg-white/10 backdrop-blur-sm border-white/20">
          <CardHeader>
            <CardTitle className="text-center text-white">
              Get Started
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={openSignUp}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Create Account
            </Button>
            
            <Button
              onClick={openSignIn}
              variant="outline"
              className="w-full border-white/30 text-white hover:bg-white/10"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-gray-400">
          <p>✅ Email confirmation</p>
          <p>🔐 2FA with phone verification</p>
          <p>🛡️ Advanced security features</p>
          <p>📊 Real-time wallet monitoring</p>
        </div>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultTab={authModalTab}
      />
    </div>
  );
}