import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Image, Link, RefreshCw } from "lucide-react";
import { ContentRepurposer } from "@/components/admin/social/ContentRepurposer";
import { SocialConfigPanel } from "@/components/admin/social/SocialConfigPanel";

export default function SocialMediaTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Social Media Manager</h2>
          <p className="text-muted-foreground">Post manually or via repurposer pipeline</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="bg-purple-500/10 text-purple-400">Threads</Badge>
          <Badge variant="outline" className="bg-pink-500/10 text-pink-400">Instagram</Badge>
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400">Facebook</Badge>
          <Badge variant="outline" className="bg-sky-500/10 text-sky-400">X (New TBD)</Badge>
          <Badge variant="outline" className="bg-rose-500/10 text-rose-400">TikTok</Badge>
        </div>
      </div>

      <Tabs defaultValue="repurpose" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="repurpose">🔄 Repurposer</TabsTrigger>
          <TabsTrigger value="threads">🧵 Threads</TabsTrigger>
          <TabsTrigger value="instagram">📸 Instagram</TabsTrigger>
          <TabsTrigger value="facebook">📘 Facebook</TabsTrigger>
          <TabsTrigger value="twitter">🐦 X / Twitter</TabsTrigger>
          <TabsTrigger value="tiktok">🎵 TikTok</TabsTrigger>
          <TabsTrigger value="history">📋 History</TabsTrigger>
          <TabsTrigger value="config">🔧 Config</TabsTrigger>
        </TabsList>

        <TabsContent value="repurpose">
          <ContentRepurposer />
        </TabsContent>
        <TabsContent value="threads">
          <ThreadsPanel />
        </TabsContent>
        <TabsContent value="instagram">
          <InstagramPanel />
        </TabsContent>
        <TabsContent value="facebook">
          <FacebookPanel />
        </TabsContent>
        <TabsContent value="twitter">
          <TwitterPanel />
        </TabsContent>
        <TabsContent value="tiktok">
          <TikTokPanel />
        </TabsContent>
        <TabsContent value="history">
          <PostHistory />
        </TabsContent>
        <TabsContent value="config">
          <SocialConfigPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ThreadsPanel() {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("post-to-threads", {
        body: { action: "get_profile" },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setProfile(data.profile);
      toast.success(`Connected as @${data.profile.username}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to load Threads profile");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePost = async () => {
    if (!text.trim()) { toast.error("Write something first!"); return; }
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke("post-to-threads", {
        body: { text: text.trim(), imageUrl: imageUrl.trim() || undefined, linkUrl: linkUrl.trim() || undefined },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast.success(`Thread posted! ID: ${data.postId}`);
      setText(""); setImageUrl(""); setLinkUrl("");
    } catch (err: any) {
      toast.error(err.message || "Failed to post to Threads");
    } finally { setPosting(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Post to Threads</span>
          <Button size="sm" variant="outline" onClick={loadProfile} disabled={profileLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${profileLoading ? 'animate-spin' : ''}`} />
            {profile ? `@${profile.username}` : 'Check Connection'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Thread Text (max 500 chars)</Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder="Write your thread..." rows={5} className="resize-none" />
          <p className="text-xs text-muted-foreground text-right">{text.length}/500</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Image className="h-3 w-3" /> Image URL (optional)</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Link className="h-3 w-3" /> Link (optional)</Label>
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://holdersintel.com" />
          </div>
        </div>
        <Button onClick={handlePost} disabled={posting || !text.trim()} className="w-full">
          <Send className="h-4 w-4 mr-2" /> {posting ? "Posting..." : "Post to Threads"}
        </Button>
      </CardContent>
    </Card>
  );
}

function InstagramPanel() {
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("post-to-instagram", { body: { action: "get_profile" } });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setProfile(data.profile);
      toast.success(`Connected as @${data.profile.username}`);
    } catch (err: any) { toast.error(err.message || "Failed to load Instagram profile"); }
    finally { setProfileLoading(false); }
  };

  const handlePost = async () => {
    if (!imageUrl.trim()) { toast.error("Instagram requires an image URL!"); return; }
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke("post-to-instagram", {
        body: { caption: caption.trim(), imageUrl: imageUrl.trim() },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast.success(`Instagram post published! ID: ${data.postId}`);
      setCaption(""); setImageUrl("");
    } catch (err: any) { toast.error(err.message || "Failed to post to Instagram"); }
    finally { setPosting(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Post to Instagram</span>
          <Button size="sm" variant="outline" onClick={loadProfile} disabled={profileLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${profileLoading ? 'animate-spin' : ''}`} />
            {profile ? `@${profile.username}` : 'Check Connection'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1"><Image className="h-3 w-3" /> Image URL (required)</Label>
          <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
          <p className="text-xs text-muted-foreground">Must be a publicly accessible JPEG or PNG URL</p>
        </div>
        <div className="space-y-2">
          <Label>Caption (max 2200 chars)</Label>
          <Textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 2200))} placeholder="Write your caption... #hashtags work here" rows={5} className="resize-none" />
          <p className="text-xs text-muted-foreground text-right">{caption.length}/2200</p>
        </div>
        <Button onClick={handlePost} disabled={posting || !imageUrl.trim()} className="w-full">
          <Send className="h-4 w-4 mr-2" /> {posting ? "Posting..." : "Post to Instagram"}
        </Button>
      </CardContent>
    </Card>
  );
}

function FacebookPanel() {
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const loadProfile = async () => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("post-to-facebook", { body: { action: "get_profile" } });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      setProfile(data.profile);
      toast.success(`Connected: ${data.profile.name}`);
    } catch (err: any) { toast.error(err.message || "Failed to load Facebook page"); }
    finally { setProfileLoading(false); }
  };

  const handlePost = async () => {
    if (!message.trim() && !imageUrl.trim()) { toast.error("Write something or add an image!"); return; }
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke("post-to-facebook", {
        body: { message: message.trim(), imageUrl: imageUrl.trim() || undefined, linkUrl: linkUrl.trim() || undefined },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast.success(`Facebook post published! ID: ${data.postId}`);
      setMessage(""); setImageUrl(""); setLinkUrl("");
    } catch (err: any) { toast.error(err.message || "Failed to post to Facebook"); }
    finally { setPosting(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Post to Facebook</span>
          <Button size="sm" variant="outline" onClick={loadProfile} disabled={profileLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${profileLoading ? 'animate-spin' : ''}`} />
            {profile ? profile.name : 'Check Connection'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Post Message</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your Facebook post..." rows={5} className="resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Image className="h-3 w-3" /> Image URL (optional)</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Link className="h-3 w-3" /> Link (optional)</Label>
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://holdersintel.com" />
          </div>
        </div>
        <Button onClick={handlePost} disabled={posting || (!message.trim() && !imageUrl.trim())} className="w-full">
          <Send className="h-4 w-4 mr-2" /> {posting ? "Posting..." : "Post to Facebook"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TwitterPanel() {
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!text.trim()) { toast.error("Write something first!"); return; }
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke("post-share-card-twitter", {
        body: { text: text.trim() },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      toast.success("Posted to X!");
      setText("");
    } catch (err: any) { toast.error(err.message || "Failed to post to X"); }
    finally { setPosting(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Post to X / Twitter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400">⚠️ Needs new account credentials</Badge>
        <div className="space-y-2">
          <Label>Tweet Text (max 280 chars)</Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 280))} placeholder="Write your tweet..." rows={4} className="resize-none" />
          <p className="text-xs text-muted-foreground text-right">{text.length}/280</p>
        </div>
        <Button onClick={handlePost} disabled={posting || !text.trim()} className="w-full">
          <Send className="h-4 w-4 mr-2" /> {posting ? "Posting..." : "Post to X"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TikTokPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Post to TikTok</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400">🚧 Coming Soon</Badge>
        <p className="text-sm text-muted-foreground">
          TikTok Content Posting API requires video upload. Current workflow:
        </p>
        <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
          <li>Download the repurposed image from Drafts</li>
          <li>Use Grok or another tool to create a 6-second animation loop</li>
          <li>Upload the video back here (coming soon)</li>
          <li>Post to TikTok via API</li>
        </ol>
        <p className="text-xs text-muted-foreground mt-2">
          Required secrets: <code className="bg-muted px-1 rounded">TIKTOK_ACCESS_TOKEN</code> and <code className="bg-muted px-1 rounded">TIKTOK_OPEN_ID</code>
        </p>
      </CardContent>
    </Card>
  );
}

function PostHistory() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('social_posts_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setPosts(data || []);
    } catch {
      toast.error("Failed to load history");
    } finally { setLoading(false); }
  };

  React.useEffect(() => { loadHistory(); }, []);

  const platformColors: Record<string, string> = {
    threads: 'bg-purple-500/20 text-purple-300',
    instagram: 'bg-pink-500/20 text-pink-300',
    twitter: 'bg-sky-500/20 text-sky-300',
    facebook: 'bg-blue-500/20 text-blue-300',
    telegram: 'bg-blue-500/20 text-blue-300',
    tiktok: 'bg-rose-500/20 text-rose-300',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Post History</span>
          <Button size="sm" variant="outline" onClick={loadHistory} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No posts yet. Start posting!</p>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {posts.map((post) => (
              <div key={post.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className={platformColors[post.platform] || 'bg-muted'}>{post.platform}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(post.created_at).toLocaleString()}</span>
                </div>
                <p className="text-sm line-clamp-3">{post.content}</p>
                {post.post_id && <p className="text-xs text-muted-foreground">ID: {post.post_id}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
