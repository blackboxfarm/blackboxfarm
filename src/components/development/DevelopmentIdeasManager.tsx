import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Lightbulb, 
  Plus, 
  Filter, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Zap,
  Search,
  Calendar,
  Tag,
  Edit
} from 'lucide-react';

interface DevelopmentIdea {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  estimated_effort: string;
  tags: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

const priorityColors = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-green-500/10 text-green-500 border-green-500/20'
};

const statusColors = {
  backlog: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  in_progress: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20'
};

const effortIcons = {
  small: '🟢',
  medium: '🟡',
  large: '🟠',
  extra_large: '🔴'
};

export const DevelopmentIdeasManager = () => {
  const [ideas, setIdeas] = useState<DevelopmentIdea[]>([]);
  const [filteredIdeas, setFilteredIdeas] = useState<DevelopmentIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSeeded, setIsSeeded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadIdeas();
  }, []);

  useEffect(() => {
    filterIdeas();
  }, [ideas, filterCategory, filterPriority, filterStatus, searchTerm]);

  const loadIdeas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('development-ideas', {
        body: { action: 'get_ideas' }
      });

      if (error) throw error;

      if (data.success) {
        setIdeas(data.ideas || []);
        setIsSeeded(data.ideas && data.ideas.length > 0);
      }
    } catch (error: any) {
      console.error('Error loading ideas:', error);
      toast({
        title: 'Error',
        description: 'Failed to load development ideas',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const seedIdeas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('development-ideas', {
        body: { action: 'seed_ideas' }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: 'Success!',
          description: data.message
        });
        await loadIdeas();
      }
    } catch (error: any) {
      console.error('Error seeding ideas:', error);
      toast({
        title: 'Error',
        description: 'Failed to save development ideas',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const updateIdeaStatus = async (id: string, status: string) => {
    try {
      const updates: any = { status };
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase.functions.invoke('development-ideas', {
        body: { 
          action: 'update_idea',
          id,
          updates
        }
      });

      if (error) throw error;

      if (data.success) {
        setIdeas(prev => prev.map(idea => 
          idea.id === id ? { ...idea, ...updates } : idea
        ));
        toast({
          title: 'Updated!',
          description: `Idea marked as ${status.replace('_', ' ')}`
        });
      }
    } catch (error: any) {
      console.error('Error updating idea:', error);
      toast({
        title: 'Error',
        description: 'Failed to update idea',
        variant: 'destructive'
      });
    }
  };

  const filterIdeas = () => {
    let filtered = ideas;

    if (filterCategory !== 'all') {
      filtered = filtered.filter(idea => idea.category === filterCategory);
    }

    if (filterPriority !== 'all') {
      filtered = filtered.filter(idea => idea.priority === filterPriority);
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(idea => idea.status === filterStatus);
    }

    if (searchTerm) {
      filtered = filtered.filter(idea => 
        idea.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        idea.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        idea.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    setFilteredIdeas(filtered);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'in_progress': return <Clock className="h-4 w-4" />;
      case 'cancelled': return <AlertTriangle className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const categories = [...new Set(ideas.map(idea => idea.category))];
  const priorities = [...new Set(ideas.map(idea => idea.priority))];
  const statuses = [...new Set(ideas.map(idea => idea.status))];

  const stats = {
    total: ideas.length,
    completed: ideas.filter(i => i.status === 'completed').length,
    in_progress: ideas.filter(i => i.status === 'in_progress').length,
    backlog: ideas.filter(i => i.status === 'backlog').length
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Lightbulb className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Development Ideas & Roadmap</CardTitle>
                <CardDescription>
                  Comprehensive development plan for BlackBox Farm
                </CardDescription>
              </div>
            </div>
            {!isSeeded && (
              <Button onClick={seedIdeas} disabled={loading}>
                <Plus className="h-4 w-4 mr-2" />
                {loading ? 'Saving Ideas...' : 'Save All Ideas to Database'}
              </Button>
            )}
          </div>
        </CardHeader>

        {isSeeded && (
          <CardContent className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-primary">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total Ideas</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-green-500/10">
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-blue-500/10">
                <div className="text-2xl font-bold text-blue-600">{stats.in_progress}</div>
                <div className="text-sm text-muted-foreground">In Progress</div>
              </div>
              <div className="text-center p-4 rounded-lg bg-gray-500/10">
                <div className="text-2xl font-bold text-gray-600">{stats.backlog}</div>
                <div className="text-sm text-muted-foreground">Backlog</div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search ideas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-60"
                />
              </div>
              
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {priorities.map(priority => (
                    <SelectItem key={priority} value={priority}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statuses.map(status => (
                    <SelectItem key={status} value={status}>
                      {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ideas Grid */}
            <div className="grid gap-4">
              {filteredIdeas.map((idea) => (
                <Card key={idea.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between space-x-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(idea.status)}
                          <h3 className="font-semibold">{idea.title}</h3>
                          <span className="text-sm">{effortIcons[idea.estimated_effort as keyof typeof effortIcons]}</span>
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          {idea.description}
                        </p>
                        
                        <div className="flex flex-wrap gap-2">
                          <Badge className={priorityColors[idea.priority as keyof typeof priorityColors]}>
                            {idea.priority}
                          </Badge>
                          <Badge variant="outline">
                            {idea.category.replace('_', ' ')}
                          </Badge>
                          <Badge className={statusColors[idea.status as keyof typeof statusColors]}>
                            {idea.status.replace('_', ' ')}
                          </Badge>
                          {idea.tags?.map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex flex-col space-y-2">
                        <Select
                          value={idea.status}
                          onValueChange={(status) => updateIdeaStatus(idea.id, status)}
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="backlog">Backlog</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <div className="text-xs text-muted-foreground text-right">
                          {new Date(idea.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredIdeas.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No ideas match your current filters.
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};