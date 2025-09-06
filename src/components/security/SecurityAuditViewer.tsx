import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, Shield, AlertTriangle, CheckCircle, Clock, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SecurityAuditEvent {
  id: string;
  operation: string;
  secret_type: string;
  access_timestamp: string;
  success: boolean;
  result: string;
  summary: any; // Using any to handle JSON type from Supabase
}

interface SecuritySummary {
  table_name: string;
  total_records: number;
  encrypted_keys?: number;
  encrypted_tokens?: number;
  failed_attempts?: number;
  successful_accesses?: number;
}

export function SecurityAuditViewer() {
  const [auditEvents, setAuditEvents] = useState<SecurityAuditEvent[]>([]);
  const [securitySummary, setSecuritySummary] = useState<SecuritySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSecurityData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load security audit events
      const { data: auditData, error: auditError } = await supabase
        .from('user_security_audit')
        .select('*')
        .order('access_timestamp', { ascending: false })
        .limit(20);

      if (auditError) {
        console.error('Audit error:', auditError);
        throw auditError;
      }

      // Load security summary
      const { data: summaryData, error: summaryError } = await supabase
        .from('security_summary')
        .select('*');

      if (summaryError) {
        console.error('Summary error:', summaryError);
        throw summaryError;
      }

      setAuditEvents(auditData || []);
      setSecuritySummary(summaryData || []);
    } catch (err: any) {
      console.error('Security data error:', err);
      setError(err.message || 'Failed to load security data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSecurityData();
  }, []);

  const getOperationIcon = (operation: string) => {
    switch (operation.toLowerCase()) {
      case 'read': return <Eye className="h-4 w-4" />;
      case 'update': return <Activity className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getStatusBadgeVariant = (result: string, summary: any) => {
    if (result === 'SUCCESS') {
      const status = summary?.status || 'unknown';
      return status === 'validated' ? 'default' : 'secondary';
    }
    return 'destructive';
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Audit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-2">Loading security data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Audit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {error}
              <Button
                variant="outline"
                size="sm"
                className="ml-2"
                onClick={() => loadSecurityData()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Security Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {securitySummary.map((summary, index) => (
              <div key={index} className="p-4 border rounded-lg">
                <h4 className="font-medium capitalize mb-2">
                  {summary.table_name.replace('_', ' ')}
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Total Records:</span>
                    <span className="font-medium">{summary.total_records}</span>
                  </div>
                  {summary.encrypted_keys !== undefined && (
                    <div className="flex justify-between">
                      <span>Encrypted Keys:</span>
                      <span className="font-medium">{summary.encrypted_keys}</span>
                    </div>
                  )}
                  {summary.encrypted_tokens !== undefined && (
                    <div className="flex justify-between">
                      <span>Encrypted Tokens:</span>
                      <span className="font-medium">{summary.encrypted_tokens}</span>
                    </div>
                  )}
                  {summary.failed_attempts !== undefined && (
                    <div className="flex justify-between">
                      <span>Failed Attempts:</span>
                      <span className="font-medium text-red-600">{summary.failed_attempts}</span>
                    </div>
                  )}
                  {summary.successful_accesses !== undefined && (
                    <div className="flex justify-between">
                      <span>Successful Access:</span>
                      <span className="font-medium text-green-600">{summary.successful_accesses}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Security Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {auditEvents.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-muted-foreground">No security events recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {auditEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getOperationIcon(event.operation)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{event.operation}</span>
                        <Badge variant="outline" className="text-xs">
                          {event.secret_type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatTimestamp(event.access_timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={getStatusBadgeVariant(event.result, event.summary)}
                      className="text-xs"
                    >
                      {event.result === 'SUCCESS' ? (event.summary?.status || 'success') : event.result}
                    </Badge>
                    {event.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSecurityData()}
              className="w-full"
            >
              Refresh Security Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}