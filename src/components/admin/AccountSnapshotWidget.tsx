import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Users, Bot, CreditCard, Gem, Radio } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SnapshotData {
  totalWeb: number;
  emailVerified: number;
  with2fa: number;
  tgBotDmUsers: number;
  tgWebLinked: number;
  stripeMonthly: number;
  stripeYearly: number;
  solYearly: number;
  channelInstalls: number;
}

export function AccountSnapshotWidget() {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { count: totalWeb },
        { count: emailVerified },
        { count: with2fa },
        tgBotUsersRes,
        tgWebLinkedRes,
        { count: stripeCustomers },
        { count: solActive },
        { count: channelInstalls },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('email_verified', true),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('two_factor_enabled', true),
        supabase.rpc('count_distinct_tg_users' as any),
        supabase.rpc('count_registered_tg_users' as any),
        supabase.from('stripe_customers').select('*', { count: 'exact', head: true }),
        supabase.from('tg_sol_subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('channel_installations').select('*', { count: 'exact', head: true }),
      ]);

      setData({
        totalWeb: totalWeb ?? 0,
        emailVerified: emailVerified ?? 0,
        with2fa: with2fa ?? 0,
        tgBotDmUsers: typeof tgBotUsersRes.data === 'number' ? tgBotUsersRes.data : 0,
        tgWebLinked: typeof tgWebLinkedRes.data === 'number' ? tgWebLinkedRes.data : 0,
        stripeMonthly: stripeCustomers ?? 0,
        stripeYearly: 0,
        solYearly: solActive ?? 0,
        channelInstalls: channelInstalls ?? 0,
      });
    } catch (err) {
      console.error('AccountSnapshot fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  return (
    <Card className="border-2 border-primary/20 bg-primary/5 min-w-[260px]">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <CardTitle className="text-sm">Account Snapshot</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 ml-auto"
            onClick={fetchSnapshot}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {!data ? (
          <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
        ) : (
          <>
            <Row icon={<Users className="h-3.5 w-3.5" />} label="Web Accounts" count={data.totalWeb}>
              <Sub>{data.emailVerified} verified · {data.with2fa} with 2FA</Sub>
            </Row>
            <Row icon={<Bot className="h-3.5 w-3.5" />} label="TG Global (DM'd bot)" count={data.tgBotDmUsers}>
              <Sub>{data.tgWebLinked} also web-registered</Sub>
            </Row>
            <Row icon={<CreditCard className="h-3.5 w-3.5" />} label="Stripe Customers" count={data.stripeMonthly} />
            {data.solYearly > 0 && (
              <Row icon={<Gem className="h-3.5 w-3.5" />} label="SOL Subscribers" count={data.solYearly} />
            )}
            <Row icon={<Radio className="h-3.5 w-3.5" />} label="Channel Installs" count={data.channelInstalls} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ icon, label, count, children }: { icon: React.ReactNode; label: string; count: number; children?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
        <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4 font-bold">
          {count}
        </Badge>
      </div>
      {children}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-muted-foreground ml-5.5 pl-[22px]">{children}</p>;
}
