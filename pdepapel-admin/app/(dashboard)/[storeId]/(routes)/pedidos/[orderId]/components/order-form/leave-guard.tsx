"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "./confirm-dialog";

interface LeaveGuardProps {
  /** Hay cambios sin guardar. */
  when: boolean;
  /** Qué cambió, en palabras de Paula: «cliente, envío». */
  changed?: string[];
}

/**
 * Cerrar la pestaña ya avisaba; un clic en «Volver a pedidos» o en el menú
 * lateral se llevaba los cambios sin decir nada. Intercepta cualquier enlace
 * interno mientras el formulario está sucio y pregunta con el mismo diálogo
 * que el resto del pedido.
 */
export function LeaveGuard({ when, changed = [] }: LeaveGuardProps) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!when) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);

  useEffect(() => {
    if (!when) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
        return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(url.pathname + url.search);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [when]);

  const destination = target?.endsWith("/pedidos")
    ? "Lista de pedidos"
    : "Otra página";

  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && setTarget(null)}
      title="Tienes cambios sin guardar"
      from={{ label: "Editando", tone: "sky" }}
      to={{ label: destination, tone: "slate" }}
      consequences={[
        changed.length > 0
          ? `Cambiaste ${changed.join(", ")}. Si sales ahora, se pierde.`
          : "Si sales ahora, los cambios de este pedido se pierden.",
      ]}
      footnote="«Volver» te deja en el pedido para guardar."
      confirmLabel="Salir sin guardar"
      destructive
      onConfirm={() => {
        const href = target;
        setTarget(null);
        if (href) router.push(href);
      }}
    />
  );
}
