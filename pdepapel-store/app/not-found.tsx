import { NotFoundView } from "@/components/not-found-view";
import { StorefrontShell } from "@/components/storefront-shell";

/** Una ruta que no existe: el layout raíz ya no trae cabecera, así que la pone aquí. */
export default function NotFound() {
  return (
    <StorefrontShell clerkVariant="headless">
      <NotFoundView />
    </StorefrontShell>
  );
}
