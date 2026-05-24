import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Play, RefreshCw } from 'lucide-react';

interface BotSummary {
  bot_username: string;
  bot_display_name: string | null;
  count: number;
  last_seen: string | null;
  last_edit: string | null;
  manual: number;
  passive: number;
}

interface Sample {
  id: string;
  token_mint: string;
  bot_username: string | null;
  bot_display_name: string | null;
  raw_text: string;
  raw_entities_jsonb: any;
  inline_buttons_jsonb: any;
  has_photo: boolean;
  caption: string | null;
  received_at: string;
  edited_at: string | null;
  parser_used: string | null;
  parser_attempt_jsonb: any;
  source: string;
}

export default function BlackBoxParserSamples() {
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [overrideMint, setOverrideMint] = useState('');
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(false);

  const loadBots = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('blackbox-parser-probe', {
        body: { action: 'list' },
      });
      if (error) throw error;
      setBots(data?.bots || []);
    } catch (e: any) {
      toast.error(`Load failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const probe = async () => {
    setProbing(true);
    try {
      const body: any = { action: 'probe' };
      if (overrideMint.trim()) body.token_mint = overrideMint.trim();
      const { data, error } = await supabase.functions.invoke('blackbox-parser-probe', { body });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'probe failed');
      toast.success(`Probed ${data.mint?.slice(0, 8)}… · ${data.samples_saved} samples saved (${data.total_msgs_fetched} msgs fetched)`);
      await loadBots();
    } catch (e: any) {
      toast.error(`Probe failed: ${e.message}`);
    } finally {
      setProbing(false);
    }
  };

  const openBot = async (username: string) => {
    setSelectedBot(username);
    setSamplesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('blackbox-parser-probe', {
        body: { action: 'samples', bot_username: username, limit: 20 },
      });
      if (error) throw error;
      setSamples(data?.samples || []);
    } catch (e: any) {
      toast.error(`Samples failed: ${e.message}`);
    } finally {
      setSamplesLoading(false);
    }
  };

  const exportFixtures = () => {
    if (!selectedBot) return;
    const blob = new Blob([JSON.stringify(samples, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parser-samples-${selectedBot}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => { loadBots(); }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🔬 BlackBox Parser-Discovery Harness
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Posts a CA into the BlackBox group, waits 30s, and captures every bot reply verbatim
            so we can build accurate per-bot parsers from real data. Real Insiders runs also feed
            samples here passively.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="Override CA (optional — leave blank for latest Insiders CA)"
              value={overrideMint}
              onChange={(e) => setOverrideMint(e.target.value)}
              className="max-w-md"
            />
            <Button onClick={probe} disabled={probing}>
              {probing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Probe Now (30s)
            </Button>
            <Button variant="outline" onClick={loadBots} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bots Detected ({bots.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {bots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No samples yet. Run a probe.</p>
          ) : (
            <div className="space-y-2">
              {bots.sort((a, b) => b.count - a.count).map((b) => (
                <button
                  key={b.bot_username}
                  onClick={() => openBot(b.bot_username)}
                  className="w-full text-left p-3 border rounded-md hover:bg-accent transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-mono text-sm">@{b.bot_username}</div>
                    {b.bot_display_name && <div className="text-xs text-muted-foreground">{b.bot_display_name}</div>}
                  </div>
                  <div className="flex gap-2 items-center text-xs">
                    <Badge variant="secondary">{b.count} samples</Badge>
                    {b.manual > 0 && <Badge variant="outline">{b.manual} manual</Badge>}
                    {b.passive > 0 && <Badge variant="outline">{b.passive} passive</Badge>}
                    {b.last_edit && <Badge variant="default">edits in place</Badge>}
                    {b.last_seen && (
                      <span className="text-muted-foreground">
                        {new Date(b.last_seen).toLocaleString()}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedBot} onOpenChange={(o) => !o && setSelectedBot(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>@{selectedBot} — raw samples</span>
              <Button size="sm" variant="outline" onClick={exportFixtures}>Export JSON</Button>
            </DialogTitle>
          </DialogHeader>
          {samplesLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {samples.map((s) => {
                const parsed = s.parser_attempt_jsonb || {};
                const fieldCount = Object.values(parsed).filter((v) => v !== null && v !== undefined).length;
                return (
                  <div key={s.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{s.source}</Badge>
                      <Badge variant="secondary">parser: {s.parser_used || '?'}</Badge>
                      <Badge>{fieldCount} fields caught</Badge>
                      {s.edited_at && <Badge variant="default">edited</Badge>}
                      {s.has_photo && <Badge variant="outline">photo</Badge>}
                      {s.inline_buttons_jsonb && <Badge variant="outline">buttons</Badge>}
                      <span className="text-muted-foreground ml-auto">
                        {new Date(s.received_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">CA: {s.token_mint}</div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">{s.raw_text}</pre>
                    {fieldCount > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Parsed fields</summary>
                        <pre className="mt-1 bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(parsed, null, 2)}</pre>
                      </details>
                    )}
                    {s.inline_buttons_jsonb && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Inline buttons</summary>
                        <pre className="mt-1 bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(s.inline_buttons_jsonb, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                );
              })}
              {samples.length === 0 && <p className="text-sm text-muted-foreground">No samples for this bot yet.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}