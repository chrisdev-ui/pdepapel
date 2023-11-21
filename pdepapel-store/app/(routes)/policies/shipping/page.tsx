import { CircleDollarSign, Truck } from "lucide-react";
import Image from "next/image";

import { Container } from "@/components/ui/container";
import { Separator } from "@/components/ui/separator";
import { KAWAII_FACE_WELCOME } from "@/constants";

export default function ShippingPolicyPage() {
  return (
    <>
      <Container>
        <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
          Políticas de entrega
          <Truck className="ml-2 h-8 w-8" />
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
            , nos esforzamos por ofrecerte un servicio de entrega eficiente y
            confiable. Aquí detallamos nuestras políticas para asegurar una
            experiencia de compra satisfactoria.
          </p>
          <h3 className="font-serif text-lg font-semibold">
            Condiciones de envío gratuito:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Para pedidos con un valor superior a{" "}
              <CircleDollarSign className="inline-flex h-4 w-4 text-green-500" />
              150.000 COP, el envío será gratuito. Queremos que disfrutes de
              nuestros productos kawaii sin preocuparte por el costo del envío.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Tiempos de Entrega:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Para pedidos dentro de Medellín, garantizamos la entrega en un
              máximo de 48 horas después de la compra.
            </li>
            <li>
              Para otras ciudades, la coordinación de la entrega y todos los
              datos del envío se proporcionarán via whatsapp, y pueden demorar
              de 2 a 4 días hábiles.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Política de espera y reprogramación:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Si al momento de entregar el pedido no hay nadie disponible para
              recibirlo, podemos esperar hasta 15 minutos. De no ser posible la
              entrega, se reprogramará.
            </li>
            <li>
              En caso de que en una segunda oportunidad tampoco haya alguien
              para recibir el pedido, un tercer intento de entrega tendrá un
              costo adicional.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Recepción del pedido:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Cualquier persona presente en el lugar de entrega podrá recibir el
              pedido en tu nombre.
            </li>
            <li>
              Recomendamos que el pedido sea revisado al momento de la entrega
              para garantizar tu completa satisfacción.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Pedidos durante fines de semana y festivos:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Las compras realizadas el sábado después de la 1:00pm, los
              domingos o en días festivos, se entregarán el siguiente día hábil.
            </li>
            <li>
              Si necesitas una entrega urgente, no dudes en contactarnos para
              verificar si podemos acelerar el proceso.
            </li>
          </ul>
          <p>
            Siempre estaremos comprometidos a que recibas tus artículos de
            papelería favoritos de manera rápida y segura. ¡Gracias por
            elegirnos para agregar un toque kawaii a tu vida!{" "}
            {KAWAII_FACE_WELCOME}
          </p>
        </div>
      </Container>
    </>
  );
}
