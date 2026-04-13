import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ListTodo, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface TodoItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  low: 'bg-muted text-muted-foreground border-border',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  todo: <ListTodo className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-yellow-400" />,
  done: <CheckCircle2 className="h-4 w-4 text-green-400" />,
  cancelled: <XCircle className="h-4 w-4 text-red-400" />,
};

export default function TodoListTab() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newCategory, setNewCategory] = useState('general');
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('active');
  const { user } = useAuth();

  const fetchItems = useCallback(async () => {
    const query = supabase
      .from('admin_todo_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter === 'active') {
      query.in('status', ['todo', 'in_progress']);
    } else if (filter === 'done') {
      query.in('status', ['done', 'cancelled']);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching todos:', error);
      return;
    }
    setItems((data as TodoItem[]) || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addItem = async () => {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('admin_todo_items').insert({
      title: newTitle.trim(),
      priority: newPriority,
      category: newCategory,
      created_by: user?.id,
    });
    if (error) {
      toast.error('Failed to add item');
      return;
    }
    setNewTitle('');
    toast.success('Added');
    fetchItems();
  };

  const toggleStatus = async (item: TodoItem) => {
    const newStatus = item.status === 'done' ? 'todo' : 'done';
    const { error } = await supabase
      .from('admin_todo_items')
      .update({
        status: newStatus,
        completed_at: newStatus === 'done' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    if (error) {
      toast.error('Failed to update');
      return;
    }
    fetchItems();
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('admin_todo_items')
      .update({
        status,
        completed_at: status === 'done' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      toast.error('Failed to update');
      return;
    }
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from('admin_todo_items').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete');
      return;
    }
    fetchItems();
  };

  const activeCount = items.filter(i => i.status === 'todo' || i.status === 'in_progress').length;
  const doneCount = items.filter(i => i.status === 'done').length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5" />
              Admin To-Do List
              <Badge variant="outline" className="ml-2">{activeCount} active</Badge>
              <Badge variant="secondary" className="ml-1">{doneCount} done</Badge>
            </CardTitle>
            <div className="flex gap-2">
              {(['all', 'active', 'done'] as const).map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? 'default' : 'outline'}
                  onClick={() => setFilter(f)}
                  className="capitalize text-xs"
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new item */}
          <div className="flex gap-2">
            <Input
              placeholder="Add a new to-do item..."
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              className="flex-1"
            />
            <Select value={newPriority} onValueChange={setNewPriority}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">🔴 Critical</SelectItem>
                <SelectItem value="high">🟠 High</SelectItem>
                <SelectItem value="medium">🔵 Medium</SelectItem>
                <SelectItem value="low">⚪ Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="integration">Integration</SelectItem>
                <SelectItem value="bug">Bug Fix</SelectItem>
                <SelectItem value="research">Research</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addItem} disabled={!newTitle.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {/* Items list */}
          {loading ? (
            <div className="text-sm text-muted-foreground animate-pulse py-8 text-center">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {filter === 'active' ? 'No active items — nice!' : 'No items found.'}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    item.status === 'done' ? 'opacity-60 bg-muted/30' : 'bg-card hover:bg-accent/30'
                  }`}
                >
                  <Checkbox
                    checked={item.status === 'done'}
                    onCheckedChange={() => toggleStatus(item)}
                  />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${item.status === 'done' ? 'line-through' : ''}`}>
                      {item.title}
                    </span>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{item.category}</Badge>
                  <Badge className={`text-[10px] ${PRIORITY_COLORS[item.priority] || ''}`}>
                    {item.priority}
                  </Badge>
                  <Select value={item.status} onValueChange={v => updateStatus(item.id, v)}>
                    <SelectTrigger className="w-[120px] h-7 text-xs">
                      <div className="flex items-center gap-1">
                        {STATUS_ICONS[item.status]}
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => deleteItem(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
