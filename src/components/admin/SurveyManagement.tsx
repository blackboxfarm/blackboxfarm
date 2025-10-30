import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Survey {
  id: string;
  title: string;
  description: string | null;
  questions: any;
  is_active: boolean;
  prize_description: string | null;
  prize_value: number | null;
  start_date: string | null;
  end_date: string | null;
}

export function SurveyManagement() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSurvey, setEditSurvey] = useState<Survey | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    question: '',
    options: ['', '', '', ''],
    is_active: true,
    has_prize: false,
    prize_description: '',
    prize_value_usd: 0,
    start_date: '',
    end_date: '',
    target_responses: 100,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSurveys();
  }, []);

  const fetchSurveys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('surveys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setSurveys(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const filteredOptions = formData.options.filter(o => o.trim() !== '');
    if (filteredOptions.length < 2) {
      toast({ title: 'Error', description: 'At least 2 options required', variant: 'destructive' });
      return;
    }

    const payload = {
      title: formData.title,
      description: formData.description || null,
      questions: {
        question: formData.question,
        options: filteredOptions,
        has_prize: formData.has_prize,
        target_responses: formData.target_responses,
      },
      is_active: formData.is_active,
      prize_description: formData.has_prize ? formData.prize_description : null,
      prize_value: formData.has_prize ? formData.prize_value_usd : null,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
    };

    if (editSurvey) {
      const { error } = await supabase
        .from('surveys')
        .update(payload)
        .eq('id', editSurvey.id);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Survey updated successfully' });
        setEditSurvey(null);
        resetForm();
        fetchSurveys();
      }
    } else {
      const { error } = await supabase
        .from('surveys')
        .insert([payload]);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: 'Survey created successfully' });
        resetForm();
        fetchSurveys();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure? This will also delete all responses.')) return;

    const { error } = await supabase
      .from('surveys')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Survey deleted' });
      fetchSurveys();
    }
  };

  const handleEdit = (survey: Survey) => {
    setEditSurvey(survey);
    const q = survey.questions || {};
    setFormData({
      title: survey.title,
      description: survey.description || '',
      question: q.question || '',
      options: [...(q.options || []), '', '', '', ''].slice(0, 4),
      is_active: survey.is_active,
      has_prize: q.has_prize || false,
      prize_description: survey.prize_description || '',
      prize_value_usd: survey.prize_value || 0,
      start_date: survey.start_date || '',
      end_date: survey.end_date || '',
      target_responses: q.target_responses || 100,
    });
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      question: '',
      options: ['', '', '', ''],
      is_active: true,
      has_prize: false,
      prize_description: '',
      prize_value_usd: 0,
      start_date: '',
      end_date: '',
      target_responses: 100,
    });
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Survey Management</CardTitle>
          <CardDescription>Create and manage user surveys with optional prize draws</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Create Survey
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editSurvey ? 'Edit Survey' : 'Create Survey'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Title</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Description (Optional)</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Additional context for the survey..."
                  />
                </div>
                <div>
                  <Label>Question</Label>
                  <Input
                    value={formData.question}
                    onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Options (2-4 required)</Label>
                  {formData.options.map((opt, i) => (
                    <Input
                      key={i}
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}${i < 2 ? ' (required)' : ' (optional)'}`}
                      className="mt-2"
                    />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date (Optional)</Label>
                    <Input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>End Date (Optional)</Label>
                    <Input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Target Responses</Label>
                  <Input
                    type="number"
                    value={formData.target_responses}
                    onChange={(e) => setFormData({ ...formData, target_responses: parseInt(e.target.value) })}
                  />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <Switch
                    checked={formData.has_prize}
                    onCheckedChange={(checked) => setFormData({ ...formData, has_prize: checked })}
                  />
                  <Label>Has Prize</Label>
                </div>
                {formData.has_prize && (
                  <>
                    <div>
                      <Label>Prize Description</Label>
                      <Input
                        value={formData.prize_description}
                        onChange={(e) => setFormData({ ...formData, prize_description: e.target.value })}
                        placeholder="e.g., $100 USDC"
                      />
                    </div>
                    <div>
                      <Label>Prize Value (USD)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.prize_value_usd}
                        onChange={(e) => setFormData({ ...formData, prize_value_usd: parseFloat(e.target.value) })}
                      />
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label>Active</Label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">{editSurvey ? 'Update' : 'Create'} Survey</Button>
                  {editSurvey && (
                    <Button type="button" variant="outline" onClick={() => { setEditSurvey(null); resetForm(); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <div className="mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Prize</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {surveys.map((survey) => {
                  const q = survey.questions || {};
                  return (
                    <TableRow key={survey.id}>
                      <TableCell className="font-medium">{survey.title}</TableCell>
                      <TableCell className="max-w-xs truncate">{q.question || 'No question'}</TableCell>
                      <TableCell>
                        {survey.prize_description ? (
                          <Badge variant="default">{survey.prize_description}</Badge>
                        ) : (
                          <span className="text-muted-foreground">No prize</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={survey.is_active ? 'default' : 'secondary'}>
                          {survey.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(survey)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(survey.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
