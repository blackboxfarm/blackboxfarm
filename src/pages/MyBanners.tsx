import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Image,
  ExternalLink,
  MoreVertical,
  Pause,
  Play,
  Clock,
  Edit,
  Trash2,
  Plus,
  RefreshCw,
  Eye,
  Copy,
} from "lucide-react";
import { AuthModal } from "@/components/auth/AuthModal";

interface BannerOrder {
  id: string;
  image_url: string;
  link_url: string;
  title: string;
  duration_hours: number;
  price_usd: number;
  price_sol: number | null;
  start_time: string;
  end_time: string | null;
  payment_status: string;
  is_active: boolean;
  created_at: string;
  activation_key: string | null;
}

type OrderStatus = "pending" | "paid" | "active" | "completed" | "expired" | "refunded" | "paused";

const getOrderStatus = (order: BannerOrder): OrderStatus => {
  if (order.payment_status === "refunded") return "refunded";
  if (order.payment_status === "pending") return "pending";
  
  const now = new Date();
  const startTime = new Date(order.start_time);
  const endTime = order.end_time ? new Date(order.end_time) : null;
  
  if (order.payment_status === "paid") {
    if (now < startTime) return "paid"; // Paid but not started
    if (endTime && now > endTime) return "completed";
    if (order.is_active) return "active";
    // If within time window but not active, it's paused (not expired)
    if (!endTime || now <= endTime) return "paused";
    return "expired";
  }
  
  return "pending";
};

const getStatusBadge = (status: OrderStatus) => {
  const variants: Record<OrderStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    pending: { variant: "outline", label: "Awaiting Payment" },
    paid: { variant: "secondary", label: "Scheduled" },
    active: { variant: "default", label: "Live" },
    paused: { variant: "outline", label: "Paused" },
    completed: { variant: "secondary", label: "Completed" },
    expired: { variant: "destructive", label: "Expired" },
    refunded: { variant: "outline", label: "Refunded" },
  };
  
  const { variant, label } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
};

