import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export const InfoCountryTooltip: React.FC<{}> = () => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-gray-400" />
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="text-xs">
            Por el momento sólo tenemos envíos a todo Colombia.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
