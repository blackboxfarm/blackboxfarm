import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOracleMesh } from "@/hooks/useOracleLookup";
import { RefreshCw, Search, Network, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const PAGE_SIZE = 200;

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
      default: return '📦';
    }
  };

  const truncateId = (id: string) => {
    if (id.length > 20) return `${id.slice(0, 8)}...${id.slice(-4)}`;
    return id;
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

  // Reset page when search changes
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
                Explore entity relationships discovered by the Oracle
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

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{totalCount.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Links</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{Object.keys(groupedLinks).length}</div>
              <div className="text-sm text-muted-foreground">Entities (this page)</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">
                {meshLinks.filter(l => l.relationship === 'created' || l.relationship === 'created_token').length}
              </div>
              <div className="text-sm text-muted-foreground">Creator Links</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-500">
                {meshLinks.filter(l => l.relationship === 'co_mod').length}
              </div>
              <div className="text-sm text-muted-foreground">Co-Mod Links</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
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
        <div className="space-y-4">
          {Object.values(groupedLinks).slice(0, 30).map((group) => (
            <Card key={`${group.sourceType}:${group.sourceId}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getTypeIcon(group.sourceType)}</span>
                  <Badge variant="outline">{group.sourceType}</Badge>
                  <span className="font-mono text-sm">{truncateId(group.sourceId)}</span>
                  <Badge variant="secondary">{group.links.length} links</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {group.links.map((link) => (
                    <div key={link.id} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Badge className={getRelationshipColor(link.relationship)}>
                        {link.relationship}
                      </Badge>
                      <span className="text-xl">{getTypeIcon(link.linked_type)}</span>
                      <span className="font-mono text-sm">{truncateId(link.linked_id)}</span>
                      <Badge variant="outline" className="text-xs">
                        {link.confidence}% confidence
                      </Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
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
