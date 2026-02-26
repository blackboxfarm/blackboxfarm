import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Bug, Shield, ShieldAlert, ShieldCheck, Network, Wallet,
  ChevronDown, CheckCircle2, XCircle, Clock, Loader2, ExternalLink,
  AlertTriangle, Twitter, Globe, MessageCircle, Coins, Gavel
} from "lucide-react";

interface SpiderStep {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail: string;
  timestamp?: string;
}

interface SpiderResult {
  verdict: 'red' | 'green' | 'yellow';
  verdictReason: string;
  inputType: 'token' | 'wallet' | 'handle';
  inputQuery: string;
  resolvedCreator: string | null;
  creatorSource: string | null;
  tokenInfo: { name?: string; symbol?: string; mint?: string; imageUri?: string } | null;
  existingReputation: {
    blacklisted: boolean;
    whitelisted: boolean;
    trustLevel: string | null;
    reputationScore: number | null;
    tokensRugged: number;
    blacklistReason: string | null;
    whitelistReason: string | null;
  };
  genealogy: {
    kycRoot: string | null;
    parents: string[];
    satellites: string[];
    depth: number;
  };
  discoveredTokens: Array<{
    mint: string;
    name: string | null;
    symbol: string | null;
    status: string | null;
    createdAt: string | null;
  }>;
  discoveredSocials: Array<{
    type: string;
    identifier: string;
    relationship: string;
    source: string;
  }>;
  meshUpdates: {
    blacklistAdded: number;
    whitelistAdded: number;
    meshLinksAdded: number;
    reputationUpdated: boolean;
  };
  steps: SpiderStep[];
}

const VERDICT_CONFIG = {
  red: {
    icon: ShieldAlert,
    label: '🔴 BAD ACTOR',
    bgClass: 'bg-red-500/10 border-red-500/40',
    textClass: 'text-red-400',
    badgeClass: 'bg-red-500/20 text-red-400',
    description: 'Known bad actor — entire network blacklisted',
  },
  green: {
    icon: ShieldCheck,
    label: '🟢 TRUSTED',
    bgClass: 'bg-green-500/10 border-green-500/40',
    textClass: 'text-green-400',
    badgeClass: 'bg-green-500/20 text-green-400',
    description: 'Known good actor — network whitelisted',
  },
  yellow: {
    icon: Shield,
    label: '🟡 UNKNOWN',
    bgClass: 'bg-yellow-500/10 border-yellow-500/40',
    textClass: 'text-yellow-400',
    badgeClass: 'bg-yellow-500/20 text-yellow-400',
    description: 'New entity — indexed as neutral for monitoring',
  },
};

