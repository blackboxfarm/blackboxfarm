import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Shield, ShieldAlert, ShieldCheck, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface SecurityAuditEvent {
  id: string;
  operation: string;
  secret_type: string;
  access_timestamp: string;
  success: boolean;
  result: string;
  summary: any; // JSON type from Supabase
}

interface SecuritySummary {
  table_name: string;
  total_records: number;
  encrypted_keys?: number;
  encrypted_tokens?: number;
  failed_attempts?: number;
  successful_accesses?: number;
}

export function SecurityAuditPanel() {
  const { user } = useAuth();
  const [auditEvents, setAuditEvents] = useState<SecurityAuditEvent[]>([]);
  const [securitySummary, setSecuritySummary] = useState<SecuritySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const fetchSecurityData = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch security audit events
      const { data: auditData, error: auditError } = await supabase
        .from('user_security_audit')
        .select('*')
        .order('access_timestamp', { ascending: false })
        .limit(50);

      if (auditError) {
        console.error('Error fetching audit data:', auditError);
      } else {
        setAuditEvents(auditData || []);
      }

      // Fetch security summary
      const { data: summaryData, error: summaryError } = await supabase
        .from('security_summary')
        .select('*');

      if (summaryError) {
        console.error('Error fetching summary data:', summaryError);
      } else {
        setSecuritySummary(summaryData || []);
      }

    } catch (err) {
      console.error('Unexpected error fetching security data:', err);
      setError('Failed to fetch security information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, [user?.id]);

  const getStatusColor = (success: boolean, result: string): "default" | "destructive" => {
    if (!success) return 'destructive';
    return 'default';
  };

  const getStatusIcon = (success: boolean, result: string) => {
    if (!success) return <ShieldAlert className="h-4 w-4" />;
    if (result.includes('2FA_NOT_ENABLED')) return <Shield className="h-4 w-4" />;
    return <ShieldCheck className="h-4 w-4" />;
  };

  if (!user) {
    return (
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          Please log in to view security audit information.
        </AlertDescription>
      </Alert>
    );
  }

  const userSecretsData = securitySummary.find(s => s.table_name === 'user_secrets');
  const auditData = securitySummary.find(s => s.table_name === 'secret_access_audit');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Security Audit Panel</h2>
          <p className="text-muted-foreground">
            Monitor access to your sensitive data and security events
          </p>
        </div>
        <Button 
          onClick={fetchSecurityData} 
          disabled={loading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Security Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Encrypted Secrets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {userSecretsData?.encrypted_keys || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Trading keys secured with enhanced encryption
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Access Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {auditData?.successful_accesses || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Successful secret access attempts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Failed Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {auditData?.failed_attempts || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Blocked unauthorized access attempts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Security Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Status
          </CardTitle>
          <CardDescription>
            Current security configuration and recommendations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>
              <strong>Enhanced Security Active:</strong> Your trading private keys are now protected with 
              salted encryption, comprehensive audit logging, and rate limiting.
            </AlertDescription>
          </Alert>
          
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>Recommendation:</strong> Enable 2FA in your profile settings for additional security 
                when accessing trading private keys.
              </AlertDescription>
            </Alert>
        </CardContent>
      </Card>

      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Security Events</CardTitle>
              <CardDescription>
                Last 50 access attempts to your sensitive data
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {showDetails ? 'Hide' : 'Show'} Details
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {auditEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No security events recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {auditEvents.slice(0, showDetails ? 50 : 10).map((event) => (
                <div key={event.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(event.success, event.result)}
                    <div>
                      <div className="font-medium text-sm">
                        {event.operation.toUpperCase()} - {event.secret_type}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(event.access_timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Badge variant={getStatusColor(event.success, event.result)}>
                    {event.result}
                  </Badge>
                </div>
              ))}
              {!showDetails && auditEvents.length > 10 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  Showing 10 of {auditEvents.length} events. Click "Show Details" to see all.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}