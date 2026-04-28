import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { Search } from "lucide-react";

/**
 * PhanesDeepLink — opens @Phanes_bot DM in Telegram and copies the
 * appropriate Phanes command to clipboard. The user pastes once and runs.
 *
 * We use clipboard fallback because Phanes does not document a /start
 * payload that auto-runs commands, so direct deep-links would silently
 * land the user in an empty DM.
 */

export type PhanesTarget =
  | { kind: "x"; handle: string }
  | { kind: "wallet"; address: string }
  | { kind: "ca"; mint: string };

function buildCommand(target: PhanesTarget): string {
  switch (target.kind) {
    case "x":
      return `/x @${target.handle.replace(/^@/, "")}`;
    case "wallet":
      return `/w ${target.address}`;
    case "ca":
      return `${target.mint}`; // Phanes auto-detects CAs
  }
}

function buildLabel(target: PhanesTarget): string {
  switch (target.kind) {
    case "x":
      return `Phanes /x @${target.handle.replace(/^@/, "")}`;
    case "wallet":
      return `Phanes /w ${target.address.slice(0, 6)}…`;
    case "ca":
      return `Phanes lookup ${target.mint.slice(0, 6)}…`;
  }
}

interface Props {
  target: PhanesTarget;
  size?: "sm" | "icon" | "default";
  variant?: "ghost" | "outline" | "secondary";
  className?: string;
}

export function PhanesDeepLink({ target, size = "sm", variant = "ghost", className }: Props) {
  const command = buildCommand(target);
  const label = buildLabel(target);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(command);
      toast({
        title: "Phanes command copied",
        description: `Paste in the Phanes DM and send: ${command}`,
      });
    } catch {
      toast({
        title: "Open Phanes manually",
        description: `Send this in the Phanes DM: ${command}`,
      });
    }
    window.open("https://t.me/Phanes_bot", "_blank", "noopener,noreferrer");
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size={size}
          variant={variant}
          onClick={handleClick}
          className={className}
          aria-label={label}
        >
          <Search className="h-3.5 w-3.5" />
          {size !== "icon" && <span className="ml-1 text-xs">Phanes</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{label} — copies command + opens bot DM</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default PhanesDeepLink;