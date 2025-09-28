import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw, Search } from 'lucide-react';
import { useSecretManager } from '@/hooks/useSecretManager';
import { useSecureAuth } from '@/hooks/useSecureAuth';
import { supabase } from '@/integrations/supabase/client';
import { useUserRoles } from '@/hooks/useUserRoles';
import { AccountAuditPanel } from './AccountAuditPanel';
import { 
  SecurityMarketingView, 
  DonorSecurityView, 
  CampaignCreatorSecurityView, 
  SuperAdminSecurityView 
} from './SecurityViews';

interface SecurityCheck {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'warning';
  description: string;
  recommendation?: string;
}

export const SecurityDashboard = () => {
  const [securityChecks, setSecurityChecks] = useState<SecurityCheck[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const { secrets, hasSecrets, getSecretStatus } = useSecretManager();
  const { user, isRateLimited, rateLimitState, isAuthenticated } = useSecureAuth();
  const { isSuperAdmin } = useUserRoles();
  
  // Determine user type and what security view to show
  const getUserType = () => {
    if (!isAuthenticated) return 'anonymous';
    if (isSuperAdmin) return 'superadmin';
    // TODO: Add logic to check if user is campaign creator vs donor
    return 'donor'; // Default to donor view
  };

  const userType = getUserType();

  const runSecurityScan = async () => {
    setIsScanning(true);
    const checks: SecurityCheck[] = [];

    // Authentication Security
    checks.push({
      id: 'auth-status',
      name: 'Authentication',
      status: user ? 'pass' : 'fail',
      description: user ? 'User is authenticated' : 'User not authenticated',
      recommendation: user ? undefined : 'Please sign in to access secure features'
    });

    // Rate Limiting Check
    checks.push({
      id: 'rate-limit',
      name: 'Rate Limiting',
      status: isRateLimited ? 'warning' : 'pass',
      description: isRateLimited 
        ? `Account temporarily blocked after ${rateLimitState.attempts} failed attempts`
        : 'No rate limiting issues detected',
      recommendation: isRateLimited 
        ? 'Wait for the block period to expire or contact support'
        : undefined
    });

    // Secret Management
    const secretStatus = getSecretStatus();
    const hasRequiredSecrets = secretStatus.rpcUrl && secretStatus.tradingPrivateKey;
    
    checks.push({
      id: 'secrets',
      name: 'Secret Management',
      status: hasRequiredSecrets ? 'pass' : 'warning',
      description: hasRequiredSecrets 
        ? 'Required secrets are configured'
        : 'Missing required secrets',
      recommendation: hasRequiredSecrets 
        ? 'Ensure secrets are kept secure and rotated regularly'
        : 'Configure RPC URL and trading private key'
    });

    // Secret Validation
    if (secrets) {
      try {
        // Validate RPC URL
        if (secrets.rpcUrl) {
          new URL(secrets.rpcUrl);
          checks.push({
            id: 'rpc-url',
            name: 'RPC URL Validation',
            status: 'pass',
            description: 'RPC URL format is valid'
          });
        }
      } catch {
        checks.push({
          id: 'rpc-url',
          name: 'RPC URL Validation',
          status: 'fail',
          description: 'RPC URL format is invalid',
          recommendation: 'Please provide a valid HTTP/HTTPS URL'
        });
      }
    }

    // Session Security
    try {
      const { data: session } = await supabase.auth.getSession();
      const sessionAge = session.session 
        ? Date.now() - (session.session.expires_at ? new Date(session.session.expires_at).getTime() - (session.session.expires_in || 3600) * 1000 : Date.now())
        : 0;
      
      const isSessionFresh = sessionAge < 24 * 60 * 60 * 1000; // 24 hours
      
      checks.push({
        id: 'session-age',
        name: 'Session Freshness',
        status: isSessionFresh ? 'pass' : 'warning',
        description: isSessionFresh 
          ? 'Session is recent and valid'
          : 'Session is older than 24 hours',
        recommendation: isSessionFresh 
          ? undefined 
          : 'Consider refreshing your session'
      });
    } catch (error) {
      checks.push({
        id: 'session-age',
        name: 'Session Validation',
        status: 'fail',
        description: 'Unable to validate session',
        recommendation: 'Please sign out and sign back in'
      });
    }

    // HTTPS Check
    checks.push({
      id: 'https',
      name: 'Secure Connection',
      status: window.location.protocol === 'https:' ? 'pass' : 'warning',
      description: window.location.protocol === 'https:' 
        ? 'Connection is encrypted (HTTPS)'
        : 'Connection is not encrypted (HTTP)',
      recommendation: window.location.protocol === 'https:' 
        ? undefined 
        : 'Use HTTPS for secure communication'
    });

    // Recent Security Events Check
    if (user) {
      try {
        const { data: recentEvents } = await supabase
          .from('security_audit_log')
          .select('*')
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(5);

        const suspiciousEvents = recentEvents?.filter(event => 
          event.event_type === 'SIGN_IN_FAILED' || 
          event.event_type.includes('FAILED')
        ) || [];

        checks.push({
          id: 'recent-events',
          name: 'Recent Security Events',
          status: suspiciousEvents.length === 0 ? 'pass' : 'warning',
          description: suspiciousEvents.length === 0 
            ? 'No suspicious activity detected'
            : `${suspiciousEvents.length} suspicious events in last 24 hours`,
          recommendation: suspiciousEvents.length > 0 
            ? 'Review recent activity and change password if necessary'
            : undefined
        });
      } catch (error) {
        console.error('Failed to check security events:', error);
      }
    }

    setSecurityChecks(checks);
    setLastScan(new Date());
    setIsScanning(false);
  };

  useEffect(() => {
    if (user && isAuthenticated) {
      runSecurityScan();
    }
  }, [user, secrets, isAuthenticated]);

  // Show different views based on user type
  if (userType === 'anonymous') {
    return <SecurityMarketingView />;
  }

  if (userType === 'superadmin') {
    return <SuperAdminSecurityView />;
  }

  if (userType === 'donor') {
    return <DonorSecurityView userId={user?.id || ''} />;
  }

  // TODO: Detect campaign creators and show CampaignCreatorSecurityView

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'fail':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const overallStatus = securityChecks.length > 0 
    ? securityChecks.some(check => check.status === 'fail') 
      ? 'fail'
      : securityChecks.some(check => check.status === 'warning')
      ? 'warning'
      : 'pass'
    : 'unknown';

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center space-x-2 mb-6">
        <Shield className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Security Management</h2>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            System Overview
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Account Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-primary" />
                <CardTitle>Security Overview</CardTitle>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className={getStatusColor(overallStatus)}>
                  {getStatusIcon(overallStatus)}
                  <span className="ml-1 capitalize">{overallStatus}</span>
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runSecurityScan}
                  disabled={isScanning}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
                  {isScanning ? 'Scanning...' : 'Scan'}
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <CardDescription>
                Last scan: {lastScan ? lastScan.toLocaleString() : 'Never'}
              </CardDescription>

              {securityChecks.length === 0 && !isScanning && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No security scan data available. Click "Scan" to run security checks.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                {securityChecks.map((check) => (
                  <div key={check.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                    {getStatusIcon(check.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">{check.name}</h4>
                        <Badge variant="outline" className={`text-xs ${getStatusColor(check.status)}`}>
                          {check.status.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {check.description}
                      </p>
                      {check.recommendation && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                          💡 {check.recommendation}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <AccountAuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};