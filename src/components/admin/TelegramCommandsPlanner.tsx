import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';

// ─── Data derived from holdersintel-bot-webhook/index.ts ───

const TIERS = [
  { key: 'free', label: 'Free (Unlinked)', emoji: '🆓', rank: 0, color: 'bg-muted text-muted-foreground', description: 'No account linked. Meta commands only.' },
  { key: 'auth', label: 'Authenticated', emoji: '🔓', rank: 1, color: 'bg-secondary text-secondary-foreground', description: 'Free account linked via /register. Lite analysis.' },
  { key: 'x_subscriber', label: 'X Subscriber', emoji: '𝕏', rank: 2, color: 'bg-blue-500/20 text-blue-300', description: '$3.99/mo. Verified via X community code. Full holders + momentum.' },
  { key: 'group_plus', label: 'Group+ (Proposed)', emoji: '👥', rank: 1.5, color: 'bg-amber-500/20 text-amber-300', description: 'NEW — For registered users in groups with bot installed. Limited freebies to upsell.' },
  { key: 'pro', label: 'Pro', emoji: '⭐', rank: 3, color: 'bg-purple-500/20 text-purple-300', description: '$9.99/mo. Oracle, wallet analysis, full AI.' },
  { key: 'dev', label: 'Developer', emoji: '🛠', rank: 4, color: 'bg-green-500/20 text-green-300', description: 'API access, 200 lookups/hr.' },
  { key: 'enterprise', label: 'Enterprise', emoji: '🏢', rank: 5, color: 'bg-red-500/20 text-red-300', description: 'Team seats, 500 lookups/hr.' },
];

const RATE_LIMITS: Record<string, number> = {
  free: 0,
  auth: 3,
  group_plus: 5,
  x_subscriber: 10,
  pro: 25,
  dev: 50,
  enterprise: 100,
};

type CmdAccess = '✅' | '🔒' | 'lite' | '—' | '✅ (DM)' | '✅ (short)' | '🆕';

interface BotCommand {
  command: string;
  aliases: string[];
  description: string;
  category: 'meta' | 'analysis' | 'advanced' | 'pro' | 'admin';
  botFatherRegistered: boolean;
  implementedInWebhook: boolean;
  access: Record<string, CmdAccess>;
  dmBehavior: string;
  groupBehavior: string;
  notes?: string;
}

