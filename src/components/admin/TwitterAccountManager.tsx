import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Eye, EyeOff, Pencil, Trash2, Upload, LayoutGrid, Table as TableIcon, Twitter, Copy, CheckCircle, XCircle, AlertCircle } from "lucide-react";

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
  is_verified: boolean;
  follower_count: number;
  following_count: number;
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = ["active", "suspended", "locked", "unverified", "inactive"];

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

const TwitterAccountManager = () => {
  const [accounts, setAccounts] = useState<TwitterAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TwitterAccount | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [groupFilter, setGroupFilter] = useState<string>("all");

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
    is_verified: false,
    follower_count: 0,
    following_count: 0,
  });
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [bannerImage, setBannerImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("twitter_accounts")
        .select("*")
        .order("group_name", { ascending: true })
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
      is_verified: false,
      follower_count: 0,
      following_count: 0,
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
      is_verified: account.is_verified || false,
      follower_count: account.follower_count || 0,
      following_count: account.following_count || 0,
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
        is_verified: formData.is_verified,
        follower_count: formData.follower_count,
        following_count: formData.following_count,
        profile_image_url,
        banner_image_url,
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

        <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-4 pt-6">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.is_verified}
                        onChange={(e) => setFormData({ ...formData, is_verified: e.target.checked })}
                      />
                      Verified
                    </label>
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
                              {account.is_verified && <CheckCircle className="h-4 w-4 text-primary" />}
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
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Email PW</TableHead>
                    <TableHead>TW Password</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Followers</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map(account => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {account.profile_image_url ? (
                            <img src={account.profile_image_url} className="h-8 w-8 rounded-full" />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <Twitter className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <span className="font-medium">@{account.username}</span>
                            {account.is_verified && <CheckCircle className="h-3 w-3 text-primary inline ml-1" />}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.email && (
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-32">{account.email}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(account.email!, "Email")}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.email_password_encrypted && (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm">
                              {showPasswords[`email_${account.id}`] ? account.email_password_encrypted : "••••"}
                            </span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => togglePassword(`email_${account.id}`)}>
                              {showPasswords[`email_${account.id}`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(account.email_password_encrypted!, "Email Password")}>
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
                      <TableCell>{account.group_name}</TableCell>
                      <TableCell>{getStatusBadge(account.account_status)}</TableCell>
                      <TableCell>{account.follower_count?.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
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
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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