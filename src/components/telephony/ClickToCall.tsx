import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTelephony } from "@/hooks/useTelephony";
import { Phone } from "lucide-react";

interface ClickToCallProps {
  phoneNumber: string;
  contactName?: string;
  dealId?: string;
  size?: "sm" | "icon";
  variant?: "ghost" | "outline" | "default";
}

export const ClickToCall = ({
  phoneNumber,
  contactName,
  dealId,
  size = "icon",
  variant = "ghost",
}: ClickToCallProps) => {
  const { initiateCall, agentState, myCall } = useTelephony();
  const isAvailable = agentState?.telephony_status === "online" && !myCall;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAvailable) return;
    initiateCall.mutate({ number: phoneNumber, contactName, dealId });
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className="h-7 w-7 text-primary"
          disabled={!isAvailable}
          onClick={handleClick}
        >
          <Phone className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {isAvailable ? `Call ${phoneNumber}` : myCall ? "Already on a call" : "Set status to Available first"}
      </TooltipContent>
    </Tooltip>
  );
};
