import { useState } from "react";

import { useToast } from "@/hooks/use-toast";

/** Copia al portapapeles y avisa; si el navegador lo bloquea, lo dice en vez de fingir que copió. */
export const useClipboard = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const onCopy = async (text: string, label: string = "Texto") => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast({
        title: `No se pudo copiar: ${label.toLowerCase()}`,
        description: "El navegador no dejó usar el portapapeles. Intenta de nuevo.",
        variant: "destructive",
      });
      return false;
    }
    setCopied(true);
    toast({ title: `${label} copiado al portapapeles.` });
    setTimeout(() => setCopied(false), 1000);
    return true;
  };

  return { onCopy, copied };
};
