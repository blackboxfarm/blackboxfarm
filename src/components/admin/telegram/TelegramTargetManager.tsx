import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Plus, 
  Globe, 
  Lock, 
  Loader2, 
  Pencil, 
  Trash2, 
  MessageCircle,
  Users
} from 'lucide-react';

export interface TelegramTarget {
  id: string;
  label: string;
  target_type: 'public' | 'private';
  chat_username: string | null;
  chat_id: string | null;
  resolved_name: string | null;
  last_used_at: string | null;
}

interface TelegramTargetManagerProps {
  targets: TelegramTarget[];
  selectedTargetId: string;
  onSelectTarget: (targetId: string) => void;
  onTargetsChange: () => void;
  disabled?: boolean;
}

export default function TelegramTargetManager({
  targets,
  selectedTargetId,
  onSelectTarget,
  onTargetsChange,
  disabled = false
}: TelegramTargetManagerProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TelegramTarget | null>(null);
  
  // Form state
  const [targetType, setTargetType] = useState<'public' | 'private'>('public');
  const [label, setLabel] = useState('');
  const [chatUsername, setChatUsername] = useState('');
  const [chatId, setChatId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  const resetForm = () => {
    setTargetType('public');
    setLabel('');
    setChatUsername('');
    setChatId('');
    setResolvedName(null);
    setEditingTarget(null);
  };

  const resolveChannelName = async () => {
    if (targetType === 'public' && !chatUsername) {
      toast.error('Enter a username first');
      return;
    }
    if (targetType === 'private' && !chatId) {
      toast.error('Enter a chat ID first');
      return;
    }

    setIsResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-mtproto-auth', {
        body: {
          action: 'resolve_chat',
          chatUsername: targetType === 'public' ? chatUsername.replace('@', '') : undefined,
          chatId: targetType === 'private' ? chatId : undefined
        }
      });

      if (error) throw error;
      if (data?.success && data?.chatInfo) {
        const name = data.chatInfo.title || data.chatInfo.name || data.chatInfo.username;
        setResolvedName(name);
        if (!label && name) {
          setLabel(name);
        }
        toast.success(`Found: ${name}`);
      } else {
        throw new Error(data?.error || 'Could not resolve channel');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to resolve channel');
      setResolvedName(null);
    } finally {
      setIsResolving(false);
    }
  };

  const handleAddTarget = async () => {
    if (!label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (targetType === 'public' && !chatUsername.trim()) {
      toast.error('Username is required for public groups');
      return;
    }
    if (targetType === 'private' && !chatId.trim()) {
      toast.error('Chat ID is required for private groups');
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const cleanUsername = chatUsername?.replace('@', '').replace('https://t.me/', '').replace('t.me/', '');

      const { error } = await supabase.from('telegram_message_targets').insert({
        user_id: user.id,
        label: label.trim(),
        target_type: targetType,
        chat_username: targetType === 'public' ? cleanUsername : null,
        chat_id: targetType === 'private' ? chatId.trim() : null,
        resolved_name: resolvedName
      });

      if (error) throw error;

      toast.success('Target added');
      setShowAddModal(false);
      resetForm();
      onTargetsChange();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add target');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditTarget = async () => {
    if (!editingTarget) return;
    if (!label.trim()) {
      toast.error('Label is required');
      return;
    }

    setIsLoading(true);
    try {
      const cleanUsername = chatUsername?.replace('@', '').replace('https://t.me/', '').replace('t.me/', '');

      const { error } = await supabase
        .from('telegram_message_targets')
        .update({
          label: label.trim(),
          target_type: targetType,
          chat_username: targetType === 'public' ? cleanUsername : null,
          chat_id: targetType === 'private' ? chatId.trim() : null,
          resolved_name: resolvedName
        })
        .eq('id', editingTarget.id);

      if (error) throw error;

      toast.success('Target updated');
      setShowEditModal(false);
      resetForm();
      onTargetsChange();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update target');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTarget = async (target: TelegramTarget) => {
    if (!confirm(`Delete "${target.label}"?`)) return;

    try {
      const { error } = await supabase
        .from('telegram_message_targets')
        .delete()
        .eq('id', target.id);

      if (error) throw error;

      toast.success('Target deleted');
      if (selectedTargetId === target.id) {
        onSelectTarget('');
      }
      onTargetsChange();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete target');
    }
  };

  const openEditModal = (target: TelegramTarget) => {
    setEditingTarget(target);
    setTargetType(target.target_type);
    setLabel(target.label);
    setChatUsername(target.chat_username || '');
    setChatId(target.chat_id || '');
    setResolvedName(target.resolved_name);
    setShowEditModal(true);
  };

  const selectedTarget = targets.find(t => t.id === selectedTargetId);

  return (
    <div className="space-y-2">
      <Label>Target Group/Channel</Label>
      <div className="flex gap-2">
        <Select value={selectedTargetId} onValueChange={onSelectTarget} disabled={disabled}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a target...">
              {selectedTarget && (
                <div className="flex items-center gap-2">
                  {selectedTarget.target_type === 'public' ? (
                    <Globe className="w-4 h-4 text-green-500" />
                  ) : (
                    <Lock className="w-4 h-4 text-yellow-500" />
                  )}
                  <span>{selectedTarget.resolved_name || selectedTarget.label}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {targets.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No targets saved. Add one to get started.
              </div>
            ) : (
              targets.map(target => (
                <SelectItem key={target.id} value={target.id}>
                  <div className="flex items-center gap-2 w-full">
                    {target.target_type === 'public' ? (
                      <Globe className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <Lock className="w-4 h-4 text-yellow-500 shrink-0" />
                    )}
                    <span className="truncate">
                      {target.resolved_name || target.label}
                    </span>
                    {target.resolved_name && target.resolved_name !== target.label && (
                      <span className="text-xs text-muted-foreground">({target.label})</span>
                    )}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {selectedTarget && (
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={() => openEditModal(selectedTarget)}
              disabled={disabled}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleDeleteTarget(selectedTarget)}
              disabled={disabled}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        )}

        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          disabled={disabled}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Add Target Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Add Telegram Target
            </DialogTitle>
            <DialogDescription>
              Add a public or private group/channel to send messages to
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <Label>Group Type</Label>
              <RadioGroup
                value={targetType}
                onValueChange={(v) => {
                  setTargetType(v as 'public' | 'private');
                  setResolvedName(null);
                }}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="public" id="public" />
                  <Label htmlFor="public" className="flex items-center gap-2 cursor-pointer">
                    <Globe className="w-4 h-4 text-green-500" />
                    Public
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="private" id="private" />
                  <Label htmlFor="private" className="flex items-center gap-2 cursor-pointer">
                    <Lock className="w-4 h-4 text-yellow-500" />
                    Private
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {targetType === 'public' ? (
              <div className="space-y-2">
                <Label>Group Username</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="@GroupUsername"
                    value={chatUsername}
                    onChange={(e) => setChatUsername(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={resolveChannelName}
                    disabled={isResolving || !chatUsername}
                  >
                    {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lookup'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Chat ID</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="-1001234567890"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={resolveChannelName}
                    disabled={isResolving || !chatId}
                  >
                    {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lookup'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Add @userinfobot to the group to get the chat ID
                </p>
              </div>
            )}

            {resolvedName && (
              <Badge variant="outline" className="text-green-600">
                <MessageCircle className="w-3 h-3 mr-1" />
                Found: {resolvedName}
              </Badge>
            )}

            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                placeholder="My Group"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used as fallback if real name can't be fetched
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTarget} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Add Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Target Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Edit Telegram Target
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <Label>Group Type</Label>
              <RadioGroup
                value={targetType}
                onValueChange={(v) => {
                  setTargetType(v as 'public' | 'private');
                  setResolvedName(null);
                }}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="public" id="edit-public" />
                  <Label htmlFor="edit-public" className="flex items-center gap-2 cursor-pointer">
                    <Globe className="w-4 h-4 text-green-500" />
                    Public
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="private" id="edit-private" />
                  <Label htmlFor="edit-private" className="flex items-center gap-2 cursor-pointer">
                    <Lock className="w-4 h-4 text-yellow-500" />
                    Private
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {targetType === 'public' ? (
              <div className="space-y-2">
                <Label>Group Username</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="@GroupUsername"
                    value={chatUsername}
                    onChange={(e) => setChatUsername(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={resolveChannelName}
                    disabled={isResolving || !chatUsername}
                  >
                    {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lookup'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Chat ID</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="-1001234567890"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={resolveChannelName}
                    disabled={isResolving || !chatId}
                  >
                    {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lookup'}
                  </Button>
                </div>
              </div>
            )}

            {resolvedName && (
              <Badge variant="outline" className="text-green-600">
                <MessageCircle className="w-3 h-3 mr-1" />
                Found: {resolvedName}
              </Badge>
            )}

            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                placeholder="My Group"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => editingTarget && handleDeleteTarget(editingTarget)}
            >
              Delete
            </Button>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditTarget} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
