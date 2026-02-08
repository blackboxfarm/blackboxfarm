import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOracleMesh } from "@/hooks/useOracleLookup";
import { RefreshCw, Search, Network, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const OracleMeshViewer = () => {
  const [searchEntity, setSearchEntity] = useState("");
  const { data: meshLinks, isLoading, refetch } = useOracleMesh(
    searchEntity || undefined,
    undefined
  );

  const getRelationshipColor = (relationship: string) => {
    switch (relationship) {
      case 'created': return 'bg-green-500/20 text-green-500';
      case 'modded': 
      case 'admin_of':
      case 'mod_of': return 'bg-blue-500/20 text-blue-500';
      case 'funded': return 'bg-yellow-500/20 text-yellow-500';
      case 'co_mod': return 'bg-purple-500/20 text-purple-500';
      case 'linked': return 'bg-cyan-500/20 text-cyan-500';
      case 'same_team': return 'bg-orange-500/20 text-orange-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'wallet': return '💰';
      case 'token': return '🪙';
      case 'x_account': return '🐦';
      case 'x_community': return '👥';
      default: return '📦';
    }
  };

  const truncateId = (id: string) => {
    if (id.length > 20) {
      return `${id.slice(0, 8)}...${id.slice(-4)}`;
    }
    return id;
  };

  // Group links by source
  const groupedLinks = React.useMemo(() => {
    if (!meshLinks) return {};
    
    return meshLinks.reduce((acc, link) => {
      const key = `${link.source_type}:${link.source_id}`;
      if (!acc[key]) {
        acc[key] = {
          sourceType: link.source_type,
          sourceId: link.source_id,
          links: []
        };
      }
      acc[key].links.push(link);
      return acc;
    }, {} as Record<string, { sourceType: string; sourceId: string; links: typeof meshLinks }>);
  }, [meshLinks]);

  return (
    <div className="space-y-4">
      {/* Search and Controls */}
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
              <div className="text-3xl font-bold">{meshLinks?.length || 0}</div>
              <div className="text-sm text-muted-foreground">Total Links</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">
                {Object.keys(groupedLinks).length}
              </div>
              <div className="text-sm text-muted-foreground">Unique Entities</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">
                {meshLinks?.filter(l => l.relationship === 'created').length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Creator Links</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-500">
                {meshLinks?.filter(l => l.relationship === 'co_mod').length || 0}
              </div>
              <div className="text-sm text-muted-foreground">Co-Mod Links</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mesh Links Display */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading mesh network...</p>
          </CardContent>
        </Card>
      ) : meshLinks && meshLinks.length > 0 ? (
        <div className="space-y-4">
          {Object.values(groupedLinks).slice(0, 20).map((group) => (
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
                    <div 
                      key={link.id}
                      className="flex items-center gap-3 p-2 rounded bg-muted/30"
                    >
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
