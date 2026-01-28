import React from 'react';
import step1Icon from '@/assets/step-1.png';
import step2Icon from '@/assets/step-2.png';
import step3Icon from '@/assets/step-3.png';
import step4Icon from '@/assets/step-4.png';

const stepIcons = {
  1: step1Icon,
  2: step2Icon,
  3: step3Icon,
  4: step4Icon,
};

interface StepIconProps {
  step: 1 | 2 | 3 | 4;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'w-4 h-4',      // 16px - tiny inline
  sm: 'w-5 h-5 md:w-6 md:h-6',   // 20-24px - steps wizard (reduced)
  md: 'w-6 h-6 md:w-7 md:h-7', // 24-28px - section headers
  lg: 'w-8 h-8 md:w-10 md:h-10', // 32-40px - prominent headers
  xl: 'w-12 h-12 md:w-16 md:h-16', // 48-64px - large display
};

export function StepIcon({ step, size = 'md', className = '' }: StepIconProps) {
  const icon = stepIcons[step];
  
  return (
    <img 
      src={icon} 
      alt={`Step ${step}`} 
      className={`flex-shrink-0 rounded-md object-contain ${sizeClasses[size]} ${className}`}
    />
  );
}
