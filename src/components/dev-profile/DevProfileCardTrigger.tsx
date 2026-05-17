import React from 'react';
import { DevProfileCard } from './DevProfileCard';

interface Props {
  wallet: string;
  children: React.ReactNode;
  className?: string;
}

/** Wrap any element to open the Dev Profile modal on click. */
export function DevProfileCardTrigger({ wallet, children, className }: Props) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`text-left hover:opacity-80 transition-opacity ${className || ''}`}
        title="View Developer Profile"
      >
        {children}
      </button>
      {open && <DevProfileCard wallet={wallet} open={open} onOpenChange={setOpen} />}
    </>
  );
}