const COMMANDS: BotCommand[] = [
  // META
  {
    command: '/start', aliases: [], description: 'Welcome & setup', category: 'meta',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '✅', auth: '✅', group_plus: '✅', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full welcome with registration steps',
    groupBehavior: 'Short welcome, link to DM',
  },
  {
    command: '/register', aliases: [], description: 'Link BlackBox Farm account', category: 'meta',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '✅', auth: '✅', group_plus: '✅', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full registration flow with code validation',
    groupBehavior: 'Redirect to DM — "DM me to register"',
  },
  {
    command: '/status', aliases: [], description: 'Check subscription tier & usage', category: 'meta',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '✅', auth: '✅', group_plus: '✅', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full status with tier, rate limits, linked date',
    groupBehavior: 'Short status — tier badge only',
  },
  {
    command: '/help', aliases: [], description: 'Show available commands per tier', category: 'meta',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '✅', auth: '✅', group_plus: '✅', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full command list with ✅/🔒 per tier + upsell links',
    groupBehavior: 'Abbreviated list, link to DM for full menu',
  },
  // ANALYSIS - Auth tier
  {
    command: '/holders', aliases: [], description: 'Holder distribution analysis', category: 'analysis',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '🔒', auth: 'lite', group_plus: 'lite', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full: tier bars, LP%, health, AI analysis. Lite: count + top10% + score only.',
    groupBehavior: 'Abbreviated summary (ai_summary). Full sent to DM.',
    notes: 'Auth gets lite (count, top10%, health). X Sub+ gets full distribution bars + AI.',
  },
  {
    command: '/ca', aliases: [], description: 'Default condensed holder analysis', category: 'analysis',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '🔒', auth: '✅', group_plus: '✅ (short)', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Condensed report with key stats',
    groupBehavior: 'Same condensed format — safe for group display',
  },
  {
    command: '/quick', aliases: ['/q'], description: 'Fast holder count & key stats', category: 'analysis',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '🔒', auth: '✅', group_plus: '✅', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'One-liner: holders, health, top10%',
    groupBehavior: 'Same one-liner — ideal for groups',
    notes: 'Best candidate for Group+ freebie — fast, useful, not too revealing.',
  },
  {
    command: '/risk', aliases: ['/r'], description: 'Risk & stability assessment', category: 'analysis',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '🔒', auth: 'lite', group_plus: 'lite', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full: risk assessment + reasoning. Lite: emoji only (🟢/🔴).',
    groupBehavior: 'Lite risk signal in group (emoji + one line). Full via DM only.',
    notes: 'Auth/Group+ sees color emoji only. X Sub+ sees full reasoning.',
  },
  {
    command: '/ai', aliases: [], description: 'Descriptive AI analysis snapshot', category: 'analysis',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '🔒', auth: '✅', group_plus: '🔒', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full AI narrative analysis',
    groupBehavior: 'Redirect to DM — too long for group',
    notes: 'Group+ does NOT get this — it\'s an upsell driver.',
  },
  // ADVANCED - X Sub tier
  {
    command: '/momentum', aliases: ['/m'], description: 'Volume & price momentum scoring', category: 'advanced',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '🔒', auth: '🔒', group_plus: '🔒', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full momentum breakdown: score, signals, volume, buy/sell ratio',
    groupBehavior: 'Score + action only. Details via DM.',
  },
  {
    command: '/alerts', aliases: [], description: 'Manage alert preferences', category: 'advanced',
    botFatherRegistered: true, implementedInWebhook: false,
    access: { free: '🔒', auth: '🔒', group_plus: '🔒', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Alert config menu',
    groupBehavior: 'Redirect to DM',
    notes: 'NOT YET IMPLEMENTED in webhook. Planned.',
  },
  // PRO
  {
    command: '/oracle', aliases: ['/o'], description: 'Developer reputation lookup', category: 'pro',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '🔒', auth: '🔒', group_plus: '🔒', x_subscriber: '🔒', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full dev reputation mesh: history, linked wallets, trust score',
    groupBehavior: 'Trust badge only (🟢/🟡/🔴). Full via DM.',
  },
  {
    command: '/wallet', aliases: ['/w'], description: 'Wallet behavior analysis', category: 'pro',
    botFatherRegistered: true, implementedInWebhook: true,
    access: { free: '🔒', auth: '🔒', group_plus: '🔒', x_subscriber: '🔒', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Full wallet behavioral analysis',
    groupBehavior: 'Redirect to DM — sensitive data',
  },
  // PROPOSED GROUP+ COMMANDS
  {
    command: '/price', aliases: ['/p'], description: 'Quick price + mcap check', category: 'analysis',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '🔒', auth: '✅', group_plus: '✅', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Price, mcap, 24h change',
    groupBehavior: 'Same — safe for groups',
    notes: '🆕 PROPOSED — Great group freebie. Pulls from DexScreener. No deep intel leaked.',
  },
  {
    command: '/check', aliases: ['/c'], description: 'Quick safety check (rug score)', category: 'analysis',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '🔒', auth: '🔒', group_plus: '✅', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Safety score: LP locked?, mint authority?, freeze authority?',
    groupBehavior: 'Same compact format',
    notes: '🆕 PROPOSED — Group+ exclusive. Quick rug check without full analysis. Drives curiosity for /risk.',
  },
  {
    command: '/top', aliases: [], description: 'Trending tokens right now', category: 'analysis',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '🔒', auth: '🔒', group_plus: '✅', x_subscriber: '✅', pro: '✅', dev: '✅', enterprise: '✅' },
    dmBehavior: 'Top 5 trending by momentum',
    groupBehavior: 'Top 3 tickers only — teaser',
    notes: '🆕 PROPOSED — Group engagement driver. Shows trending, no deep analysis.',
  },
  // ─── ADMIN COMMANDS (Channel/Group only) ───
  {
    command: '/delay', aliases: [], description: 'Set bot response delay (ms)', category: 'admin',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '—', auth: '—', group_plus: '—', x_subscriber: '—', pro: '—', dev: '—', enterprise: '—' },
    dmBehavior: 'N/A — admin-only, group context',
    groupBehavior: 'Admin sets delay in ms so other bots (Phanes, Skeleton) fire first. Usage: /delay 3000',
    notes: 'Channel admin only. Stored in admin_config.delay_ms. Default 0.',
  },
  {
    command: '/verbose', aliases: [], description: 'Toggle verbose vs short replies', category: 'admin',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '—', auth: '—', group_plus: '—', x_subscriber: '—', pro: '—', dev: '—', enterprise: '—' },
    dmBehavior: 'N/A — admin-only, group context',
    groupBehavior: 'Toggles between long-form and short-form bot replies in this channel. /verbose on | /verbose off',
    notes: 'Channel admin only. Stored in admin_config.verbose. Default false (short).',
  },
  {
    command: '/adminonly', aliases: [], description: 'Restrict commands to admins', category: 'admin',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '—', auth: '—', group_plus: '—', x_subscriber: '—', pro: '—', dev: '—', enterprise: '—' },
    dmBehavior: 'N/A — admin-only, group context',
    groupBehavior: 'When ON, only group admins can trigger analysis commands. Members see "ask an admin." /adminonly on | off',
    notes: 'Channel admin only. Stored in admin_config.admin_only_commands. Default false.',
  },
  {
    command: '/devalerts', aliases: [], description: 'Toggle dev wallet launch alerts', category: 'admin',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '—', auth: '—', group_plus: '—', x_subscriber: '—', pro: '—', dev: '—', enterprise: '—' },
    dmBehavior: 'N/A — admin-only, group context',
    groupBehavior: 'Toggles 🚨 Dev Wallet Alerts — notify channel when a known creator launches a new token. /devalerts on | off',
    notes: 'Channel admin only. Stored in admin_config.dev_alerts. Requires paid channel.',
  },
  {
    command: '/toggle', aliases: [], description: 'Enable/disable specific commands', category: 'admin',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '—', auth: '—', group_plus: '—', x_subscriber: '—', pro: '—', dev: '—', enterprise: '—' },
    dmBehavior: 'N/A — admin-only, group context',
    groupBehavior: 'Enable/disable individual commands for this channel. Usage: /toggle quick off | /toggle risk on',
    notes: 'Channel admin only. Stored in admin_config.disabled_commands[]. Overrides tier access.',
  },
  {
    command: '/channelstatus', aliases: ['/chstatus'], description: 'Show channel bot config', category: 'admin',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '—', auth: '—', group_plus: '—', x_subscriber: '—', pro: '—', dev: '—', enterprise: '—' },
    dmBehavior: 'N/A — admin-only, group context',
    groupBehavior: 'Shows current config: delay, verbose, admin-only, dev alerts, disabled commands, payment status, install date',
    notes: 'Channel admin only. Read-only status dump of admin_config + payment status.',
  },
  {
    command: '/setlevel', aliases: [], description: 'Set max analysis tier for channel', category: 'admin',
    botFatherRegistered: false, implementedInWebhook: false,
    access: { free: '—', auth: '—', group_plus: '—', x_subscriber: '—', pro: '—', dev: '—', enterprise: '—' },
    dmBehavior: 'N/A — admin-only, group context',
    groupBehavior: 'Cap the max tier available in this channel. Usage: /setlevel auth | /setlevel x_subscriber. Prevents Pro commands in public groups.',
    notes: 'Channel admin only. Stored in admin_config.max_tier. Default: follows user tier.',
  },
];

