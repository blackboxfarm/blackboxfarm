import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, RefreshCcw, Wallet, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { CheckCircle2, XCircle, AlertTriangle, KeyRound, Zap, LinkIcon, Play } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  profileKey: string;
  displayName: string;
}

interface SubscriptionConfig {
  profile_key: string;
  display_name: string;
  bot_secret_name: string;
  bot_username: string | null;
  private_chat_id: string | null;
  welcome_copy: string | null;
  expiry_copy: string | null;
  base_currency: string;
  display_currencies: string[];
  central_wallet_pubkey: string | null;
  is_active: boolean;
  admin_telegram_id?: number | null;
}

interface Tier {
  profile_key: string;
  tier_months: number;
  price_fiat: number;
  discount_pct: number;
  sort_order: number;
  is_active: boolean;
}

interface Subscription {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  tier_months: number;
  price_fiat: number;
  base_currency: string;
  quoted_sol: number;
  status: string;
  paid_at: string | null;
  expires_at: string | null;
  payment_wallet_pubkey: string;
  sweep_tx_signature: string | null;
  created_at: string;
}

export function SubscriptionAdminPanel({ profileKey, displayName }: Props) {
  return (
    <Tabs defaultValue="bot" className="space-y-3">
      <TabsList>
        <TabsTrigger value="bot">Bot &amp; Channel</TabsTrigger>
        <TabsTrigger value="pricing">Pricing</TabsTrigger>
        <TabsTrigger value="subs">Subscribers</TabsTrigger>
        <TabsTrigger value="treasury">Treasury</TabsTrigger>
      </TabsList>
      <TabsContent value="bot"><BotChannelSettings profileKey={profileKey} displayName={displayName} /></TabsContent>
      <TabsContent value="pricing"><PricingEditor profileKey={profileKey} /></TabsContent>
      <TabsContent value="subs"><SubscribersTable profileKey={profileKey} /></TabsContent>
      <TabsContent value="treasury"><TreasuryPanel profileKey={profileKey} /></TabsContent>
    </Tabs>
  );
}

// ---------- Bot & Channel ----------

