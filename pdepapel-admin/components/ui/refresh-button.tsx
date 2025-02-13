"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

interface RefreshButtonProps {
  className?: string;
}

export const RefreshButton: React.FC<RefreshButtonProps> = ({ className }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(() => {
    setIsLoading(true);
    router.refresh();

    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  }, [router]);

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleClick}
      className={cn(
        "group relative transition-all duration-300 hover:bg-primary hover:text-primary-foreground",
        className,
      )}
      disabled={isLoading}
    >
      <RefreshCw
        className={cn("h-4 w-4 transition-transform duration-300", {
          "animate-spin": isLoading,
          "group-hover:rotate-180": !isLoading,
        })}
      />
      <span className="sr-only">Actualizar</span>
    </Button>
  );
};
