import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOracleMesh } from "@/hooks/useOracleLookup";
import { RefreshCw, Network, ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Copy, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const PAGE_SIZE = 200;

const EntityLink = ({ id, type }: { id: string; type: string }) => {
  const [copied, setCopied] = useState(false);

  const getUrl = () => {
    switch (type) {
      case 'wallet':
        return `https://solscan.io/account/${id}`;
      case 'token':
        if (id.endsWith('pump')) return `https://pump.fun/coin/${id}`;
        return `https://solscan.io/token/${id}`;
      case 'x_account':
      case 'x_user':
        return `https://x.com/${id.replace('@', '')}`;
      case 'website':
        return id.startsWith('http') ? id : `https://${id}`;
      case 'telegram_channel':
        return `https://t.me/${id}`;
      case 'discord':
        return null; // Discord IDs aren't directly linkable
      case 'x_community':
        return `https://x.com/i/communities/${id}`;
      default:
        return null;
    }
  };

  const getDisplayId = () => {
    // Show full ID for short things, smart truncate for long ones
    if (type === 'website') return id;
    if (type === 'x_account' || type === 'x_user') return id.startsWith('@') ? id : `@${id}`;
    if (type === 'telegram_channel' || type === 'discord') return id;
    if (type === 'x_community') return id;
    // Wallets/tokens: show first 6 + last 6
    if (id.length > 16) return `${id.slice(0, 6)}…${id.slice(-6)}`;
    return id;
  };

  const url = getUrl();

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="inline-flex items-center gap-1.5 group">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm text-primary hover:underline inline-flex items-center gap-1"
          title={id}
        >
          {getDisplayId()}
          <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100" />
        </a>
      ) : (
        <span className="font-mono text-sm" title={id}>{getDisplayId()}</span>
      )}
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
        title="Copy full ID"
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
};

const OracleMeshViewer = () => {
  const [searchEntity, setSearchEntity] = useState("");
  const [page, setPage] = useState(0);
  const { data, isLoading, refetch } = useOracleMesh(
    searchEntity || undefined,
    undefined,
    page,
    PAGE_SIZE
  );

  const meshLinks = data?.links || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getRelationshipColor = (relationship: string) => {
    switch (relationship) {
      case 'created': case 'created_token': return 'bg-green-500/20 text-green-500';
      case 'modded': case 'admin_of': case 'mod_of': return 'bg-blue-500/20 text-blue-500';
      case 'funded': case 'funded_by': return 'bg-yellow-500/20 text-yellow-500';
      case 'co_mod': return 'bg-purple-500/20 text-purple-500';
      case 'linked': return 'bg-cyan-500/20 text-cyan-500';
      case 'same_team': case 'same_kyc': return 'bg-orange-500/20 text-orange-500';
      case 'website_of': case 'community_for': return 'bg-pink-500/20 text-pink-500';
      case 'social_account_of': return 'bg-indigo-500/20 text-indigo-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'wallet': return '💰';
      case 'token': return '🪙';
      case 'x_account': case 'x_user': return '🐦';
      case 'x_community': return '👥';
      case 'website': return '🌐';
      case 'telegram_channel': return '📱';
      case 'discord': return '🎮';
      default: return '📦';
    }
  };

  const groupedLinks = React.useMemo(() => {
    return meshLinks.reduce((acc, link) => {
      const key = `${link.source_type}:${link.source_id}`;
      if (!acc[key]) {
        acc[key] = { sourceType: link.source_type, sourceId: link.source_id, links: [] };
      }
      acc[key].links.push(link);
      return acc;
    }, {} as Record<string, { sourceType: string; sourceId: string; links: typeof meshLinks }>);
  }, [meshLinks]);

  React.useEffect(() => { setPage(0); }, [searchEntity]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Reputation Mesh Network
              </CardTitle>
              <CardDescription>
                {totalCount.toLocaleString()} entity relationships discovered by the Oracle
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Filter by entity ID (wallet, @handle, token)..."
              value={searchEntity}
              onChange={(e) => setSearchEntity(e.target.value)}
              className="flex-1"
            />
            <Button variant="outline" onClick={() => setSearchEntity("")}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, totalCount).toLocaleString()} of {totalCount.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <span className="text-sm text-muted-foreground flex items-center px-2">
              Page {page + 1} of {totalPages.toLocaleString()}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Mesh Links Display */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading mesh network...</p>
          </CardContent>
        </Card>
      ) : meshLinks.length > 0 ? (
        <div className="space-y-3">
          {Object.values(groupedLinks).map((group) => (
            <Card key={`${group.sourceType}:${group.sourceId}`}>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg">{getTypeIcon(group.sourceType)}</span>
                  <Badge variant="outline" className="text-xs">{group.sourceType}</Badge>
                  <EntityLink id={group.sourceId} type={group.sourceType} />
                  <Badge variant="secondary" className="text-xs">{group.links.length} links</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {group.links.map((link) => (
                    <div key={link.id} className="flex items-center gap-2 p-2 rounded bg-muted/30 flex-wrap">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <Badge className={`text-xs ${getRelationshipColor(link.relationship)}`}>
                        {link.relationship}
                      </Badge>
                      <span className="text-base">{getTypeIcon(link.linked_type)}</span>
                      <EntityLink id={link.linked_id} type={link.linked_type} />
                      <Badge variant="outline" className="text-xs">
                        {link.confidence}%
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                        {formatDistanceToNow(new Date(link.discovered_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Network className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No mesh links found</h3>
            <p className="text-muted-foreground text-sm">
              {searchEntity 
                ? `No links found for "${searchEntity}"`
                : "The mesh network will grow as you run lookups and scans"
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OracleMeshViewer;
