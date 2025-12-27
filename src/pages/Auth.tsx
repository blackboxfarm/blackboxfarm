import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AuthModal } from '@/components/auth/AuthModal';
import { TwoFactorSetup } from '@/components/auth/TwoFactorSetup';
import { useAuth } from '@/hooks/useAuth';
import { WalletBalanceMonitor } from '@/components/WalletBalanceMonitor';
import { Badge } from '@/components/ui/badge';
import { Shield, UserPlus, Mail, Smartphone, Key, CheckCircle, ArrowLeft } from 'lucide-react';
import { FarmBanner } from '@/components/FarmBanner';
import { AuthButton } from '@/components/auth/AuthButton';
import { NotificationCenter } from '@/components/NotificationCenter';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup'>('signin');
  const { user, signOut } = useAuth();

  // If we were redirected here (e.g. from /super-admin), auto-open the right tab
  useEffect(() => {
    if (user) return;
    const sp = new URLSearchParams(location.search);
    const tab = sp.get('tab');
    if (tab === 'signin' || tab === 'signup') {
      setAuthModalTab(tab);
      setShowAuthModal(true);
    }
  }, [location.search, user]);

  // If we have a next= param and the user is authenticated, take them there automatically
  useEffect(() => {
    if (!user) return;
    const sp = new URLSearchParams(location.search);
    const next = sp.get('next');
    if (next) {
      navigate(next, { replace: true });
    }
  }, [location.search, navigate, user]);

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
    navigate('/auth', { replace: true });
  };

  if (user) {
    return (
      <div className="min-h-screen bg-background">
        {/* Farm Banner Header */}
        <FarmBanner />
        <div className="container mx-auto py-6 space-y-8">
          {/* Main Header Section */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
            <div className="text-center md:text-left flex-1 space-y-4">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <img 
                  src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
                  alt="BlackBox Cube Logo" 
                  className="w-10 h-10 md:w-12 md:h-12"
                />
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  BlackBox Farm
                </h1>
              </div>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
                Putting the needle in the Haystack - Bumps for the whole Fam!
              </p>
              <div className="flex justify-center md:hidden space-x-3">
                <AuthButton />
              </div>
            </div>
            <div className="hidden md:flex flex-shrink-0 items-center gap-3">
              <NotificationCenter />
              <AuthButton />
            </div>
          </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <Link to="/" className="hover:opacity-80 transition-opacity">
                  <ArrowLeft className="h-10 w-10 text-primary" strokeWidth={3} />
                </Link>
                <h2 className="text-2xl font-bold">Welcome, {user.email}</h2>
              </div>
              <p className="text-muted-foreground">Manage your BlackBox Trading account</p>
            <div className="flex justify-between items-center">
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