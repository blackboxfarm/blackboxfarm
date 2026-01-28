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
  xs: 'w-5 h-5',      // 20px - tiny inline
  sm: 'w-7 h-7 md:w-9 md:h-9',   // 28-36px - steps wizard
  md: 'w-8 h-8 md:w-10 md:h-10', // 32-40px - section headers
  lg: 'w-10 h-10 md:w-12 md:h-12', // 40-48px - prominent headers
  xl: 'w-16 h-16 md:w-20 md:h-20', // 64-80px - large display
};

export function StepIcon({ step, size = 'md', className = '' }: StepIconProps) {
  const icon = stepIcons[step];
  
  return (
    <div 
      className={`relative rounded-full overflow-hidden flex-shrink-0 bg-background/50 ${sizeClasses[size]} ${className}`}
    >
      {/* Scale and position to center on the cyan circle numeral */}
      <img 
        src={icon} 
        alt={`Step ${step}`} 
        className="absolute w-[200%] h-[200%] object-cover"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-52%, -42%)',
        }}
      />
    </div>
  );
}