export default function MyBanners() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [orders, setOrders] = useState<BannerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Edit modal
  const [editingOrder, setEditingOrder] = useState<BannerOrder | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Extend modal
  const [extendingOrder, setExtendingOrder] = useState<BannerOrder | null>(null);
  
  useEffect(() => {
    if (!authLoading && user) {
      fetchOrders();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]);
  
  const fetchOrders = async () => {
    try {
      // First get user's advertiser account
      const { data: account, error: accountError } = await supabase
        .from("advertiser_accounts")
        .select("id")
        .eq("user_id", user?.id)
        .maybeSingle();
      
      if (accountError) throw accountError;
      
      if (!account) {
        setOrders([]);
        setLoading(false);
        return;
      }
      
      // Then fetch all their orders
      const { data: ordersData, error: ordersError } = await supabase
        .from("banner_orders")
        .select("*")
        .eq("advertiser_id", account.id)
        .order("created_at", { ascending: false });
      
      if (ordersError) throw ordersError;
      setOrders(ordersData || []);
    } catch (error: any) {
      console.error("Error fetching orders:", error);
      toast.error("Failed to load your banner orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  const handleRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };
  
  const handlePauseResume = async (order: BannerOrder) => {
    const newStatus = !order.is_active;
    try {
      const { error } = await supabase
        .from("banner_orders")
        .update({ is_active: newStatus })
        .eq("id", order.id);
      
      if (error) throw error;
      
      toast.success(newStatus ? "Banner resumed" : "Banner paused");
      fetchOrders();
    } catch (error: any) {
      console.error("Error updating banner:", error);
      toast.error("Failed to update banner status");
    }
  };
  
  const handleEdit = (order: BannerOrder) => {
    setEditingOrder(order);
    setEditTitle(order.title);
    setEditLinkUrl(order.link_url);
  };
  
  const handleSaveEdit = async () => {
    if (!editingOrder) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from("banner_orders")
        .update({
          title: editTitle.trim(),
          link_url: editLinkUrl.trim(),
        })
        .eq("id", editingOrder.id);
      
      if (error) throw error;
      
      toast.success("Banner updated successfully");
      setEditingOrder(null);
      fetchOrders();
    } catch (error: any) {
      console.error("Error saving banner:", error);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };
  
  const handleExtend = (order: BannerOrder) => {
    // Navigate to buy-banner with prefilled data for extension
    navigate(`/buy-banner?extend=${order.id}`);
  };
  
  const handleBuyAgain = (order: BannerOrder) => {
    // Navigate to buy-banner with prefilled data
    navigate(`/buy-banner?template=${order.id}`);
  };
  
  const copyActivationKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Activation key copied!");
  };
  
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle>Sign In Required</CardTitle>
              <CardDescription>
                Please sign in to view your banner orders
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button onClick={() => setShowAuthModal(true)}>
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Banner Ads</h1>
            <p className="text-muted-foreground mt-1">
              Manage your banner advertising campaigns
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={() => navigate("/buy-banner")}>
              <Plus className="h-4 w-4 mr-2" />
              New Banner
            </Button>
          </div>
        </div>
        
        {/* Orders List */}
        {orders.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Image className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Banner Orders Yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first banner ad to start advertising on BlackBox
              </p>
              <Button onClick={() => navigate("/buy-banner")}>
                <Plus className="h-4 w-4 mr-2" />
                Create Banner Ad
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your Orders ({orders.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Banner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => {
                      const status = getOrderStatus(order);
                      const canEdit = status === "pending" || status === "paid";
                      const canPause = status === "active";
                      const canResume = status === "paused";
                      const canExtend = status === "active" || status === "completed" || status === "paused";
                      
                      return (
                        <TableRow key={order.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-16 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                                <img
                                  src={order.image_url}
                                  alt={order.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate max-w-[150px]">{order.title}</p>
                                <a
                                  href={order.link_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  <span className="truncate max-w-[120px]">{order.link_url}</span>
                                </a>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(status)}</TableCell>
                          <TableCell>{order.duration_hours}h</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p>{format(new Date(order.start_time), "MMM d, h:mm a")}</p>
                              {order.end_time && (
                                <p className="text-muted-foreground text-xs">
                                  → {format(new Date(order.end_time), "MMM d, h:mm a")}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <p>${order.price_usd}</p>
                              {order.price_sol && (
                                <p className="text-muted-foreground text-xs">
                                  {order.price_sol.toFixed(4)} SOL
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover border shadow-lg z-50">
                                <DropdownMenuItem onClick={() => navigate(`/banner-checkout/${order.id}`)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                
                                {order.activation_key && (
                                  <DropdownMenuItem onClick={() => copyActivationKey(order.activation_key!)}>
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy Key
                                  </DropdownMenuItem>
                                )}
                                
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => handleEdit(order)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    Edit Banner
                                  </DropdownMenuItem>
                                )}
                                
                                {canPause && (
                                  <DropdownMenuItem onClick={() => handlePauseResume(order)}>
                                    <Pause className="h-4 w-4 mr-2" />
                                    Pause Banner
                                  </DropdownMenuItem>
                                )}
                                
                                {canResume && (
                                  <DropdownMenuItem onClick={() => handlePauseResume(order)}>
                                    <Play className="h-4 w-4 mr-2" />
                                    Resume Banner
                                  </DropdownMenuItem>
                                )}
                                
                                {canExtend && (
                                  <DropdownMenuItem onClick={() => handleExtend(order)}>
                                    <Clock className="h-4 w-4 mr-2" />
                                    Extend Duration
                                  </DropdownMenuItem>
                                )}
                                
                                <DropdownMenuItem onClick={() => handleBuyAgain(order)}>
                                  <Plus className="h-4 w-4 mr-2" />
                                  Buy Again
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Edit Modal */}
      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Banner</DialogTitle>
            <DialogDescription>
              Update your banner details. Note: Image changes require creating a new order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Banner title"
              />
            </div>
            <div>
              <Label htmlFor="edit-link">Link URL</Label>
              <Input
                id="edit-link"
                value={editLinkUrl}
                onChange={(e) => setEditLinkUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            {editingOrder && (
              <div className="rounded-lg overflow-hidden border">
                <img
                  src={editingOrder.image_url}
                  alt="Banner preview"
                  className="w-full h-32 object-cover"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrder(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}
