"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge, BadgeProps } from "@/components/ui/badge";
import { Copy, Server } from "lucide-react";
import { Button } from "./button";
import { useClipboard } from "@/hooks/use-clipboard";

interface ApiAlertProps {
  title: string;
  description: string;
  variant: "public" | "admin";
}

const textMap: Record<ApiAlertProps["variant"], string> = {
  public: "Public",
  admin: "Admin",
};

const variantMap: Record<ApiAlertProps["variant"], BadgeProps["variant"]> = {
  public: "secondary",
  admin: "destructive",
};

export const ApiAlert: React.FC<ApiAlertProps> = ({
  title,
  description,
  variant = "public",
}) => {
  const { onCopy: copyText } = useClipboard();
  const onCopy = () => {
    void copyText(description, "Ruta del API", { success: { description: "La ruta del API ha sido copiada al portapapeles", variant: "success" } });
  };
  return (
    <Alert>
      <Server className="h-4 w-4" aria-hidden="true" />
      <AlertTitle className="flex items-center gap-x-2">
        {title}
        <Badge variant={variantMap[variant]}>{textMap[variant]}</Badge>
      </AlertTitle>
      <AlertDescription className="mt-4 flex items-center justify-between gap-2">
        <code className="relative min-w-0 break-all rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
          {description}
        </code>
        <Button variant="outline" size="icon" className="shrink-0" onClick={onCopy} aria-label="Copiar ruta">
          <Copy className="h-4 w-4" aria-hidden="true" />
        </Button>
      </AlertDescription>
    </Alert>
  );
};
