import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CommandCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommandCreated: () => void;
}

export function CommandCreationDialog({ open, onOpenChange, onCommandCreated }: CommandCreationDialogProps) {
  const [commandName, setCommandName] = useState("");
  const [mode, setMode] = useState<"simple" | "complex">("simple");
  const [buyInterval, setBuyInterval] = useState("300");
  const [sellInterval, setSellInterval] = useState("600");
  const [buyIntervalRange, setBuyIntervalRange] = useState({ min: "180", max: "420" });
  const [sellIntervalRange, setSellIntervalRange] = useState({ min: "480", max: "720" });
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setCommandName("");
    setMode("simple");
    setBuyInterval("300");
    setSellInterval("600");
    setBuyIntervalRange({ min: "180", max: "420" });
    setSellIntervalRange({ min: "480", max: "720" });
  };

  const createCommand = async () => {
    if (!commandName.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter a command name",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const config = mode === "simple" ? {
        type: "simple",
        buyInterval: parseInt(buyInterval),
        sellInterval: parseInt(sellInterval)
      } : {
        type: "complex",
        buyInterval: {
          min: parseInt(buyIntervalRange.min),
          max: parseInt(buyIntervalRange.max)
        },
        sellInterval: {
          min: parseInt(sellIntervalRange.min),
          max: parseInt(sellIntervalRange.max)
        }
      };

      const { error } = await supabase
        .from('blackbox_command_codes')
        .insert({
          name: commandName.trim(),
          config,
          is_active: false,
          wallet_id: null // Created as unassigned command
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Command "${commandName}" created successfully`,
      });

      resetForm();
      onCommandCreated();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating command:', error);
      toast({
        title: "Error",
        description: "Failed to create command",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Command</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="commandName">Command Name</Label>
            <Input
              id="commandName"
              value={commandName}
              onChange={(e) => setCommandName(e.target.value)}
              placeholder="e.g., Quick Scalp 5c/10s"
            />
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "simple" | "complex")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="simple">Simple Intervals</TabsTrigger>
              <TabsTrigger value="complex">Randomized Intervals</TabsTrigger>
            </TabsList>

            <TabsContent value="simple" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Buy Interval (seconds)</Label>
                  <Input
                    type="number"
                    value={buyInterval}
                    onChange={(e) => setBuyInterval(e.target.value)}
                    min="1"
                  />
                </div>
                <div>
                  <Label>Sell Interval (seconds)</Label>
                  <Input
                    type="number"
                    value={sellInterval}
                    onChange={(e) => setSellInterval(e.target.value)}
                    min="1"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="complex" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label>Buy Interval Range (seconds)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      value={buyIntervalRange.min}
                      onChange={(e) => setBuyIntervalRange(prev => ({ ...prev, min: e.target.value }))}
                      placeholder="Min"
                      min="1"
                    />
                    <Input
                      type="number"
                      value={buyIntervalRange.max}
                      onChange={(e) => setBuyIntervalRange(prev => ({ ...prev, max: e.target.value }))}
                      placeholder="Max"
                      min="1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Sell Interval Range (seconds)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      value={sellIntervalRange.min}
                      onChange={(e) => setSellIntervalRange(prev => ({ ...prev, min: e.target.value }))}
                      placeholder="Min"
                      min="1"
                    />
                    <Input
                      type="number"
                      value={sellIntervalRange.max}
                      onChange={(e) => setSellIntervalRange(prev => ({ ...prev, max: e.target.value }))}
                      placeholder="Max"
                      min="1"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={createCommand}
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Command"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}