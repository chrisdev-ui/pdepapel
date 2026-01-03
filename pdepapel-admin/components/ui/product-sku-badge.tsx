"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Copy, ScanBarcode } from "lucide-react";

interface ProductSkuBadgeProps {
  sku: string;
}

export const ProductSkuBadge = ({ sku }: ProductSkuBadgeProps) => {
  const { toast } = useToast();

  const onCopy = () => {
    navigator.clipboard.writeText(sku);
    toast({
      description: "SKU copiado al portapapeles",
    });
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={onCopy}
            className="cursor-pointer rounded-sm bg-muted p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
          >
            <ScanBarcode className="h-4 w-4" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="flex items-center gap-2">
          <p className="font-mono text-xs">{sku}</p>
          <Copy className="h-3 w-3 opacity-50" />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
