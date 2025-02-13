import { Progress } from "@/components/ui/progess";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";
import { Users } from "lucide-react";
import { useMemo } from "react";

interface UsageCountProps {
  used: number;
  limit: number;
  className?: string;
}

export const UsageCount: React.FC<UsageCountProps> = ({
  used,
  limit,
  className,
}) => {
  const percentage = useMemo(
    () => Math.min((used / limit) * 100, 100),
    [limit, used],
  );
  const remaining = useMemo(() => Math.max(limit - used, 0), [limit, used]);
  const isLimited = useMemo(() => limit > 0, [limit]);
  const isExhausted = useMemo(() => used >= limit, [limit, used]);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-1.5">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {used}
          {isLimited && <span className="text-muted-foreground">/{limit}</span>}
        </span>
      </div>

      {isLimited && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="min-w-[100px] flex-1">
                <Progress
                  value={percentage}
                  className={cn(
                    "h-2",
                    isExhausted && "bg-destructive/20",
                    "transition-all duration-300",
                  )}
                  indicatorClassName={cn(
                    isExhausted ? "bg-destructive" : "bg-primary",
                    "transition-all duration-300",
                  )}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {remaining === 0
                  ? "No uses remaining"
                  : `${remaining} ${
                      remaining === 1 ? "use" : "uses"
                    } remaining`}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};
