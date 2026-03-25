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
  const [shownCount, setShownCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [templateRes, counterRes] = await Promise.all([
        supabase
          .from("holders_intel_templates")
          .select("is_active")
          .eq("template_name", templateName)
          .maybeSingle(),
        supabase
          .from("holders_intel_config" as any)
          .select("value")
          .eq("key", `advert_shown_${templateName}`)
          .maybeSingle(),
      ]);
      if (templateRes.data) setIsActive(templateRes.data.is_active ?? true);
      if ((counterRes.data as any)?.value) setShownCount(parseInt((counterRes.data as any).value, 10));
      setLoading(false);
    };
    fetchData();
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
    <div className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-2">
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
      {shownCount !== null && (
        <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full whitespace-nowrap">
          📢 Shown {shownCount} time{shownCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
