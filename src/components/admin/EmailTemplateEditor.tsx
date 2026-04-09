import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { FileText, Save, Eye, Loader2 } from 'lucide-react';

interface EmailTemplate {
  id: string;
  template_key: string;
  display_name: string;
  subject: string;
  html_body: string;
  is_active: boolean;
  updated_at: string;
}

export function EmailTemplateEditor() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [editData, setEditData] = useState({ subject: '', html_body: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('email_templates')
      .select('*')
      .order('template_key');
    setTemplates((data as EmailTemplate[]) || []);
    setLoading(false);
  };

  const handleSelect = (key: string) => {
    setSelectedKey(key);
    const tpl = templates.find((t) => t.template_key === key);
    if (tpl) {
      setEditData({ subject: tpl.subject, html_body: tpl.html_body, is_active: tpl.is_active });
    }
  };

  const handleSave = async () => {
    const tpl = templates.find((t) => t.template_key === selectedKey);
    if (!tpl) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject: editData.subject,
          html_body: editData.html_body,
          is_active: editData.is_active,
        })
        .eq('id', tpl.id);
      if (error) throw error;
      toast({ title: 'Template saved' });
      loadTemplates();
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const selected = templates.find((t) => t.template_key === selectedKey);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Email Templates
        </h3>
      </div>

      <p className="text-xs text-muted-foreground">
        Edit outgoing email templates. When active, edge functions use these instead of hardcoded HTML. 
        Use <code className="bg-muted px-1 rounded">{'{{variable}}'}</code> placeholders for dynamic content.
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Select Template</Label>
            <Select value={selectedKey} onValueChange={handleSelect}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.template_key} value={tpl.template_key}>
                    <span className="flex items-center gap-2">
                      {tpl.display_name || tpl.template_key}
                      {!tpl.is_active && (
                        <Badge variant="secondary" className="text-[9px]">Inactive</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {selected.template_key}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px]">Active</Label>
                    <Switch
                      checked={editData.is_active}
                      onCheckedChange={(v) => setEditData({ ...editData, is_active: v })}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Subject Line</Label>
                  <Input
                    value={editData.subject}
                    onChange={(e) => setEditData({ ...editData, subject: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>

                <div>
                  <Label className="text-xs">HTML Body</Label>
                  <Textarea
                    value={editData.html_body}
                    onChange={(e) => setEditData({ ...editData, html_body: e.target.value })}
                    rows={12}
                    className="font-mono text-xs"
                    placeholder="Paste HTML email template here. Leave empty to use the default hardcoded template."
                  />
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                  {editData.html_body && (
                    <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)} className="gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <div
              className="bg-white rounded"
              dangerouslySetInnerHTML={{ __html: editData.html_body }}
            />
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
