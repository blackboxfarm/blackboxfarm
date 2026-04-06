import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Eye, MousePointer, AlertTriangle, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

interface TrackingEvent {
  id: string;
  tracking_id: string;
  user_id: string | null;
  email_type: string;
  recipient_email: string;
  subject_line: string | null;
  sent_at: string;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  metadata: Record<string, unknown>;
}

interface VerificationRecord {
  id: string;
  user_id: string;
  verification_type: string;
  sent_at: string;
  verified_at: string | null;
  expires_at: string;
}

export function EmailTrackingDashboard() {
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7d');
  const [emailTypeFilter, setEmailTypeFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    const daysMap: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };
    const days = daysMap[timeRange] || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [trackingRes, verificationsRes] = await Promise.all([
      supabase
        .from('email_tracking_events')
        .select('*')
        .gte('sent_at', since)
        .order('sent_at', { ascending: false })
        .limit(200),
      supabase
        .from('email_verifications')
        .select('*')
        .gte('sent_at', since)
        .order('sent_at', { ascending: false })
        .limit(200),
    ]);

    setEvents((trackingRes.data as any[]) || []);
    setVerifications((verificationsRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [timeRange]);

  const filteredEvents = emailTypeFilter === 'all'
    ? events
    : events.filter(e => e.email_type === emailTypeFilter);

  const emailTypes = [...new Set(events.map(e => e.email_type))];

  // Stats
  const totalSent = filteredEvents.length;
  const totalOpened = filteredEvents.filter(e => e.opened_at).length;
  const totalClicked = filteredEvents.filter(e => e.clicked_at).length;
  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';
  const clickRate = totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : '0';

  // Verification stats
  const totalVerificationsSent = verifications.filter(v => v.verification_type === 'signup').length;
  const totalVerified = verifications.filter(v => v.verification_type === 'signup' && v.verified_at).length;
  const totalUnverified = totalVerificationsSent - totalVerified;
  const verifyRate = totalVerificationsSent > 0 ? ((totalVerified / totalVerificationsSent) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>

        <Select value={emailTypeFilter} onValueChange={setEmailTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All email types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {emailTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Mail className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-2xl font-bold">{totalSent}</div>
            <div className="text-xs text-muted-foreground">Emails Sent</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Eye className="w-5 h-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{totalOpened}</div>
            <div className="text-xs text-muted-foreground">Opened</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MousePointer className="w-5 h-5 mx-auto mb-1 text-accent" />
            <div className="text-2xl font-bold">{totalClicked}</div>
            <div className="text-xs text-muted-foreground">Clicked</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{openRate}%</div>
            <div className="text-xs text-muted-foreground">Open Rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{clickRate}%</div>
            <div className="text-xs text-muted-foreground">Click Rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="w-5 h-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{totalVerified}</div>
            <div className="text-xs text-muted-foreground">Verified ({verifyRate}%)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-destructive" />
            <div className="text-2xl font-bold">{totalUnverified}</div>
            <div className="text-xs text-muted-foreground">Unverified</div>
          </CardContent>
        </Card>
      </div>

      {/* Email Tracking Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Email Tracking Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2 text-muted-foreground font-medium">Recipient</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">Type</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">Subject</th>
                  <th className="text-center p-2 text-muted-foreground font-medium">Opened</th>
                  <th className="text-center p-2 text-muted-foreground font-medium">Clicked</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">Sent</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map(event => (
                  <tr key={event.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-2 font-mono text-xs">{event.recipient_email}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs">{event.email_type}</Badge>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground truncate max-w-[200px]">
                      {event.subject_line || '—'}
                    </td>
                    <td className="p-2 text-center">
                      {event.opened_at ? (
                        <span className="text-primary text-xs">
                          ✓ {event.open_count}×
                        </span>
                      ) : (
                        <XCircle className="w-4 h-4 mx-auto text-muted-foreground/40" />
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {event.clicked_at ? (
                        <span className="text-accent text-xs">
                          ✓ {event.click_count}×
                        </span>
                      ) : (
                        <XCircle className="w-4 h-4 mx-auto text-muted-foreground/40" />
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {new Date(event.sent_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {filteredEvents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No email tracking events found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Verification Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Email Verification Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2 text-muted-foreground font-medium">User ID</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">Type</th>
                  <th className="text-center p-2 text-muted-foreground font-medium">Status</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">Sent</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">Verified</th>
                  <th className="text-left p-2 text-muted-foreground font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {verifications.map(v => (
                  <tr key={v.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-2 font-mono text-xs">{v.user_id.substring(0, 8)}…</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs">{v.verification_type}</Badge>
                    </td>
                    <td className="p-2 text-center">
                      {v.verified_at ? (
                        <Badge className="bg-primary/20 text-primary text-xs">Verified</Badge>
                      ) : new Date(v.expires_at) < new Date() ? (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{new Date(v.sent_at).toLocaleString()}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {v.verified_at ? new Date(v.verified_at).toLocaleString() : '—'}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{new Date(v.expires_at).toLocaleString()}</td>
                  </tr>
                ))}
                {verifications.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No verification records found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
