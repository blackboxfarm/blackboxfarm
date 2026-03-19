import React, { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ticket, Search, RefreshCw, MessageSquare, Clock, CheckCircle2, XCircle, AlertTriangle, Send, Filter, Eye } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

interface SupportTicket {
  id: string;
  ticket_number: number;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

interface TicketReply {
  id: string;
  ticket_id: string;
  reply_by: string | null;
  reply_type: string;
  message: string;
  is_internal_note: boolean;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: "Open", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <Clock className="h-3 w-3" /> },
  in_progress: { label: "In Progress", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: <MessageSquare className="h-3 w-3" /> },
  resolved: { label: "Resolved", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
  closed: { label: "Closed", color: "bg-muted text-muted-foreground border-border", icon: <XCircle className="h-3 w-3" /> },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-muted text-muted-foreground" },
  medium: { label: "Medium", color: "bg-blue-500/20 text-blue-400" },
  high: { label: "High", color: "bg-orange-500/20 text-orange-400" },
  critical: { label: "Critical", color: "bg-red-500/20 text-red-400" },
};

const CATEGORY_PRIORITY: Record<string, string> = {
  "Technical Support": "high",
  "Bug Report": "high",
  "Security Issue": "critical",
  "Feature Request/Feedback": "low",
  "Partnership Inquiries": "medium",
  "General Inquiry": "medium",
  "Billing/Subscription": "high",
};

export default function TicketsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newPriority, setNewPriority] = useState<string>("");

  // Fetch tickets
  const { data: tickets = [], isLoading, refetch } = useQuery({
    queryKey: ["support-tickets", statusFilter, categoryFilter, searchQuery],
    queryFn: async () => {
      let query = (supabase.from("support_tickets" as any).select("*") as any)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }
      if (searchQuery.trim()) {
        query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,subject.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as SupportTicket[];
    },
  });

  // Fetch replies for selected ticket
  const { data: replies = [] } = useQuery({
    queryKey: ["ticket-replies", selectedTicket?.id],
    queryFn: async () => {
      if (!selectedTicket) return [];
      const { data, error } = await (supabase.from("support_ticket_replies" as any).select("*") as any)
        .eq("ticket_id", selectedTicket.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as TicketReply[];
    },
    enabled: !!selectedTicket,
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ["ticket-stats"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("support_tickets" as any).select("status") as any);
      if (error) throw error;
      const all = (data || []) as { status: string }[];
      return {
        total: all.length,
        open: all.filter(t => t.status === "open").length,
        in_progress: all.filter(t => t.status === "in_progress").length,
        resolved: all.filter(t => t.status === "resolved").length,
        closed: all.filter(t => t.status === "closed").length,
      };
    },
  });

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: async ({ ticketId, message, isInternal }: { ticketId: string; message: string; isInternal: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Insert reply
      const { error: replyError } = await (supabase.from("support_ticket_replies" as any).insert({
        ticket_id: ticketId,
        reply_by: user?.id,
        reply_type: "admin",
        message,
        is_internal_note: isInternal,
      }) as any);
      if (replyError) throw replyError;

      // If not internal note, send email reply via edge function
      if (!isInternal && selectedTicket) {
        const { error: emailError } = await supabase.functions.invoke("send-ticket-reply", {
          body: {
            ticket_id: ticketId,
            ticket_number: selectedTicket.ticket_number,
            recipient_email: selectedTicket.email,
            recipient_name: selectedTicket.name,
            subject: selectedTicket.subject,
            reply_message: message,
          },
        });
        if (emailError) console.error("Email send failed:", emailError);
      }

      // Auto-update status to in_progress if still open
      if (selectedTicket?.status === "open" && !isInternal) {
        await (supabase.from("support_tickets" as any).update({ status: "in_progress" }) as any).eq("id", ticketId);
      }
    },
    onSuccess: () => {
      toast.success(isInternalNote ? "Internal note added" : "Reply sent & emailed to user");
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["ticket-replies"] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Update ticket mutation
  const updateMutation = useMutation({
    mutationFn: async ({ ticketId, updates }: { ticketId: string; updates: Record<string, string> }) => {
      const { error } = await (supabase.from("support_tickets" as any).update(updates) as any).eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket updated");
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-stats"] });
      if (selectedTicket) {
        setSelectedTicket(prev => prev ? { ...prev, ...({ status: newStatus || prev.status, priority: newPriority || prev.priority }) } : null);
      }
    },
  });

  const handleReply = () => {
    if (!replyText.trim() || !selectedTicket) return;
    replyMutation.mutate({ ticketId: selectedTicket.id, message: replyText, isInternal: isInternalNote });
  };

  const openTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setNewPriority(ticket.priority);
    setReplyText("");
    setIsInternalNote(false);
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats?.total || 0, color: "text-foreground" },
          { label: "Open", value: stats?.open || 0, color: "text-blue-400" },
          { label: "In Progress", value: stats?.in_progress || 0, color: "text-yellow-400" },
          { label: "Resolved", value: stats?.resolved || 0, color: "text-green-400" },
          { label: "Closed", value: stats?.closed || 0, color: "text-muted-foreground" },
        ].map(s => (
          <Card key={s.label} className="p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Search name, email, subject..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Technical Support">Technical Support</SelectItem>
                <SelectItem value="Bug Report">Bug Report</SelectItem>
                <SelectItem value="Feature Request/Feedback">Feature Request</SelectItem>
                <SelectItem value="Partnership Inquiries">Partnership</SelectItem>
                <SelectItem value="General Inquiry">General</SelectItem>
                <SelectItem value="Billing/Subscription">Billing</SelectItem>
                <SelectItem value="Security Issue">Security</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ticket List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading tickets...</p>
          </CardContent>
        </Card>
      ) : tickets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Ticket className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No tickets found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => {
            const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const priorityCfg = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
            return (
              <Card
                key={ticket.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => openTicket(ticket)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">#{ticket.ticket_number}</span>
                        <Badge variant="outline" className={`text-[10px] ${statusCfg.color} flex items-center gap-1`}>
                          {statusCfg.icon} {statusCfg.label}
                        </Badge>
                        <Badge className={`text-[10px] ${priorityCfg.color}`}>
                          {priorityCfg.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{ticket.category}</Badge>
                      </div>
                      <h4 className="font-medium text-sm truncate">{ticket.subject}</h4>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {ticket.name} ({ticket.email}) — {ticket.message.slice(0, 120)}{ticket.message.length > 120 ? "…" : ""}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                      </p>
                      <Button variant="ghost" size="sm" className="mt-1 h-7" onClick={e => { e.stopPropagation(); openTicket(ticket); }}>
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={open => { if (!open) setSelectedTicket(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          {selectedTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-muted-foreground">#{selectedTicket.ticket_number}</span>
                  {selectedTicket.subject}
                </DialogTitle>
                <DialogDescription>
                  From {selectedTicket.name} ({selectedTicket.email}) — {format(new Date(selectedTicket.created_at), "MMM d, yyyy 'at' h:mm a")}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-4">
                  {/* Status & Priority Controls */}
                  <div className="flex gap-2 flex-wrap">
                    <Select value={newStatus || selectedTicket.status} onValueChange={val => {
                      setNewStatus(val);
                      updateMutation.mutate({ ticketId: selectedTicket.id, updates: { status: val } });
                    }}>
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={newPriority || selectedTicket.priority} onValueChange={val => {
                      setNewPriority(val);
                      updateMutation.mutate({ ticketId: selectedTicket.id, updates: { priority: val } });
                    }}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="outline">{selectedTicket.category}</Badge>
                  </div>

                  {/* Original Message */}
                  <Card className="bg-muted/30">
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Original Message</p>
                      <p className="text-sm whitespace-pre-wrap">{selectedTicket.message}</p>
                    </CardContent>
                  </Card>

                  <Separator />

                  {/* Replies Thread */}
                  {replies.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium">Conversation</h4>
                      {replies.map(reply => (
                        <Card key={reply.id} className={reply.is_internal_note ? "border-yellow-500/30 bg-yellow-500/5" : reply.reply_type === "admin" ? "border-primary/30 bg-primary/5" : "bg-muted/30"}>
                          <CardContent className="pt-2 pb-2 px-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[10px]">
                                {reply.is_internal_note ? "📝 Internal Note" : reply.reply_type === "admin" ? "👤 Admin" : "📨 User"}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{reply.message}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Reply Box */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">Reply</h4>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isInternalNote}
                          onChange={e => setIsInternalNote(e.target.checked)}
                          className="rounded"
                        />
                        Internal note only
                      </label>
                    </div>
                    <Textarea
                      placeholder={isInternalNote ? "Add an internal note (not visible to user)..." : "Type your reply (will be emailed to user)..."}
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={handleReply}
                        disabled={!replyText.trim() || replyMutation.isPending}
                        size="sm"
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        {isInternalNote ? "Add Note" : "Send Reply"}
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
