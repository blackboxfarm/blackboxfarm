import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMarketingProfiles } from "./useMarketingProfiles";

interface Props {
  value?: string | null;
  onChange: (slug: string | null) => void;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}

/** Reusable persona dropdown — pulls from marketing_profiles so it's always in sync. */
export function PersonaSelector({ value, onChange, className, placeholder = "Target persona", allowEmpty = true }: Props) {
  const { data, loading } = useMarketingProfiles("persona");

  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
      disabled={loading}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="__none__">— No persona —</SelectItem>}
        {data.map((p) => (
          <SelectItem key={p.slug} value={p.slug}>
            {p.data?.emoji} {p.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}