const OracleMasterSpider = () => {
  const [devWallet, setDevWallet] = useState("");
  const [tokenMint, setTokenMint] = useState("");
  const [xAccount, setXAccount] = useState("");
  const [actorType, setActorType] = useState<'auto' | 'bad' | 'good'>('auto');
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<SpiderResult | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [socialsOpen, setSocialsOpen] = useState(false);
  const [genealogyOpen, setGenealogyOpen] = useState(false);

  const hasInput = devWallet.trim() || tokenMint.trim() || xAccount.trim();

  const isValidSolanaAddress = (addr: string) => {
    if (!addr.trim()) return true; // empty is ok (optional)
    return addr.trim().length >= 32 && addr.trim().length <= 44 && /^[A-HJ-NP-Za-km-z1-9]+$/.test(addr.trim());
  };

  const spiderMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        forceVerdict: actorType !== 'auto' ? (actorType === 'bad' ? 'red' : 'green') : undefined,
        reason: reason.trim() || undefined,
      };

      // Send structured multi-input
      if (devWallet.trim()) body.devWallet = devWallet.trim();
      if (tokenMint.trim()) body.tokenMint = tokenMint.trim();
      if (xAccount.trim()) body.xAccount = xAccount.trim();

      // Backward compat: if only one field, also send as query
      const filledFields = [devWallet.trim(), tokenMint.trim(), xAccount.trim()].filter(Boolean);
      if (filledFields.length === 1) {
        body.query = filledFields[0];
      }

      const { data, error } = await supabase.functions.invoke('oracle-master-spider', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as SpiderResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setStepsOpen(true);
      const v = VERDICT_CONFIG[data.verdict];
      toast[data.verdict === 'red' ? 'error' : data.verdict === 'green' ? 'success' : 'info'](
        `${v.label}: ${data.verdictReason.slice(0, 80)}`
      );
    },
    onError: (error: any) => {
      toast.error(`Spider failed: ${error.message}`);
    },
  });

  const handleSpider = () => {
    if (!hasInput) return;
    setResult(null);
    spiderMutation.mutate();
  };

  const truncate = (s: string, len = 16) => s.length > len ? `${s.slice(0, 8)}...${s.slice(-4)}` : s;

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case 'running': return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-400" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSocialIcon = (type: string) => {
    switch (type) {
      case 'x_account': return <Twitter className="h-3.5 w-3.5" />;
      case 'x_community': return <MessageCircle className="h-3.5 w-3.5" />;
      case 'telegram': return <MessageCircle className="h-3.5 w-3.5" />;
      case 'website': return <Globe className="h-3.5 w-3.5" />;
      default: return <Network className="h-3.5 w-3.5" />;
    }
  };

  const v = result ? VERDICT_CONFIG[result.verdict] : null;

  return (
    <div className="space-y-4">
      {/* Input Section */}
      <Card className="border-violet-500/30 bg-gradient-to-br from-violet-950/30 to-indigo-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Bug className="h-5 w-5 text-violet-400" />
            Oracle Master Spider
          </CardTitle>
          <CardDescription>
            Submit a dev wallet, token mint, and/or X handle. At least one field required. Choose AUTO, BAD ACTOR, or GOOD ACTOR.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Three dedicated inputs */}
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Wallet className="h-3 w-3" /> Dev Wallet Address
              </label>
              <Input
                placeholder="Solana wallet address (32-44 chars)..."
                value={devWallet}
                onChange={(e) => setDevWallet(e.target.value)}
                className={`font-mono text-sm ${devWallet.trim() && !isValidSolanaAddress(devWallet) ? 'border-destructive' : ''}`}
                disabled={spiderMutation.isPending}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Coins className="h-3 w-3" /> Minted Token Address
              </label>
              <Input
                placeholder="Token mint address (32-44 chars)..."
                value={tokenMint}
                onChange={(e) => setTokenMint(e.target.value)}
                className={`font-mono text-sm ${tokenMint.trim() && !isValidSolanaAddress(tokenMint) ? 'border-destructive' : ''}`}
                disabled={spiderMutation.isPending}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Twitter className="h-3 w-3" /> X Account
              </label>
              <Input
                placeholder="@handle or https://x.com/handle..."
                value={xAccount}
                onChange={(e) => setXAccount(e.target.value)}
                className="text-sm"
                disabled={spiderMutation.isPending}
              />
            </div>
          </div>

          {/* Actor type selector */}
          <Select value={actorType} onValueChange={(v: 'auto' | 'bad' | 'good') => setActorType(v)}>
            <SelectTrigger className={`w-full font-bold ${
              actorType === 'bad' ? 'border-destructive text-destructive' : 
              actorType === 'good' ? 'border-green-500 text-green-400' : ''
            }`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">🔍 AUTO DETECT</SelectItem>
              <SelectItem value="bad">🔴 BAD ACTOR</SelectItem>
              <SelectItem value="good">🟢 GOOD ACTOR</SelectItem>
            </SelectContent>
          </Select>

          {actorType !== 'auto' && (
            <Textarea
              placeholder={actorType === 'bad' 
                ? "Why is this a bad actor? e.g. Serial rugger, scam token, coordinated pump & dump..." 
                : "Why is this a good actor? e.g. Trusted builder, graduated multiple tokens, KOL verified..."}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`text-sm min-h-[60px] ${
                actorType === 'bad' ? 'border-destructive/50' : 'border-green-500/50'
              }`}
              disabled={spiderMutation.isPending}
            />
          )}
          <Button
            onClick={handleSpider}
            disabled={!hasInput || spiderMutation.isPending || (actorType !== 'auto' && !reason.trim())}
            className={`w-full ${
              actorType === 'bad' ? 'bg-destructive hover:bg-destructive/80' :
              actorType === 'good' ? 'bg-green-600 hover:bg-green-700' :
              'bg-violet-600 hover:bg-violet-700'
            }`}
          >
            {spiderMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Spidering...
              </>
            ) : (
              <>
                {actorType === 'bad' ? <ShieldAlert className="h-4 w-4 mr-2" /> :
                 actorType === 'good' ? <ShieldCheck className="h-4 w-4 mr-2" /> :
                 <Search className="h-4 w-4 mr-2" />}
                {actorType === 'bad' ? '🕷️ SPIDER & BLACKLIST' :
                 actorType === 'good' ? '🕷️ SPIDER & WHITELIST' :
                 '🕷️ SPIDER'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Verdict Card */}
      {result && v && (
        <Card className={`${v.bgClass} border-2`}>
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-5xl font-black tracking-tight">
                  {result.verdict === 'red' ? '🔴' : result.verdict === 'green' ? '🟢' : '🟡'}
                </div>
                <div>
                  <h2 className={`text-2xl font-bold ${v.textClass}`}>{v.label}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{result.verdictReason}</p>
                  {result.resolvedCreator && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      Creator: {result.resolvedCreator} ({result.creatorSource})
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right space-y-1">
                {result.tokenInfo && (
                  <Badge variant="outline" className="text-sm">
                    {result.tokenInfo.symbol || result.tokenInfo.name || 'Token'}
                  </Badge>
                )}
                <div className="flex gap-2 justify-end flex-wrap">
                  {result.existingReputation.trustLevel && (
                    <Badge className={v.badgeClass}>{result.existingReputation.trustLevel}</Badge>
                  )}
                  {result.existingReputation.reputationScore !== null && (
                    <Badge variant="outline">Score: {result.existingReputation.reputationScore}</Badge>
                  )}
                  {result.existingReputation.tokensRugged > 0 && (
                    <Badge className="bg-red-500/20 text-red-400">
                      {result.existingReputation.tokensRugged} rugs
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mesh Updates Summary */}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{result.discoveredTokens.length}</div>
              <div className="text-xs text-muted-foreground">Tokens Found</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{result.discoveredSocials.length}</div>
              <div className="text-xs text-muted-foreground">Social Links</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{result.genealogy.depth}</div>
              <div className="text-xs text-muted-foreground">Genealogy Depth</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{result.meshUpdates.meshLinksAdded}</div>
              <div className="text-xs text-muted-foreground">Mesh Links Added</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Processing Steps */}
      {result && (
        <Collapsible open={stepsOpen} onOpenChange={setStepsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/10 transition-colors pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Processing Steps ({result.steps.length})
                  </CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${stepsOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {result.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm p-2 rounded bg-muted/20">
                      {getStepIcon(step.status)}
                      <span className="font-medium min-w-[140px]">{step.name}</span>
                      <span className="text-muted-foreground flex-1">{step.detail}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Genealogy */}
      {result && result.genealogy.depth > 0 && (
        <Collapsible open={genealogyOpen} onOpenChange={setGenealogyOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/10 transition-colors pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Network className="h-4 w-4 text-purple-400" />
                    Funding Chain ({result.genealogy.parents.length} ancestors)
                  </CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${genealogyOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {result.genealogy.kycRoot && (
                    <div className="flex items-center gap-2 p-2 rounded bg-purple-500/10 border border-purple-500/20">
                      <Badge className="bg-purple-500/20 text-purple-400">KYC Root</Badge>
                      <span className="font-mono text-sm">{result.genealogy.kycRoot}</span>
                    </div>
                  )}
                  {result.genealogy.parents.map((parent, i) => (
                    <div key={parent} className="flex items-center gap-2 p-2 rounded bg-muted/20">
                      <Badge variant="outline" className="text-xs">Depth {i + 1}</Badge>
                      <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-mono text-sm">{parent}</span>
                      <a
                        href={`https://solscan.io/account/${parent}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </a>
                    </div>
                  ))}
                  {result.genealogy.satellites.length > 0 && (
                    <>
                      <div className="text-xs text-muted-foreground font-medium pt-2">Satellite Wallets</div>
                      {result.genealogy.satellites.map((sat) => (
                        <div key={sat} className="flex items-center gap-2 p-2 rounded bg-muted/10">
                          <Badge variant="outline" className="text-xs">Satellite</Badge>
                          <span className="font-mono text-sm">{truncate(sat, 44)}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Discovered Tokens */}
      {result && result.discoveredTokens.length > 0 && (
        <Collapsible open={tokensOpen} onOpenChange={setTokensOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/10 transition-colors pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Coins className="h-4 w-4 text-amber-400" />
                    Discovered Tokens ({result.discoveredTokens.length})
                  </CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${tokensOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {result.discoveredTokens.map((token) => (
                    <div key={token.mint} className="flex items-center gap-3 p-2 rounded bg-muted/20 text-sm">
                      <span className="font-medium min-w-[80px]">
                        {token.symbol || '???'}
                      </span>
                      <span className="text-muted-foreground truncate flex-1">
                        {token.name || token.mint}
                      </span>
                      {token.status && (
                        <Badge variant="outline" className="text-xs">
                          {token.status}
                        </Badge>
                      )}
                      <a
                        href={`https://pump.fun/coin/${token.mint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Discovered Socials */}
      {result && result.discoveredSocials.length > 0 && (
        <Collapsible open={socialsOpen} onOpenChange={setSocialsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/10 transition-colors pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Twitter className="h-4 w-4 text-blue-400" />
                    Social Network ({result.discoveredSocials.length})
                  </CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${socialsOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {result.discoveredSocials.map((social, i) => (
                    <div key={`${social.identifier}-${i}`} className="flex items-center gap-3 p-2 rounded bg-muted/20 text-sm">
                      {getSocialIcon(social.type)}
                      <Badge variant="outline" className="text-xs">{social.type.replace('_', ' ')}</Badge>
                      <span className="font-mono">{social.identifier}</span>
                      <Badge className="bg-muted text-muted-foreground text-xs ml-auto">{social.relationship}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Mesh Update Summary */}
      {result && (result.meshUpdates.blacklistAdded > 0 || result.meshUpdates.whitelistAdded > 0 || result.meshUpdates.meshLinksAdded > 0) && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium">Mesh Updates:</span>
              {result.meshUpdates.blacklistAdded > 0 && (
                <Badge className="bg-red-500/20 text-red-400">
                  +{result.meshUpdates.blacklistAdded} blacklisted
                </Badge>
              )}
              {result.meshUpdates.whitelistAdded > 0 && (
                <Badge className="bg-green-500/20 text-green-400">
                  +{result.meshUpdates.whitelistAdded} whitelisted
                </Badge>
              )}
              {result.meshUpdates.meshLinksAdded > 0 && (
                <Badge className="bg-violet-500/20 text-violet-400">
                  +{result.meshUpdates.meshLinksAdded} mesh links
                </Badge>
              )}
              {result.meshUpdates.reputationUpdated && (
                <Badge className="bg-blue-500/20 text-blue-400">
                  Reputation updated
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OracleMasterSpider;