const BOTFATHER_COMMANDS = [
  'start', 'register', 'status', 'help',
  'holders', 'ca', 'quick', 'verdict', 'ai',
  'momentum', 'alerts',
  'oracle', 'wallet',
];

const categoryLabels: Record<string, { label: string; emoji: string }> = {
  meta: { label: 'General / Meta', emoji: '⚙️' },
  analysis: { label: 'Analysis (Auth+)', emoji: '📊' },
  advanced: { label: 'Advanced (X Sub+)', emoji: '🔥' },
  pro: { label: 'Pro Intelligence', emoji: '💎' },
  admin: { label: 'Channel Admin', emoji: '🛡️' },
};

const TierBadge = ({ tier }: { tier: typeof TIERS[0] }) => (
  <Badge className={`${tier.color} text-xs whitespace-nowrap`}>
    {tier.emoji} {tier.label}
  </Badge>
);

const AccessCell = ({ access }: { access: CmdAccess }) => {
  const styles: Record<string, string> = {
    '✅': 'text-green-400 font-bold',
    '🔒': 'text-muted-foreground/50',
    'lite': 'text-amber-400',
    '—': 'text-muted-foreground/30',
    '✅ (DM)': 'text-blue-400',
    '✅ (short)': 'text-cyan-400',
    '🆕': 'text-pink-400 font-bold',
  };
  return <span className={styles[access] || 'text-foreground'}>{access}</span>;
};