function BotChannelSettings({ profileKey, displayName }: Props) {
  const [cfg, setCfg] = useState<SubscriptionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profile_subscription_configs')
      .select('*')
      .eq('profile_key', profileKey)
      .maybeSingle();
    setCfg(data ?? {
      profile_key: profileKey,
      display_name: displayName,
      bot_secret_name: '',
      bot_username: null,
      private_chat_id: null,
      welcome_copy: '',
      expiry_copy: '',
      base_currency: 'USD',
      display_currencies: ['USD', 'EUR', 'TRY', 'BRL'],
      central_wallet_pubkey: null,
      is_active: false,
      admin_telegram_id: null,
    });
    setLoading(false);
  };
  useEffect(() => { load(); }, [profileKey]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    const { error } = await supabase.from('profile_subscription_configs').upsert(cfg, { onConflict: 'profile_key' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved');
    load();
  };

  if (loading || !cfg) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader><CardTitle className="text-base">Bot &amp; Channel</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Display name</Label>
            <Input value={cfg.display_name} onChange={e => setCfg({ ...cfg, display_name: e.target.value })} />
          </div>
          <div>
            <Label>Bot username (without @)</Label>
            <Input value={cfg.bot_username ?? ''} onChange={e => setCfg({ ...cfg, bot_username: e.target.value })} placeholder="NoLubePremiumBot" />
          </div>
          <div className="sm:col-span-2">
            <BotSecretControl
              profileKey={profileKey}
              secretName={cfg.bot_secret_name}
              onSecretNameChange={n => setCfg({ ...cfg, bot_secret_name: n })}
            />
          </div>
          <div>
            <Label>Private channel chat_id</Label>
            <Input value={cfg.private_chat_id ?? ''} onChange={e => setCfg({ ...cfg, private_chat_id: e.target.value })} placeholder="-100123456789" />
          </div>
          <div>
            <Label>Admin Telegram ID (for setup self-test DM)</Label>
            <Input
              type="number"
              value={cfg.admin_telegram_id ?? ''}
              onChange={e => setCfg({ ...cfg, admin_telegram_id: e.target.value ? Number(e.target.value) : null })}
              placeholder="123456789"
            />
          </div>
          <div>
            <Label>Base currency</Label>
            <Input value={cfg.base_currency} onChange={e => setCfg({ ...cfg, base_currency: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <Label>Display currencies (comma-separated)</Label>
            <Input
              value={cfg.display_currencies.join(',')}
              onChange={e => setCfg({ ...cfg, display_currencies: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) })}
            />
          </div>
        </div>
        <div>
          <Label>Welcome message</Label>
          <Textarea value={cfg.welcome_copy ?? ''} onChange={e => setCfg({ ...cfg, welcome_copy: e.target.value })} rows={3} />
        </div>
        <div>
          <Label>Expiry message</Label>
          <Textarea value={cfg.expiry_copy ?? ''} onChange={e => setCfg({ ...cfg, expiry_copy: e.target.value })} rows={2} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={cfg.is_active} onCheckedChange={v => setCfg({ ...cfg, is_active: v })} />
          <span className="text-sm">{cfg.is_active ? 'Active' : 'Disabled'}</span>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save
        </Button>
      </CardContent>
    </Card>
    <AutomationCard profileKey={profileKey} />
    <WebhookCard profileKey={profileKey} />
    <SetupWizardCard profileKey={profileKey} />
    </div>
  );
}

// ---------- Pricing ----------

function PricingEditor({ profileKey }: { profileKey: string }) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('profile_subscription_tiers').select('*').eq('profile_key', profileKey).order('sort_order');
    setTiers((data ?? []) as Tier[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [profileKey]);

  const add = () => {
    setTiers([...tiers, { profile_key: profileKey, tier_months: 1, price_fiat: 10, discount_pct: 0, sort_order: tiers.length, is_active: true }]);
  };

  const removeTier = async (months: number) => {
    await supabase.from('profile_subscription_tiers').delete().eq('profile_key', profileKey).eq('tier_months', months);
    load();
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('profile_subscription_tiers').upsert(tiers, { onConflict: 'profile_key,tier_months' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Pricing saved');
    load();
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pricing Tiers</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Months</TableHead>
              <TableHead>Price (base)</TableHead>
              <TableHead>Discount %</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map((t, i) => (
              <TableRow key={`${t.tier_months}-${i}`}>
                <TableCell>
                  <Input type="number" value={t.tier_months} onChange={e => {
                    const next = [...tiers]; next[i] = { ...t, tier_months: parseInt(e.target.value || '1', 10) }; setTiers(next);
                  }} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" value={t.price_fiat} onChange={e => {
                    const next = [...tiers]; next[i] = { ...t, price_fiat: parseFloat(e.target.value || '0') }; setTiers(next);
                  }} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" value={t.discount_pct} onChange={e => {
                    const next = [...tiers]; next[i] = { ...t, discount_pct: parseFloat(e.target.value || '0') }; setTiers(next);
                  }} />
                </TableCell>
                <TableCell>
                  <Switch checked={t.is_active} onCheckedChange={v => {
                    const next = [...tiers]; next[i] = { ...t, is_active: v }; setTiers(next);
                  }} />
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => removeTier(t.tier_months)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex gap-2">
          <Button variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" />Add tier</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Subscribers ----------

function SubscribersTable({ profileKey }: { profileKey: string }) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profile_subscriptions')
      .select('*')
      .eq('profile_key', profileKey)
      .order('created_at', { ascending: false })
      .limit(200);
    setSubs((data ?? []) as Subscription[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [profileKey]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Subscribers</CardTitle>
        <Button size="sm" variant="ghost" onClick={load}><RefreshCcw className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>SOL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Wallet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map(s => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.telegram_username ? `@${s.telegram_username}` : `id:${s.telegram_user_id}`}
                  </TableCell>
                  <TableCell>{s.tier_months}mo</TableCell>
                  <TableCell>{s.base_currency} {Number(s.price_fiat).toFixed(2)}</TableCell>
                  <TableCell>{Number(s.quoted_sol).toFixed(4)}</TableCell>
                  <TableCell><Badge variant={s.status === 'paid' ? 'default' : 'outline'}>{s.status}</Badge></TableCell>
                  <TableCell className="text-xs">{s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>
                    <a href={`https://solscan.io/account/${s.payment_wallet_pubkey}`} target="_blank" rel="noreferrer" className="text-xs underline">
                      {s.payment_wallet_pubkey.slice(0, 6)}…<ExternalLink className="inline h-3 w-3 ml-0.5" />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
              {!subs.length && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6">No subscribers yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Treasury ----------

function TreasuryPanel({ profileKey }: { profileKey: string }) {
  const [cfg, setCfg] = useState<SubscriptionConfig | null>(null);
  const [paid, setPaid] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('profile_subscription_configs').select('*').eq('profile_key', profileKey).maybeSingle(),
      supabase.from('profile_subscriptions').select('*').eq('profile_key', profileKey).eq('status', 'paid').is('swept_at', null).limit(100),
    ]);
    setCfg(c);
    setPaid((p ?? []) as Subscription[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [profileKey]);

  const sweep = async (id: string) => {
    const { data, error } = await supabase.functions.invoke('profile-subscription-sweep', { body: { subscription_id: id } });
    if (error) { toast.error(error.message); return; }
    if ((data as any)?.ok) toast.success(`Swept tx ${(data as any).signature?.slice(0, 8)}…`);
    else toast.warning((data as any)?.reason ?? 'Nothing to sweep');
    load();
  };

  const setCentralWallet = async (pubkey: string) => {
    if (!cfg) return;
    const { error } = await supabase
      .from('profile_subscription_configs')
      .update({ central_wallet_pubkey: pubkey })
      .eq('profile_key', profileKey);
    if (error) toast.error(error.message); else { toast.success('Central wallet saved'); load(); }
  };

  if (loading || !cfg) return <Loader2 className="h-4 w-4 animate-spin" />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" />Treasury</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Central sweep wallet (pubkey)</Label>
          <div className="flex gap-2">
            <Input
              defaultValue={cfg.central_wallet_pubkey ?? ''}
              onBlur={e => e.target.value !== cfg.central_wallet_pubkey && setCentralWallet(e.target.value.trim())}
              placeholder="Paste a SOL pubkey to receive sweeps"
            />
            {cfg.central_wallet_pubkey && (
              <Button variant="outline" asChild>
                <a href={`https://solscan.io/account/${cfg.central_wallet_pubkey}`} target="_blank" rel="noreferrer">Solscan</a>
              </Button>
            )}
          </div>
        </div>
        <div>
          <Label>Unswept paid wallets</Label>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Wallet</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paid.map(s => (
                <TableRow key={s.id}>
                  <TableCell>{s.telegram_username ? `@${s.telegram_username}` : s.telegram_user_id}</TableCell>
                  <TableCell>{s.paid_at ? new Date(s.paid_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell><code className="text-xs">{s.payment_wallet_pubkey.slice(0, 8)}…</code></TableCell>
                  <TableCell><Button size="sm" onClick={() => sweep(s.id)}>Sweep</Button></TableCell>
                </TableRow>
              ))}
              {!paid.length && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">All clean.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}