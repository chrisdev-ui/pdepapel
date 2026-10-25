import { useToast, type toast as toastFn } from "@/hooks/use-toast";

type ToastInput = Parameters<typeof toastFn>[0];

/**
 * El único lugar de la tienda que toca `navigator.clipboard`
 * (tests/unit/clipboard-scan.test.ts). Devuelve si de verdad copió: un
 * navegador que niega el permiso hace fallar la escritura y antes la pantalla
 * decía «copiado» igual.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface CopyOptions {
  /** El aviso de la pantalla cuando copió; `false` si la pantalla lo muestra a su manera. */
  success?: ToastInput | false;
  /** El aviso cuando no pudo copiar; `false` si la pantalla lo maneja. */
  failure?: ToastInput | false;
}

export const COPY_FAILED: ToastInput = {
  title: "No se pudo copiar",
  description: "Tu navegador no dejó copiar. Selecciona el texto y cópialo a mano.",
  variant: "warning",
};

export function useClipboard() {
  const { toast } = useToast();
  const onCopy = async (text: string, options: CopyOptions = {}) => {
    if (!(await writeClipboard(text))) {
      if (options.failure !== false) toast(options.failure ?? COPY_FAILED);
      return false;
    }
    if (options.success) toast(options.success);
    return true;
  };
  return { onCopy };
}
