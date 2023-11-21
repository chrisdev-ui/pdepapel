import { Mail, Phone, ScrollText } from "lucide-react";
import Image from "next/image";

import { Icons } from "@/components/icons";
import { Container } from "@/components/ui/container";
import { Separator } from "@/components/ui/separator";
import { KAWAII_FACE_HAPPY } from "@/constants";

export default function ReturnsPolicyPage() {
  return (
    <>
      <Container>
        <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
          Políticas de devolución o cambio
          <ScrollText className="ml-2 h-8 w-8" />
        </h1>
        <Separator className="my-10" />
        <div className="flex w-full flex-col space-y-5">
          <p>
            En{" "}
            <Image
              src="/images/text-beside-transparent-bg.webp"
              alt="logo"
              width={80}
              height={20}
              quality={100}
              title="P de Papel"
              className="inline-flex object-contain"
            />
            , queremos que estés completamente satisfecho con cada compra.
            Entendemos que a veces puede ser necesario devolver o cambiar un
            producto, por lo que ofrecemos las siguientes políticas para
            asegurarnos de que tu experiencia sea lo más agradable posible.
          </p>
          <h3 className="font-serif text-lg font-semibold">
            Notificación de devolución o cambio:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Tienes cinco (5) días calendario a partir de la fecha de compra
              para notificarnos sobre cualquier devolución o cambio.
            </li>
            <li>
              Para iniciar el proceso, contáctanos al teléfono{" "}
              <Phone className="inline-flex h-4 w-4" />
              (+57) 321 629 9845 o envía un correo electrónico a{" "}
              <Mail className="inline-flex h-4 w-4" />{" "}
              papeleria.pdepapel@gmail.com.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Condiciones para devoluciones:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              No aceptamos devoluciones de productos que hayan sido abiertos,
              probados, usados, o cuyos empaques estén dañados o evidencien mal
              uso.
            </li>
            <li>
              Los productos deben estar en su estado original para ser elegibles
              para devolución o cambio.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Costos de devolución:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Si la devolución o cambio es debido a un error de nuestra parte,
              nos haremos cargo de todos los costos adicionales.
            </li>
            <li>
              Si la devolución o cambio es por decisión del cliente, los costos
              de envío asociados serán responsabilidad del cliente.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">Reembolsos:</h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Se efectuará un reembolso si el producto comprado no está
              disponible. Los tiempos para el reembolso dependerán del método de
              pago original utilizado.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Retractación de la compra:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              En caso de que desees retractarte de tu compra, no se realizará
              una devolución de dinero, pero podrás utilizar el valor de la
              compra para adquirir otros productos de nuestra tienda.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Cambios por defectos de la fabricación:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Realizaremos cambios sin costo adicional si se evidencia un
              defecto de fabricación en el producto.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Contacto para inquietudes:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Si tienes alguna pregunta o inquietud, no dudes en comunicarte con
              nosotros al whatsapp{" "}
              <Icons.whatsapp className="inline-flex h-4 w-4 text-green-500" />{" "}
              (+57) 321 629 9845 o al correo electrónico{" "}
              <Mail className="inline-flex h-4 w-4 text-pink-froly" />{" "}
              papeleria.pdepapel@gmail.com
            </li>
          </ul>
          <p>
            Siempre estaremos comprometidos con ofrecerte productos de alta
            calidad y un servicio al cliente excepcional. ¡Gracias por elegirnos
            para añadir un toque kawaii a tu vida! {KAWAII_FACE_HAPPY}
          </p>
        </div>
      </Container>
    </>
  );
}
