import { useState } from "react";

// Since we are moving away from react-hot-toast, we should use the internal toaster or simple navigator.
// However, the pattern in cell-action.tsx uses onCopy(id, label).
// Let's make this hook consistent with the codebase.
// Wait, if I use internal toaster here, I need to verify if this hook is used elsewhere.
// The user said "Cannot find module '@/hooks/use-clipboard'". It means it doesn't exist.
// I will implement a simple one.

import { useToast } from "@/hooks/use-toast";

export const useClipboard = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const onCopy = (text: string, label: string = "Texto") => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({
      title: `${label} copiado al portapapeles.`,
      variant: "default", // or "success" if defined
    });
    setTimeout(() => {
      setCopied(false);
    }, 1000);
  };

  return { onCopy, copied };
};
