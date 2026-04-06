import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const REFERRAL_OPTIONS = [
  { value: 'twitter', label: 'Scrolling X / Twitter' },
  { value: 'friend', label: 'Friend or colleague' },
  { value: 'telegram', label: 'Telegram group or channel' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'threads', label: 'Threads' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'discord', label: 'Discord server' },
  { value: 'dexscreener', label: 'DexScreener / DexTools' },
  { value: 'google', label: 'Google search' },
  { value: 'blog', label: 'Blog or news article' },
  { value: 'podcast', label: 'Podcast' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'other', label: 'Other' },
];

interface ReferralSourceSelectProps {
  value: string;
  otherValue: string;
  onChange: (value: string) => void;
  onOtherChange: (value: string) => void;
  disabled?: boolean;
}

export const ReferralSourceSelect = ({ 
  value, 
  otherValue, 
  onChange, 
  onOtherChange, 
  disabled 
}: ReferralSourceSelectProps) => {
  return (
    <div className="space-y-2">
      <Label className="text-foreground">How did you hear about us?</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select an option..." />
        </SelectTrigger>
        <SelectContent>
          {REFERRAL_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === 'other' && (
        <Input
          placeholder="Please specify..."
          value={otherValue}
          onChange={(e) => onOtherChange(e.target.value)}
          maxLength={100}
          disabled={disabled}
        />
      )}
    </div>
  );
};

export const getReferralSourceValue = (value: string, otherValue: string): string => {
  if (value === 'other') return otherValue.trim() || 'other';
  return value;
};
