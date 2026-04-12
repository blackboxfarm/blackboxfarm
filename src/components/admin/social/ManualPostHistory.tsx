import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { PLATFORM_CONFIGS } from "./platformConfigs";
import { format } from "date-fns";

export function ManualPostHistory() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('social_posts_log')
        .select('*')
        .eq('post_type', 'manual')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setPosts(data || []);
    } catch {
      toast.error("Failed to load manual post history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Group by master_template_id
  const grouped = posts.reduce<Record<string, any[]>>((acc, post) => {
    const key = post.master_template_id || post.id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(post);
    return acc;
  }, {});

  const getPlatform = (id: string) => PLATFORM_CONFIGS.find(p => p.id === id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>📋 Manual Post History</span>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {Object.keys(grouped).length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No manual posts yet</p>
        ) : (
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {Object.entries(grouped).map(([templateId, templatePosts]) => {
              const first = templatePosts[0];
              return (
                <div key={templateId} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {first.title || first.content?.slice(0, 60) || 'Untitled post'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {first.created_at && format(new Date(first.created_at), 'MMM d, yyyy HH:mm')}
                    </span>
                  </div>
                  {first.category && (
                    <Badge variant="outline" className="text-xs">{first.category}</Badge>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {templatePosts.map(post => {
                      const plat = getPlatform(post.platform);
                      return (
                        <Badge key={post.id} variant="outline" className={`text-xs ${plat?.colorClass || ''}`}>
                          {plat?.emoji} {plat?.name || post.platform}
                        </Badge>
                      );
                    })}
                  </div>
                  {first.content && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{first.content}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
