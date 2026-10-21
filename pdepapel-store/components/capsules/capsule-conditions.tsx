import Link from "next/link";

import { STOREFRONT_ROUTES } from "@/lib/routes";

export const CAPSULE_VIDEO_POLICY_ANCHOR = "videos-de-capsulas";

/** «Cómo funciona y condiciones» de una edición, en palabras simples. Sin cifras de lo que vale el contenido. */
export function CapsuleConditions({ opensAt }: { opensAt: string }) {
  const link = "font-semibold text-blue-yankees underline underline-offset-4";
  return (
    <section aria-labelledby="como-funciona" className="flex flex-col gap-3 rounded-xl border border-blue-baby bg-white p-4 sm:p-6">
      <h2 id="como-funciona" className="text-2xl font-semibold text-blue-yankees">
        Cómo funciona y condiciones
      </h2>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-base leading-relaxed text-blue-yankees">
        <li>1 cápsula = 1 papel con el nombre de 1 producto de la edición. Los productos te llegan juntos en una caja.</li>
        <li>Se compran desde 5 cápsulas, en los packs de la página. Un pack va solo en su pedido.</li>
        <li>Todas las cápsulas de la edición son equivalentes: los productos se eligen dentro de un mismo rango y no hay cápsulas ni premios especiales.</li>
        <li>«Lo que puede salir» muestra los productos que pueden salir en esta edición.</li>
        <li>Los packs que traen regalo lo dicen en su tarjeta. El regalo es fijo para ese pack: no depende de lo que salga en las cápsulas.</li>
        <li>Abrimos pocos pedidos por día. Cuando se acaban los cupos, la compra vuelve a abrir al día siguiente a las {opensAt}.</li>
        <li>Abrimos tus cápsulas cuando el pago está confirmado (si pagas por transferencia, cuando la verificamos) y te enviamos los productos.</li>
        <li>
          Tienes derecho de retracto: cinco (5) días hábiles desde la entrega (Ley 1480 de 2011, art. 47). Los productos se devuelven sin usar y en su empaque, como dice nuestra{" "}
          <Link href={STOREFRONT_ROUTES.returnsPolicy} className={link}>
            política de cambios y devoluciones
          </Link>{" "}
          y nuestros{" "}
          <Link href={STOREFRONT_ROUTES.termsPolicy} className={link}>
            términos y condiciones
          </Link>
          .
        </li>
        <li>
          Grabamos la apertura de tus cápsulas y te enviamos el video. Solo lo publicamos en nuestras redes si nos das permiso, y entonces decimos solo tu primer nombre. Puedes pedirnos que lo retiremos cuando quieras. Más en la{" "}
          <Link href={`${STOREFRONT_ROUTES.dataPolicy}#${CAPSULE_VIDEO_POLICY_ANCHOR}`} className={link}>
            política de tratamiento de datos
          </Link>
          .
        </li>
      </ul>
    </section>
  );
}
