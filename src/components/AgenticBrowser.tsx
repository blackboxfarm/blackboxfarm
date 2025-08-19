import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Play, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface BrowserAction {
  id: string;
  type: 'click' | 'input' | 'wait' | 'screenshot';
  selector?: string;
  value?: string;
  delay?: number;
}

interface BrowseResult {
  success: boolean;
  finalUrl?: string;
  finalTitle?: string;
  results?: Array<{
    action: string;
    success: boolean;
    error?: string;
    screenshot?: string;
  }>;
  error?: string;
}

export const AgenticBrowser = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [actions, setActions] = useState<BrowserAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<BrowseResult | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

  const addAction = () => {
    const newAction: BrowserAction = {
      id: Date.now().toString(),
      type: 'click',
      selector: '',
      value: '',
      delay: 1000
    };
    setActions([...actions, newAction]);
  };

  const updateAction = (id: string, field: keyof BrowserAction, value: string | number) => {
    setActions(actions.map(action => 
      action.id === id ? { ...action, [field]: value } : action
    ));
  };

  const removeAction = (id: string) => {
    setActions(actions.filter(action => action.id !== id));
  };

  const executeBrowsing = async () => {
    if (!url.trim()) {
      toast({
        title: "Error",
        description: "Please enter a URL",
        variant: "destructive"
      });
      return;
    }

    if (actions.length === 0) {
      toast({
        title: "Error", 
        description: "Please add at least one action",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('agentic-browser', {
        body: {
          url,
          actions: actions.map(({ id, ...action }) => action),
          headless: true,
          timeout: 60000
        }
      });

      if (error) throw error;

      setResults(data);
      
      if (data.success) {
        toast({
          title: "Success",
          description: `Completed ${data.results?.length || 0} actions successfully`,
        });
      } else {
        toast({
          title: "Browsing Failed",
          description: data.error || "Unknown error occurred",
          variant: "destructive"
        });
      }

    } catch (error) {
      console.error('Error executing agentic browsing:', error);
      toast({
        title: "Error",
        description: "Failed to execute browsing session",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getActionBadgeColor = (success: boolean, actionType: string) => {
    if (actionType === 'navigate') return 'bg-blue-500';
    return success ? 'bg-green-500' : 'bg-red-500';
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Agentic Browser</h2>
        <p className="text-muted-foreground">
          Automate web interactions by defining a sequence of actions to perform on any website.
        </p>

        {/* URL Input */}
        <div className="space-y-2">
          <Label htmlFor="url">Target URL</Label>
          <Input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full"
          />
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Actions Sequence</Label>
            <Button onClick={addAction} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Action
            </Button>
          </div>

          {actions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No actions defined. Click "Add Action" to start building your automation sequence.
            </div>
          )}

          {actions.map((action, index) => (
            <Card key={action.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline">Step {index + 1}</Badge>
                <Button
                  onClick={() => removeAction(action.id)}
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Action Type */}
                <div className="space-y-1">
                  <Label className="text-xs">Action Type</Label>
                  <Select 
                    value={action.type} 
                    onValueChange={(value) => updateAction(action.id, 'type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="click">Click Element</SelectItem>
                      <SelectItem value="input">Type Text</SelectItem>
                      <SelectItem value="wait">Wait/Delay</SelectItem>
                      <SelectItem value="screenshot">Take Screenshot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Selector (for click and input) */}
                {(action.type === 'click' || action.type === 'input') && (
                  <div className="space-y-1">
                    <Label className="text-xs">CSS Selector</Label>
                    <Input
                      value={action.selector || ''}
                      onChange={(e) => updateAction(action.id, 'selector', e.target.value)}
                      placeholder="button, #id, .class, etc."
                    />
                  </div>
                )}

                {/* Input Value (for input type) */}
                {action.type === 'input' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Text to Type</Label>
                    <Input
                      value={action.value || ''}
                      onChange={(e) => updateAction(action.id, 'value', e.target.value)}
                      placeholder="Text to input"
                    />
                  </div>
                )}

                {/* Delay (for wait type) */}
                {action.type === 'wait' && (
                  <div className="space-y-1">
                    <Label className="text-xs">Delay (ms)</Label>
                    <Input
                      type="number"
                      value={action.delay || 1000}
                      onChange={(e) => updateAction(action.id, 'delay', parseInt(e.target.value))}
                      placeholder="1000"
                    />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Execute Button */}
        <Button 
          onClick={executeBrowsing} 
          disabled={isLoading || !url.trim() || actions.length === 0}
          className="w-full"
          size="lg"
        >
          <Play className="h-4 w-4 mr-2" />
          {isLoading ? 'Executing...' : 'Execute Browsing Session'}
        </Button>
      </div>

      {/* Results */}
      {results && (
        <Card className="p-4 space-y-4">
          <h3 className="text-lg font-semibold">Execution Results</h3>
          
          {results.success ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Final URL</Label>
                  <p className="font-mono truncate">{results.finalUrl}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Final Page Title</Label>
                  <p className="truncate">{results.finalTitle}</p>
                </div>
              </div>

              {results.results && (
                <div className="space-y-2">
                  <Label>Action Results</Label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {results.results.map((result, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div className="flex items-center gap-2">
                          <Badge 
                            className={`${getActionBadgeColor(result.success, result.action)} text-white`}
                          >
                            {result.action}
                          </Badge>
                          <span className="text-sm">
                            {result.success ? 'Success' : `Failed: ${result.error}`}
                          </span>
                        </div>
                        {result.screenshot && (
                          <Button
                            onClick={() => setSelectedScreenshot(result.screenshot!)}
                            variant="ghost"
                            size="sm"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-red-600">
              <strong>Execution Failed:</strong> {results.error}
            </div>
          )}
        </Card>
      )}

      {/* Screenshot Modal */}
      {selectedScreenshot && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Screenshot</h3>
              <Button 
                onClick={() => setSelectedScreenshot(null)}
                variant="ghost"
                size="sm"
              >
                ✕
              </Button>
            </div>
            <div className="p-4">
              <img 
                src={selectedScreenshot} 
                alt="Screenshot" 
                className="max-w-full h-auto"
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};