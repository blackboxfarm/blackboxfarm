import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";

interface TokenImageModalProps {
  imageUrl?: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenMint?: string;
  thumbnailClassName?: string;
}

export function TokenImageModal({ 
  imageUrl, 
  tokenSymbol, 
  tokenName,
  tokenMint,
  thumbnailClassName = "w-8 h-8"
}: TokenImageModalProps) {
  const [imageError, setImageError] = useState(false);
  
  if (!imageUrl || imageError) {
    return (
      <div className={`${thumbnailClassName} rounded-full bg-muted flex items-center justify-center`}>
        <span className="text-xs text-muted-foreground">?</span>
      </div>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <img 
          src={imageUrl} 
          alt={tokenSymbol || tokenName || 'Token'} 
          className={`${thumbnailClassName} rounded-full object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity`}
          onError={() => setImageError(true)}
        />
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <div className="flex flex-col items-center gap-4 p-4">
          <img 
            src={imageUrl} 
            alt={tokenSymbol || tokenName || 'Token'} 
            className="max-w-full max-h-[600px] rounded-lg object-contain"
          />
          {(tokenSymbol || tokenName) && (
            <div className="text-center">
              {tokenSymbol && <div className="text-xl font-bold">${tokenSymbol}</div>}
              {tokenName && <div className="text-sm text-muted-foreground">{tokenName}</div>}
              {tokenMint && <div className="text-xs text-muted-foreground font-mono mt-2 break-all">{tokenMint}</div>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
