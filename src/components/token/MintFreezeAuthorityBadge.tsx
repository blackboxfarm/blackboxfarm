import { ShieldCheck, ShieldAlert, Snowflake, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MintFreezeAuthorityBadgeProps {
  /** Solscan/on-chain mint authority. `null`/empty string => renounced. */
  mintAuthority?: string | null;
  /** Solscan/on-chain freeze authority. `null`/empty string => renounced. */
  freezeAuthority?: string | null;
  className?: string;
}

/**
 * Renders two compact chips showing whether the token's mint and freeze authorities
 * have been renounced. Renounced = green (safe). Active = red (rug-risk surface).
 *
 * Data source: Solscan Pro v2.0 `/token/meta` via the Oracle unified lookup
 * (see `_shared/solscan-intelligence.ts → solscanResolveTokenCreator`).
 */
export const MintFreezeAuthorityBadge = ({
  mintAuthority,
  freezeAuthority,
  className = "",
}: MintFreezeAuthorityBadgeProps) => {
  const mintRenounced = !mintAuthority || mintAuthority.length === 0;
  const freezeRenounced = !freezeAuthority || freezeAuthority.length === 0;

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-1.5 ${className}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={mintRenounced ? "default" : "destructive"}
              className="gap-1 font-mono text-[10px]"
            >
              {mintRenounced ? <ShieldCheck className="h-3 w-3" /> : <Flame className="h-3 w-3" />}
              MINT {mintRenounced ? "RENOUNCED" : "ACTIVE"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {mintRenounced
              ? "Mint authority is renounced — supply cannot be inflated."
              : `Mint authority still held by ${mintAuthority?.slice(0, 8)}… — new tokens can be minted at any time.`}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={freezeRenounced ? "default" : "destructive"}
              className="gap-1 font-mono text-[10px]"
            >
              {freezeRenounced ? <ShieldCheck className="h-3 w-3" /> : <Snowflake className="h-3 w-3" />}
              FREEZE {freezeRenounced ? "RENOUNCED" : "ACTIVE"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {freezeRenounced
              ? "Freeze authority is renounced — holders cannot have balances frozen."
              : `Freeze authority still held by ${freezeAuthority?.slice(0, 8)}… — any holder's balance can be frozen.`}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default MintFreezeAuthorityBadge;
