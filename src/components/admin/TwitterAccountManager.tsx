import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, Eye, EyeOff, Pencil, Trash2, Upload, LayoutGrid, Table as TableIcon, Twitter, Copy, CheckCircle, XCircle, AlertCircle, GripVertical, RefreshCw, Users, MessageSquare, Calendar, Info, Mail, Shield, Briefcase, Globe, Lock, FileText } from "lucide-react";

const API_POLICY_TEXT = `We use X's API to read public posts and account metadata for analytics, monitoring trends, and generating internal insights. Data is used for research, automation, and displaying aggregated information within our own applications. No data is resold, shared with third parties, or used for surveillance.`;

interface TwitterAccount {
  id: string;
  username: string;
  password_encrypted: string | null;
  email: string | null;
  email_password_encrypted: string | null;
  display_name: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  profile_image_url: string | null;
  banner_image_url: string | null;
  group_name: string;
  tags: string[];
  account_status: string;
  notes: string | null;
  verification_type: string;
  follower_count: number;
  following_count: number;
  tweet_count: number;
  likes_count: number;
  listed_count: number;
  media_count: number;
  twitter_id: string | null;
  join_date: string | null;
  is_protected: boolean;
  is_verified: boolean;
  last_enriched_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  // New enrichment fields
  verified_type: string | null;
  can_dm: boolean;
  can_media_tag: boolean;
  fast_followers_count: number;
  has_custom_timelines: boolean;
  is_translator: boolean;
  professional_type: string | null;
  professional_category: string[] | null;
  bio_urls: any | null;
  profile_urls: any | null;
  withheld_countries: string[] | null;
  // Twitter/X API Credentials
  api_key_encrypted: string | null;
  api_secret_encrypted: string | null;
  access_token_encrypted: string | null;
  access_token_secret_encrypted: string | null;
}

const STATUS_OPTIONS = ["active", "suspended", "locked", "unverified", "inactive"];
const VERIFICATION_OPTIONS = [
  { value: "none", label: "None", color: "" },
  { value: "blue", label: "Blue Check", color: "text-sky-500" },
  { value: "gold", label: "Gold/Yellow Check", color: "text-yellow-500" },
  { value: "grey", label: "Grey Check", color: "text-gray-400" },
];

const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    active: { variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
    suspended: { variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
    locked: { variant: "destructive", icon: <AlertCircle className="h-3 w-3" /> },
    unverified: { variant: "secondary", icon: <AlertCircle className="h-3 w-3" /> },
    inactive: { variant: "outline", icon: <XCircle className="h-3 w-3" /> },
  };
  const config = variants[status] || variants.inactive;
  return (
    <Badge variant={config.variant} className="gap-1">
      {config.icon}
      {status}
    </Badge>
  );
};

const getVerificationIcon = (verificationType: string) => {
  const opt = VERIFICATION_OPTIONS.find(o => o.value === verificationType);
  if (!opt || opt.value === "none") return null;
  return <CheckCircle className={`h-4 w-4 ${opt.color}`} />;
};

