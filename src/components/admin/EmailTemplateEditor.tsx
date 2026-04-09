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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { FileText, Save, Eye, Loader2, Send, Code } from 'lucide-react';

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
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
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

  const handleSendTest = async () => {
    if (!testEmail?.trim() || !selectedKey) return;
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-test-email', {
        body: {
          templateKey: selectedKey,
          recipientEmail: testEmail.trim(),
          subject: editData.subject,
          htmlBody: editData.html_body,
        },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Send failed');
      toast({ title: '✅ Test email sent', description: `Sent to ${testEmail}` });
    } catch (err: any) {
      console.error('Send test email error:', err);
      toast({ title: 'Failed to send test', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSendingTest(false);
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

                <Tabs defaultValue="editor" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="editor" className="text-xs gap-1">
                      <Code className="h-3.5 w-3.5" /> Editor
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="text-xs gap-1">
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </TabsTrigger>
                    <TabsTrigger value="test" className="text-xs gap-1">
                      <Send className="h-3.5 w-3.5" /> Send Test
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="editor" className="mt-3">
                    <Textarea
                      value={editData.html_body}
                      onChange={(e) => setEditData({ ...editData, html_body: e.target.value })}
                      rows={14}
                      className="font-mono text-xs"
                      placeholder="Paste HTML email template here. Leave empty to use the default hardcoded template."
                    />
                  </TabsContent>

                  <TabsContent value="preview" className="mt-3">
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-3 py-1.5 border-b flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-medium">Subject:</span>
                        <span className="text-xs">{editData.subject || '(no subject)'}</span>
                      </div>
                      <ScrollArea className="h-[400px]">
                        {editData.html_body ? (
                          <div
                            className="bg-white p-4"
                            dangerouslySetInnerHTML={{ __html: editData.html_body }}
                          />
                        ) : (
                          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
                            No HTML body — using default hardcoded template
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </TabsContent>

                  <TabsContent value="test" className="mt-3">
                    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground">
                        Send a test email using this template to verify it looks correct in your inbox.
                        The email will use the current subject &amp; HTML body (save first if you've made changes).
                      </p>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="your@email.com"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                          className="h-9 text-sm flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={handleSendTest}
                          disabled={sendingTest || !testEmail?.trim()}
                          className="gap-1 h-9"
                        >
                          {sendingTest ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Send Test
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        💡 Placeholder variables like {'{{name}}'} will be sent as-is so you can see them in context.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
