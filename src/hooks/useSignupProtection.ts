import { useState, useRef, useCallback } from 'react';

interface SignupProtectionResult {
  honeypotProps: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    name: string;
    tabIndex: number;
    autoComplete: string;
    style: React.CSSProperties;
  };
  isBot: () => boolean;
  isTooFast: () => boolean;
  formRenderedAt: React.MutableRefObject<number>;
  honeypotTriggered: boolean;
}

const MIN_SUBMIT_TIME_MS = 3000; // 3 seconds minimum

export const useSignupProtection = (): SignupProtectionResult => {
  const [honeypotValue, setHoneypotValue] = useState('');
  const [honeypotTriggered, setHoneypotTriggered] = useState(false);
  const formRenderedAt = useRef(Date.now());

  const handleHoneypotChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setHoneypotValue(e.target.value);
    if (e.target.value) {
      setHoneypotTriggered(true);
    }
  }, []);

  const isBot = useCallback(() => {
    return honeypotTriggered || honeypotValue.length > 0;
  }, [honeypotTriggered, honeypotValue]);

  const isTooFast = useCallback(() => {
    const elapsed = Date.now() - formRenderedAt.current;
    return elapsed < MIN_SUBMIT_TIME_MS;
  }, []);

  return {
    honeypotProps: {
      value: honeypotValue,
      onChange: handleHoneypotChange,
      name: 'website_url', // Looks like a real field to bots
      tabIndex: -1,
      autoComplete: 'off',
      style: {
        position: 'absolute' as const,
        left: '-9999px',
        top: '-9999px',
        opacity: 0,
        height: 0,
        width: 0,
        overflow: 'hidden',
        pointerEvents: 'none' as const,
      },
    },
    isBot,
    isTooFast,
    formRenderedAt,
    honeypotTriggered,
  };
};