const TwitterAccountManager = () => {
  const [accounts, setAccounts] = useState<TwitterAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TwitterAccount | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichingAccount, setEnrichingAccount] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    username: "",
    password_encrypted: "",
    email: "",
    email_password_encrypted: "",
    display_name: "",
    bio: "",
    website: "",
    location: "",
    group_name: "Ungrouped",
    tags: "",
    account_status: "active",
    notes: "",
    verification_type: "none",
    follower_count: 0,
    following_count: 0,
    // Twitter/X API Credentials
    api_key_encrypted: "",
    api_secret_encrypted: "",
    access_token_encrypted: "",
    access_token_secret_encrypted: "",
  });
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [bannerImage, setBannerImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("twitter_accounts")
        .select("*")
        .order("position", { ascending: true })
        .order("username", { ascending: true });

      if (error) throw error;
      setAccounts(data || []);
    } catch (err: any) {
      toast.error("Failed to fetch accounts: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const groups = [...new Set(accounts.map(a => a.group_name))].sort();
  const filteredAccounts = groupFilter === "all" 
    ? accounts 
    : accounts.filter(a => a.group_name === groupFilter);

  const groupedAccounts = filteredAccounts.reduce((acc, account) => {
    const group = account.group_name || "Ungrouped";
    if (!acc[group]) acc[group] = [];
    acc[group].push(account);
    return acc;
  }, {} as Record<string, TwitterAccount[]>);

  const resetForm = () => {
    setFormData({
      username: "",
      password_encrypted: "",
      email: "",
      email_password_encrypted: "",
      display_name: "",
      bio: "",
      website: "",
      location: "",
      group_name: "Ungrouped",
      tags: "",
      account_status: "active",
      notes: "",
      verification_type: "none",
      follower_count: 0,
      following_count: 0,
      api_key_encrypted: "",
      api_secret_encrypted: "",
      access_token_encrypted: "",
      access_token_secret_encrypted: "",
    });
    setProfileImage(null);
    setBannerImage(null);
    setEditingAccount(null);
  };

  const openEditDialog = (account: TwitterAccount) => {
    setEditingAccount(account);
    setFormData({
      username: account.username,
      password_encrypted: account.password_encrypted || "",
      email: account.email || "",
      email_password_encrypted: account.email_password_encrypted || "",
      display_name: account.display_name || "",
      bio: account.bio || "",
      website: account.website || "",
      location: account.location || "",
      group_name: account.group_name || "Ungrouped",
      tags: account.tags?.join(", ") || "",
      account_status: account.account_status || "active",
      notes: account.notes || "",
      verification_type: account.verification_type || "none",
      follower_count: account.follower_count || 0,
      following_count: account.following_count || 0,
      api_key_encrypted: account.api_key_encrypted || "",
      api_secret_encrypted: account.api_secret_encrypted || "",
      access_token_encrypted: account.access_token_encrypted || "",
      access_token_secret_encrypted: account.access_token_secret_encrypted || "",
    });
    setDialogOpen(true);
  };

  const uploadImage = async (file: File, type: "profile" | "banner"): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const fileName = `${type}_${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from("twitter-assets")
      .upload(fileName, file, { upsert: true });

    if (error) {
      toast.error(`Failed to upload ${type} image: ${error.message}`);
      return null;
    }

    const { data: urlData } = supabase.storage.from("twitter-assets").getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleSave = async () => {
    if (!formData.username.trim()) {
      toast.error("Username is required");
      return;
    }

    setSaving(true);
    try {
      let profile_image_url = editingAccount?.profile_image_url || null;
      let banner_image_url = editingAccount?.banner_image_url || null;

      if (profileImage) {
        const url = await uploadImage(profileImage, "profile");
        if (url) profile_image_url = url;
      }

      if (bannerImage) {
        const url = await uploadImage(bannerImage, "banner");
        if (url) banner_image_url = url;
      }

      const accountData = {
        username: formData.username.replace("@", ""),
        password_encrypted: formData.password_encrypted || null,
        email: formData.email || null,
        email_password_encrypted: formData.email_password_encrypted || null,
        display_name: formData.display_name || null,
        bio: formData.bio || null,
        website: formData.website || null,
        location: formData.location || null,
        group_name: formData.group_name || "Ungrouped",
        tags: formData.tags ? formData.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        account_status: formData.account_status,
        notes: formData.notes || null,
        verification_type: formData.verification_type,
        follower_count: formData.follower_count,
        following_count: formData.following_count,
        profile_image_url,
        banner_image_url,
        api_key_encrypted: formData.api_key_encrypted || null,
        api_secret_encrypted: formData.api_secret_encrypted || null,
        access_token_encrypted: formData.access_token_encrypted || null,
        access_token_secret_encrypted: formData.access_token_secret_encrypted || null,
      };

      if (editingAccount) {
        const { error } = await supabase
          .from("twitter_accounts")
          .update(accountData)
          .eq("id", editingAccount.id);
        if (error) throw error;
        toast.success("Account updated");
      } else {
        const { error } = await supabase
          .from("twitter_accounts")
          .insert(accountData);
        if (error) throw error;
        toast.success("Account created");
      }

      setDialogOpen(false);
      resetForm();
      fetchAccounts();
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this account?")) return;
    try {
      const { error } = await supabase.from("twitter_accounts").delete().eq("id", id);
      if (error) throw error;
      toast.success("Account deleted");
      fetchAccounts();
    } catch (err: any) {
      toast.error("Failed to delete: " + err.message);
    }
  };

  const togglePassword = (id: string) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    const draggedIndex = filteredAccounts.findIndex(a => a.id === draggedId);
    const targetIndex = filteredAccounts.findIndex(a => a.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedId(null);
      return;
    }

    // Reorder locally first for instant feedback
    const newAccounts = [...filteredAccounts];
    const [draggedItem] = newAccounts.splice(draggedIndex, 1);
    newAccounts.splice(targetIndex, 0, draggedItem);
    
    // Update positions
    const updates = newAccounts.map((account, index) => ({
      id: account.id,
      position: index + 1,
    }));

    // Update local state
    setAccounts(prev => {
      const updated = [...prev];
      updates.forEach(u => {
        const idx = updated.findIndex(a => a.id === u.id);
        if (idx !== -1) updated[idx] = { ...updated[idx], position: u.position };
      });
      return updated.sort((a, b) => a.position - b.position);
    });

    setDraggedId(null);

    // Save to database
    try {
      for (const u of updates) {
        await supabase.from("twitter_accounts").update({ position: u.position }).eq("id", u.id);
      }
    } catch (err: any) {
      toast.error("Failed to save order: " + err.message);
      fetchAccounts(); // Revert on error
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  // Enrich all accounts via Apify
  const enrichAllAccounts = async () => {
    if (accounts.length === 0) {
      toast.error("No accounts to enrich");
      return;
    }

    setEnriching(true);
    try {
      const usernames = accounts.map(a => a.username);
      toast.info(`Enriching ${usernames.length} accounts via Apify...`);

      const { data, error } = await supabase.functions.invoke("twitter-profile-enricher", {
        body: { usernames },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Enriched ${data.enriched}/${data.total} accounts`);
        fetchAccounts();
      } else {
        throw new Error(data.error || "Enrichment failed");
      }
    } catch (err: any) {
      console.error("Enrichment error:", err);
      toast.error("Enrichment failed: " + err.message);
    } finally {
      setEnriching(false);
    }
  };

  // Enrich single account
  const enrichSingleAccount = async (username: string) => {
    setEnrichingAccount(username);
    try {
      const { data, error } = await supabase.functions.invoke("twitter-profile-enricher", {
        body: { usernames: [username] },
      });

      if (error) throw error;

      if (data.success && data.enriched > 0) {
        toast.success(`@${username} enriched`);
        fetchAccounts();
      } else {
        const result = data.results?.find((r: any) => r.username.toLowerCase() === username.toLowerCase());
        throw new Error(result?.error || "Profile not found");
      }
    } catch (err: any) {
      toast.error(`Failed to enrich @${username}: ${err.message}`);
    } finally {
      setEnrichingAccount(null);
    }
  };

  const formatNumber = (num: number | null | undefined): string => {
    if (!num) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading accounts...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Twitter className="h-6 w-6" />
            Twitter/X Account Manager
          </h2>
          <p className="text-muted-foreground">{accounts.length} accounts</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* API Policy Modal */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-2" />
                API Policy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  X/Twitter API Usage Policy
                </DialogTitle>
                <DialogDescription>
                  Copy this text for API compliance documentation
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="p-4 bg-muted rounded-lg text-sm leading-relaxed">
                  {API_POLICY_TEXT}
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => {
                    navigator.clipboard.writeText(API_POLICY_TEXT);
                    toast.success("Policy text copied to clipboard");
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button 
            variant="outline" 
            onClick={enrichAllAccounts} 
            disabled={enriching || accounts.length === 0}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${enriching ? 'animate-spin' : ''}`} />
            {enriching ? "Enriching..." : "Enrich All"}
          </Button>

          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by group" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {groups.map(g => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "cards" | "table")}>
            <TabsList>
              <TabsTrigger value="cards"><LayoutGrid className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="table"><TableIcon className="h-4 w-4" /></TabsTrigger>
            </TabsList>
          </Tabs>

          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Account</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingAccount ? "Edit Account" : "Add New Account"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Credentials Section */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Username *</Label>
                    <Input
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="@username"
                    />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input
                      type="text"
                      value={formData.password_encrypted}
                      onChange={(e) => setFormData({ ...formData, password_encrypted: e.target.value })}
                      placeholder="Account password"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <Label>Email Password</Label>
                    <Input
                      type="text"
                      value={formData.email_password_encrypted}
                      onChange={(e) => setFormData({ ...formData, email_password_encrypted: e.target.value })}
                      placeholder="Email password"
                    />
                  </div>
                </div>

                {/* Profile Section */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Display Name</Label>
                    <Input
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                      placeholder="Display name"
                    />
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="Location"
                    />
                  </div>
                </div>

                <div>
                  <Label>Bio</Label>
                  <Textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Bio"
                    rows={2}
                  />
                </div>

                <div>
                  <Label>Website</Label>
                  <Input
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                {/* Images */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Profile Image</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setProfileImage(e.target.files?.[0] || null)}
                    />
                    {editingAccount?.profile_image_url && (
                      <img src={editingAccount.profile_image_url} className="h-12 w-12 rounded-full mt-2" />
                    )}
                  </div>
                  <div>
                    <Label>Banner Image</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setBannerImage(e.target.files?.[0] || null)}
                    />
                    {editingAccount?.banner_image_url && (
                      <img src={editingAccount.banner_image_url} className="h-12 w-full object-cover rounded mt-2" />
                    )}
                  </div>
                </div>

                {/* Organization */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Group</Label>
                    <Input
                      value={formData.group_name}
                      onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                      placeholder="Group name"
                      list="groups"
                    />
                    <datalist id="groups">
                      {groups.map(g => <option key={g} value={g} />)}
                    </datalist>
                  </div>
                  <div>
                    <Label>Tags (comma-separated)</Label>
                    <Input
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      placeholder="main, bot, backup"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Status</Label>
                    <Select value={formData.account_status} onValueChange={(v) => setFormData({ ...formData, account_status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Verification</Label>
                    <Select value={formData.verification_type} onValueChange={(v) => setFormData({ ...formData, verification_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VERIFICATION_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              {opt.value !== "none" && <CheckCircle className={`h-4 w-4 ${opt.color}`} />}
                              {opt.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Followers</Label>
                    <Input
                      type="number"
                      value={formData.follower_count}
                      onChange={(e) => setFormData({ ...formData, follower_count: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Following</Label>
                    <Input
                      type="number"
                      value={formData.following_count}
                      onChange={(e) => setFormData({ ...formData, following_count: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Internal notes..."
                    rows={2}
                  />
                </div>

                {/* Twitter/X API Credentials Section */}
                <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <span>Twitter/X API Credentials</span>
                    <span className="text-xs text-muted-foreground">(Optional - for automated posting)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">API Key (Consumer Key)</Label>
                      <div className="relative">
                        <Input
                          type={showPasswords["api_key"] ? "text" : "password"}
                          value={formData.api_key_encrypted}
                          onChange={(e) => setFormData({ ...formData, api_key_encrypted: e.target.value })}
                          placeholder="Enter API Key..."
                          className="pr-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full w-8"
                          onClick={() => togglePassword("api_key")}
                        >
                          {showPasswords["api_key"] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">API Secret (Consumer Secret)</Label>
                      <div className="relative">
                        <Input
                          type={showPasswords["api_secret"] ? "text" : "password"}
                          value={formData.api_secret_encrypted}
                          onChange={(e) => setFormData({ ...formData, api_secret_encrypted: e.target.value })}
                          placeholder="Enter API Secret..."
                          className="pr-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full w-8"
                          onClick={() => togglePassword("api_secret")}
                        >
                          {showPasswords["api_secret"] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Access Token</Label>
                      <div className="relative">
                        <Input
                          type={showPasswords["access_token"] ? "text" : "password"}
                          value={formData.access_token_encrypted}
                          onChange={(e) => setFormData({ ...formData, access_token_encrypted: e.target.value })}
                          placeholder="Enter Access Token..."
                          className="pr-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full w-8"
                          onClick={() => togglePassword("access_token")}
                        >
                          {showPasswords["access_token"] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Access Token Secret</Label>
                      <div className="relative">
                        <Input
                          type={showPasswords["access_token_secret"] ? "text" : "password"}
                          value={formData.access_token_secret_encrypted}
                          onChange={(e) => setFormData({ ...formData, access_token_secret_encrypted: e.target.value })}
                          placeholder="Enter Access Token Secret..."
                          className="pr-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full w-8"
                          onClick={() => togglePassword("access_token_secret")}
                        >
                          {showPasswords["access_token_secret"] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? "Saving..." : editingAccount ? "Update Account" : "Create Account"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Card View */}
      {viewMode === "cards" && (
        <div className="space-y-6">
          {Object.entries(groupedAccounts).map(([group, groupAccounts]) => (
            <Card key={group}>
              <CardHeader className="py-3">
                <CardTitle className="text-lg">{group} ({groupAccounts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {groupAccounts.map(account => (
                    <Card key={account.id} className="overflow-hidden">
                      {account.banner_image_url && (
                        <div className="h-16 bg-cover bg-center" style={{ backgroundImage: `url(${account.banner_image_url})` }} />
                      )}
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {account.profile_image_url ? (
                            <img src={account.profile_image_url} className="h-12 w-12 rounded-full" />
                          ) : (
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                              <Twitter className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-semibold truncate">{account.display_name || account.username}</span>
                              {getVerificationIcon(account.verification_type)}
                            </div>
                            <p className="text-sm text-muted-foreground">@{account.username}</p>
                            {getStatusBadge(account.account_status)}
                          </div>
                        </div>

                        <div className="mt-3 space-y-1 text-xs">
                          {account.email && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground truncate">{account.email}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(account.email!, "Email")}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {account.password_encrypted && (
                            <div className="flex items-center justify-between">
                              <span className="font-mono">
                                {showPasswords[account.id] ? account.password_encrypted : "••••••••"}
                              </span>
                              <div className="flex">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => togglePassword(account.id)}>
                                  {showPasswords[account.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(account.password_encrypted!, "Password")}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {account.tags && account.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {account.tags.map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => openEditDialog(account)}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(account.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}

          {Object.keys(groupedAccounts).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No accounts found. Click "Add Account" to create one.
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-center">Followers</TableHead>
                    <TableHead className="text-center">Tweets</TableHead>
                    <TableHead>Info</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>TW Password</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map(account => (
                    <TableRow 
                      key={account.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, account.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, account.id)}
                      onDragEnd={handleDragEnd}
                      className={`cursor-move ${draggedId === account.id ? 'opacity-50 bg-muted' : ''}`}
                    >
                      <TableCell className="w-8">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {account.profile_image_url ? (
                            <img src={account.profile_image_url} className="h-10 w-10 rounded-full object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              <Twitter className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{account.display_name || account.username}</span>
                              {getVerificationIcon(account.verification_type)}
                            </div>
                            <p className="text-sm text-muted-foreground">@{account.username}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{formatNumber(account.follower_count)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <MessageSquare className="h-3 w-3 text-muted-foreground" />
                          <span>{formatNumber(account.tweet_count)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
                              <Info className="h-3 w-3" />
                              <span className="text-xs">Details</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80" align="start">
                            <div className="space-y-3">
                              <h4 className="font-semibold text-sm">Account Details</h4>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Joined:</span>
                                </div>
                                <span>{formatDate(account.join_date)}</span>
                                
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">Following:</span>
                                </div>
                                <span>{formatNumber(account.following_count)}</span>
                                
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Listed:</span>
                                </div>
                                <span>{formatNumber(account.listed_count)}</span>
                                
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Likes:</span>
                                </div>
                                <span>{formatNumber(account.likes_count)}</span>
                                
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Media:</span>
                                </div>
                                <span>{formatNumber(account.media_count)}</span>
                              </div>
                              
                              <div className="border-t pt-2 space-y-2">
                                <h5 className="font-medium text-xs text-muted-foreground">Capabilities</h5>
                                <div className="flex flex-wrap gap-1">
                                  {account.can_dm && (
                                    <Badge variant="secondary" className="text-xs gap-1">
                                      <Mail className="h-3 w-3" />
                                      DMs Open
                                    </Badge>
                                  )}
                                  {account.is_protected && (
                                    <Badge variant="outline" className="text-xs gap-1">
                                      <Lock className="h-3 w-3" />
                                      Protected
                                    </Badge>
                                  )}
                                  {account.is_verified && (
                                    <Badge variant="default" className="text-xs gap-1 bg-sky-500">
                                      <CheckCircle className="h-3 w-3" />
                                      Verified
                                    </Badge>
                                  )}
                                  {account.verified_type && account.verified_type !== "none" && (
                                    <Badge variant="secondary" className="text-xs">
                                      {account.verified_type}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {account.professional_type && (
                                <div className="border-t pt-2 space-y-1">
                                  <h5 className="font-medium text-xs text-muted-foreground flex items-center gap-1">
                                    <Briefcase className="h-3 w-3" />
                                    Professional Account
                                  </h5>
                                  <Badge variant="outline" className="text-xs">
                                    {account.professional_type}
                                  </Badge>
                                  {account.professional_category && account.professional_category.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {account.professional_category.map((cat, i) => (
                                        <Badge key={i} variant="secondary" className="text-xs">{cat}</Badge>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {account.bio && (
                                <div className="border-t pt-2">
                                  <h5 className="font-medium text-xs text-muted-foreground mb-1">Bio</h5>
                                  <p className="text-xs text-muted-foreground line-clamp-3">{account.bio}</p>
                                </div>
                              )}

                              {account.website && (
                                <div className="border-t pt-2 flex items-center gap-1 text-xs">
                                  <Globe className="h-3 w-3 text-muted-foreground" />
                                  <a href={account.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                                    {account.website}
                                  </a>
                                </div>
                              )}

                              {account.twitter_id && (
                                <div className="border-t pt-2 text-xs text-muted-foreground">
                                  Twitter ID: <span className="font-mono">{account.twitter_id}</span>
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        {account.email && (
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-24 text-sm">{account.email}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(account.email!, "Email")}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.password_encrypted && (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm">
                              {showPasswords[account.id] ? account.password_encrypted : "••••"}
                            </span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => togglePassword(account.id)}>
                              {showPasswords[account.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(account.password_encrypted!, "Password")}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{account.group_name}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(account.account_status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8" 
                            onClick={() => enrichSingleAccount(account.username)}
                            disabled={enrichingAccount === account.username}
                            title="Refresh from Twitter"
                          >
                            <RefreshCw className={`h-4 w-4 ${enrichingAccount === account.username ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditDialog(account)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleDelete(account.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No accounts found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TwitterAccountManager;