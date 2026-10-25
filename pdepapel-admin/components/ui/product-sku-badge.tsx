"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Copy, ScanBarcode } from "lucide-react";
import { useClipboard } from "@/hooks/use-clipboard";

interface ProductSkuBadgeProps {
  sku: string;
}

export const ProductSkuBadge = ({ sku }: ProductSkuBadgeProps) => {
  const { onCopy: copyText } = useClipboard();

  const onCopy = () => {
    void copyText(sku, "SKU", { success: { description: "SKU copiado al portapapeles" } });
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={onCopy}
            className="cursor-pointer rounded-sm bg-muted p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
          >
            <ScanBarcode className="h-4 w-4" aria-hidden="true" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="flex items-center gap-2">
          <p className="font-mono text-xs">{sku}</p>
          <Copy className="h-3 w-3 opacity-50" aria-hidden="true" />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
