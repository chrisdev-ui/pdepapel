import { useState } from "react";

import { useToast, type toast as toastFn } from "@/hooks/use-toast";

type ToastInput = Parameters<typeof toastFn>[0];

/**
 * El único lugar del panel que toca `navigator.clipboard`
 * (tests/unit/security/clipboard-scan.test.ts). Devuelve si de verdad copió:
 * un navegador que niega el permiso o una página sin foco hacen fallar la
 * escritura, y antes las pantallas mostraban «copiado» igual.
 *
 * Con `html`, copia HTML y texto plano a la vez (para pegar en la ficha), y si
 * el navegador no permite HTML, solo el texto.
 */
export async function writeClipboard(text: string, html?: string): Promise<boolean> {
  try {
    if (html !== undefined && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
      ]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch {
    return false;
  }
}

export interface CopyOptions {
  /** El aviso de la pantalla cuando copió; `false` si la pantalla lo muestra a su manera. */
  success?: ToastInput | false;
  /** El aviso cuando no pudo copiar; por defecto «No se pudo copiar…». `false` si la pantalla lo maneja. */
  failure?: ToastInput | false;
}

const defaultFailure = (label: string): ToastInput => ({
  title: `No se pudo copiar: ${label.toLowerCase()}`,
  description: "El navegador no dejó usar el portapapeles. Intenta de nuevo.",
  variant: "destructive",
});

/** Copia al portapapeles y avisa; si el navegador lo bloquea, lo dice en vez de fingir que copió. */
export const useClipboard = () => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const onCopy = async (text: string, label: string = "Texto", options: CopyOptions = {}) => {
    if (!(await writeClipboard(text))) {
      if (options.failure !== false) toast(options.failure ?? defaultFailure(label));
      return false;
    }
    setCopied(true);
    if (options.success !== false) toast(options.success ?? { title: `${label} copiado al portapapeles.` });
    setTimeout(() => setCopied(false), 1000);
    return true;
  };

  return { onCopy, copied };
};