export function TelegramCommandsPlanner() {
  const [activeView, setActiveView] = useState('matrix');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          🤖 Telegram Bot Command Planner
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Internal planning view — tier gating, group vs DM behavior, BotFather registration status, and proposed new commands.
        </p>
      </div>

      <Tabs value={activeView} onValueChange={setActiveView} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="matrix">📋 Tier Matrix</TabsTrigger>
          <TabsTrigger value="context">💬 Group vs DM</TabsTrigger>
          <TabsTrigger value="botfather">🤖 BotFather</TabsTrigger>
          <TabsTrigger value="tiers">📊 Tier Breakdown</TabsTrigger>
          <TabsTrigger value="proposed">🆕 Proposed</TabsTrigger>
          <TabsTrigger value="bubblemap">🫧 Bubble Map Tiers</TabsTrigger>
          <TabsTrigger value="channels">📡 Channel Config</TabsTrigger>
        </TabsList>

        {/* ════════ TIER MATRIX ════════ */}
        <TabsContent value="matrix">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Command × Tier Access Matrix</CardTitle>
              <p className="text-xs text-muted-foreground">
                ✅ = Full access | lite = Limited output | 🔒 = Locked | ✅ (short) = Abbreviated | 🆕 = Proposed
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead compact className="sticky left-0 bg-card z-10 min-w-[140px]">Command</TableHead>
                    {TIERS.map(t => (
                      <TableHead compact key={t.key} className="text-center min-w-[80px]">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{t.emoji}</span>
                          <span className="text-[10px] leading-tight">{t.label.split('(')[0].trim()}</span>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(['meta', 'analysis', 'advanced', 'pro', 'admin'] as const).map(cat => (
                    <React.Fragment key={cat}>
                      <TableRow className="bg-muted/30">
                        <TableCell compact colSpan={TIERS.length + 1} className="font-semibold text-foreground">
                          {categoryLabels[cat].emoji} {categoryLabels[cat].label}
                        </TableCell>
                      </TableRow>
                      {COMMANDS.filter(c => c.category === cat).map(cmd => (
                        <TableRow key={cmd.command} className={!cmd.implementedInWebhook ? 'opacity-60 bg-pink-500/5' : ''}>
                          <TableCell compact className="sticky left-0 bg-card z-10 font-mono text-xs">
                            <div className="flex items-center gap-1">
                              {cmd.command}
                              {cmd.aliases.length > 0 && (
                                <span className="text-muted-foreground text-[10px]">
                                  ({cmd.aliases.join(', ')})
                                </span>
                              )}
                              {!cmd.implementedInWebhook && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 text-pink-400 border-pink-400/30">
                                  planned
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          {TIERS.map(t => (
                            <TableCell compact key={t.key} className="text-center">
                              <AccessCell access={cmd.access[t.key] || '🔒'} />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ GROUP vs DM ════════ */}
        <TabsContent value="context">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Group Chat vs Direct Message Behavior</CardTitle>
              <p className="text-xs text-muted-foreground">
                How each command responds differently based on chat context. Group chats get abbreviated responses to avoid spam.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead compact className="min-w-[100px]">Command</TableHead>
                    <TableHead compact className="min-w-[250px]">📩 DM Behavior</TableHead>
                    <TableHead compact className="min-w-[250px]">👥 Group Behavior</TableHead>
                    <TableHead compact className="min-w-[200px]">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COMMANDS.map(cmd => (
                    <TableRow key={cmd.command} className={!cmd.implementedInWebhook ? 'opacity-60' : ''}>
                      <TableCell compact className="font-mono text-xs font-semibold">{cmd.command}</TableCell>
                      <TableCell compact className="text-xs">{cmd.dmBehavior}</TableCell>
                      <TableCell compact className="text-xs">{cmd.groupBehavior}</TableCell>
                      <TableCell compact className="text-xs text-muted-foreground">{cmd.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="bg-card border-border mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">🧠 Group+ Flow Design</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold text-foreground">👤 User Journey in Group</h4>
                  <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1">
                    <li>User sees bot reply to someone's /quick in a group</li>
                    <li>User DMs the bot → gets /start welcome</li>
                    <li>User does /register with their code</li>
                    <li>Now unlocked: /quick, /price, /check in groups</li>
                    <li>Uses /risk → sees 🟢/🔴 only → "upgrade for full analysis"</li>
                    <li>Curiosity → subscribes to X or Pro</li>
                  </ol>
                </div>
                <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold text-foreground">🛡️ Group Admin Value</h4>
                  <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                    <li>Bot adds value to their group for free</li>
                    <li>Members get /quick and /check without leaving</li>
                    <li>Premium commands tease but don't reveal</li>
                    <li>Group admin gets exposure credit / referral?</li>
                    <li>Bot never posts paywalled content in group</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ BOTFATHER ════════ */}
        <TabsContent value="botfather">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">🤖 Currently in BotFather</CardTitle>
                <p className="text-xs text-muted-foreground">Commands registered with @BotFather (appear in / menu)</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {BOTFATHER_COMMANDS.map(cmd => {
                    const full = COMMANDS.find(c => c.command === `/${cmd}`);
                    return (
                      <div key={cmd} className="flex items-center gap-2 text-xs font-mono bg-muted/30 rounded px-2 py-1.5">
                        <span className="text-green-400">/{cmd}</span>
                        <span className="text-muted-foreground">—</span>
                        <span className="text-muted-foreground">{full?.description || '?'}</span>
                        {full?.implementedInWebhook ? (
                          <Badge className="ml-auto text-[9px] bg-green-500/20 text-green-400">live</Badge>
                        ) : (
                          <Badge className="ml-auto text-[9px] bg-amber-500/20 text-amber-400">planned</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">🆕 Proposed New Commands</CardTitle>
                <p className="text-xs text-muted-foreground">Not yet in BotFather — need to be added</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {COMMANDS.filter(c => !c.botFatherRegistered).map(cmd => (
                    <div key={cmd.command} className="flex items-center gap-2 text-xs font-mono bg-pink-500/10 rounded px-2 py-1.5">
                      <span className="text-pink-400">{cmd.command}</span>
                      {cmd.aliases.length > 0 && <span className="text-muted-foreground">({cmd.aliases.join(', ')})</span>}
                      <span className="text-muted-foreground">—</span>
                      <span className="text-muted-foreground">{cmd.description}</span>
                      <Badge className="ml-auto text-[9px] bg-pink-500/20 text-pink-400">new</Badge>
                    </div>
                  ))}
                </div>
                <Separator className="my-3" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">BotFather paste-ready:</p>
                  <pre className="bg-muted/50 rounded p-2 text-[10px] whitespace-pre-wrap">
{COMMANDS.filter(c => c.botFatherRegistered || !c.botFatherRegistered).map(c => 
  `${c.command.replace('/', '')} - ${c.description}`
).join('\n')}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ════════ TIER BREAKDOWN ════════ */}
        <TabsContent value="tiers">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TIERS.map(tier => {
              const tierCommands = COMMANDS.filter(c => {
                const access = c.access[tier.key];
                return access && access !== '🔒' && access !== '—';
              });
              return (
                <Card key={tier.key} className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TierBadge tier={tier} />
                      <span className="text-xs text-muted-foreground ml-auto">
                        {RATE_LIMITS[tier.key] || 0}/hr
                      </span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{tier.description}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {tierCommands.map(cmd => (
                        <div key={cmd.command} className="flex items-center gap-1.5 text-xs">
                          <AccessCell access={cmd.access[tier.key]} />
                          <span className="font-mono text-foreground">{cmd.command}</span>
                          <span className="text-muted-foreground truncate">{cmd.description}</span>
                        </div>
                      ))}
                      {tierCommands.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No commands available</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ════════ PROPOSED GROUP+ ════════ */}
        <TabsContent value="proposed">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">🆕 Group+ Tier — Proposed Design</CardTitle>
              <p className="text-xs text-muted-foreground">
                A special tier for users who are registered AND chatting in groups with the bot installed.
                Gives breadcrumb features to drive subscriptions.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/20">
                  <h4 className="text-sm font-semibold text-green-400 mb-2">✅ Group+ Gets</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• /quick — Fast stats (holder count, health, top10%)</li>
                    <li>• /price — Price + mcap + 24h (DexScreener)</li>
                    <li>• /check — Quick rug safety score</li>
                    <li>• /risk — Emoji only (🟢/🔴) no reasoning</li>
                    <li>• /ca — Short condensed report</li>
                    <li>• /top — Trending tickers (top 3 in group)</li>
                  </ul>
                </div>
                <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
                  <h4 className="text-sm font-semibold text-red-400 mb-2">🔒 Group+ Does NOT Get</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• /holders — Full distribution bars + AI</li>
                    <li>• /momentum — Momentum scoring</li>
                    <li>• /ai — Full AI narrative</li>
                    <li>• /oracle — Dev reputation</li>
                    <li>• /wallet — Wallet analysis</li>
                    <li>• /alerts — Alert management</li>
                  </ul>
                </div>
                <div className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/20">
                  <h4 className="text-sm font-semibold text-amber-400 mb-2">🎯 Upsell Triggers</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• /risk shows color but says "upgrade for reasoning"</li>
                    <li>• /holders lite says "upgrade for full breakdown"</li>
                    <li>• /check teases "dev reputation: 🔒 Pro only"</li>
                    <li>• Rate limit: 5/hr (vs 10 for X Sub)</li>
                    <li>• Every locked command shows upgrade link</li>
                    <li>• Weekly digest DM: "You searched 12 tokens this week..."</li>
                  </ul>
                </div>
              </div>

              <Separator />

              <div className="bg-muted/30 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">🔑 Requirements for Group+ Access</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div>
                    <p className="font-semibold text-foreground mb-1">User Must:</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Have a BlackBox Farm web account</li>
                      <li>DM the bot first (activates DM channel)</li>
                      <li>Register via /register CODE in DM</li>
                      <li>Then commands work in groups too</li>
                    </ol>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1">Bot Must Detect:</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Chat type: private vs group/supergroup</li>
                      <li>User's registration status</li>
                      <li>User's subscription tier</li>
                      <li>Whether user has DM'd bot before</li>
                      <li>Never show paid content in groups from non-paid users</li>
                    </ol>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ BUBBLE MAP TIERS ════════ */}
        <TabsContent value="bubblemap">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">🫧 Bubble Map — Feature Tiers</CardTitle>
              <p className="text-xs text-muted-foreground">
                Spidering features gated by subscription tier. Displayed on /bubblepromo and /bubblemap pages.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead compact className="min-w-[140px]">Feature</TableHead>
                    <TableHead compact className="text-center">Free</TableHead>
                    <TableHead compact className="text-center">Logged In</TableHead>
                    <TableHead compact className="text-center">X Sub</TableHead>
                    <TableHead compact className="text-center">Pro $9.99</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { feature: 'Daily Lookups', free: '2', auth: '2', x: '10', pro: '∞' },
                    { feature: 'Graph Visualization', free: '✅', auth: '✅', x: '✅', pro: '✅' },
                    { feature: 'Auto-Spider', free: '🔒', auth: '🔒', x: '✅', pro: '✅' },
                    { feature: 'Find KYC Root', free: '🔒', auth: '🔒', x: '🔒', pro: '✅' },
                    { feature: 'Find All Tokens', free: '🔒', auth: '🔒', x: '3/day', pro: '✅' },
                    { feature: 'Deep Spider', free: '🔒', auth: '🔒', x: '🔒', pro: '✅' },
                    { feature: 'Node Cap', free: '20', auth: '40', x: '80', pro: '∞' },
                    { feature: 'Dev Wallet Alerts', free: '🔒', auth: '🔒', x: '✅', pro: '✅' },
                    { feature: 'Export Graph Data', free: '🔒', auth: '🔒', x: '🔒', pro: '✅' },
                  ].map((row, i) => (
                    <TableRow key={i}>
                      <TableCell compact className="font-medium text-xs">{row.feature}</TableCell>
                      <TableCell compact className="text-center text-xs">{row.free}</TableCell>
                      <TableCell compact className="text-center text-xs">{row.auth}</TableCell>
                      <TableCell compact className="text-center text-xs">{row.x}</TableCell>
                      <TableCell compact className="text-center text-xs">{row.pro}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ CHANNEL CONFIG ════════ */}
        <TabsContent value="channels">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">📡 Channel Installation & Config Model</CardTitle>
              <p className="text-xs text-muted-foreground">
                One-time 0.25 SOL activation per channel. Each channel has independent config.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">💳 Activation Flow</h4>
                  <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                    <li>User creates account on website</li>
                    <li>Gets registration code, links to bot</li>
                    <li>Adds bot to channel/group</li>
                    <li>Bot records installation in dashboard</li>
                    <li>User generates SOL payment wallet</li>
                    <li>Sends 0.25 SOL → clicks "Verify Payment"</li>
                    <li>Bot activates in that channel</li>
                  </ol>
                </div>
                <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">⚙️ Per-Channel Config</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• <span className="text-foreground font-mono">/delay</span> — response delay in ms</li>
                    <li>• Verbose vs short-form replies</li>
                    <li>• Admin-only vs all-member commands</li>
                    <li>• Dev Wallet Alerts toggle</li>
                    <li>• Each channel independent config</li>
                  </ul>
                </div>
                <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">📋 Rules</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Kicked bots can be re-added, no re-charge</li>
                    <li>• One account can manage many channels</li>
                    <li>• No refunds — lifetime activation</li>
                    <li>• In-channel: only channel commands</li>
                    <li>• DM: separate full personal access</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TelegramCommandsPlanner;
