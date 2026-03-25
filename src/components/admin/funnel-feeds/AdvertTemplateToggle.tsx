import React, { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TemplateName } from "@/lib/share-template";

interface Props {
  templateName: TemplateName;
}

export function AdvertTemplateToggle({ templateName }: Props) {
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("holders_intel_templates")
        .select("is_active")
        .eq("template_name", templateName)
        .maybeSingle();
      if (data) setIsActive(data.is_active ?? true);
      setLoading(false);
    };
    fetch();
  }, [templateName]);

  const toggle = async (checked: boolean) => {
    const { error } = await supabase
      .from("holders_intel_templates")
      .update({ is_active: checked, updated_at: new Date().toISOString() })
      .eq("template_name", templateName);

    if (error) {
      toast.error("Failed to update");
      return;
    }
    setIsActive(checked);
    const label = templateName.replace(/_/g, " ").toUpperCase();
    toast.success(`${label} ${checked ? "enabled" : "disabled"} in rotation`);
  };

  if (loading) return null;

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
      <Checkbox
        id={`advert-toggle-${templateName}`}
        checked={isActive}
        onCheckedChange={(checked) => toggle(!!checked)}
      />
      <Label htmlFor={`advert-toggle-${templateName}`} className="text-sm cursor-pointer">
        Include in rotation
        <span className="text-xs text-muted-foreground ml-2">
          {isActive ? "✅ Active — will be used" : "⏸ Skipped — excluded from rotation"}
        </span>
      </Label>
    </div>
  );
}
