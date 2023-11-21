import { User2 } from "lucide-react";
import Image from "next/image";

import { Container } from "@/components/ui/container";
import { Separator } from "@/components/ui/separator";

export default function DataPolicyPage() {
  return (
    <>
      <Container>
        <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
          Políticas de tratamiento de datos personales
          <User2 className="ml-2 h-8 w-8" />
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
            , nos comprometemos con el uso responsable y cuidadoso de la
            información personal de nuestros clientes, proveedores, y demás
            personas relacionadas con nuestra tienda virtual de papelería
            kawaii. Esta política se rige conforme a la Ley 1581 de 2012 y sus
            modificaciones, asegurando el manejo legal y voluntario de los
            datos, y garantizando la privacidad de los mismos.
          </p>
          <h3 className="font-serif text-lg font-semibold">
            Recolección de información:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              La información personal se recoge a través de nuestra página web,
              correos electrónicos, mensajes electrónicos, llamadas telefónicas,
              o cualquier otro medio que utilicemos para tal fin.
            </li>
            <li>
              Antes de recopilar cualquier dato, requerimos la autorización del
              titular para su uso y manejo, conforme a nuestras políticas.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Uso y finalidad del tratamiento de datos:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Los datos recogidos se utilizan para mejorar nuestro servicio al
              cliente, promocionar nuestros productos kawaii, administrar datos
              para eventos, control de calidad, y demás actividades relacionadas
              con nuestro objeto social.
            </li>
            <li>
              No compartiremos tus datos sin tu autorización previa, y no
              utilizaremos datos sensibles.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Derechos de los titulares:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Los titulares tienen derecho a acceder, conocer, actualizar,
              rectificar, y solicitar la supresión de sus datos.
            </li>
            <li>
              Pueden revocar la autorización y presentar quejas ante la
              autoridad competente.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Procedimiento para ejercer derechos de habeas data:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Para hacer valer tus derechos, envíanos tu nombre completo, datos
              de contacto, y el motivo de tu solicitud a{" "}
              <span className="font-serif font-medium">
                papeleria.pdepapel@gmail.com
              </span>
              .
            </li>
            <li>
              Resolveremos tu solicitud con las autoridades competentes en un
              máximo de 15 días hábiles.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Responsabilidad del cliente:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              Al usar nuestro sitio web, te comprometes a proporcionar
              información veraz y actualizada.
            </li>
            <li>
              Te responsabilizas de actualizar tus datos y no utilizar la
              información del sitio para fines ilegales.
            </li>
          </ul>
          <h3 className="font-serif text-lg font-semibold">
            Exoneración de responsabilidad:
          </h3>
          <ul className="list-disc space-y-3 pl-5">
            <li>
              <Image
                src="/images/text-beside-transparent-bg.webp"
                alt="logo"
                width={80}
                height={20}
                quality={100}
                title="P de Papel"
                className="inline-flex object-contain"
              />
              no es responsable por el uso indebido de tus datos personales si
              no se ha notificado oportunamente una violación de estos.
            </li>
          </ul>
          <p>
            En nuestra tienda ofrecemos la opción de realizar compras sin la
            necesidad de crear una cuenta en nuestro sitio. Entendemos que
            algunos clientes prefieren un proceso de compra rápido y sin
            compromisos adicionales. Por lo tanto, para estas transacciones,
            recopilaremos únicamente la información necesaria para procesar la
            venta, como datos de contacto y dirección de envío. Queremos
            asegurarte que estos datos se utilizarán exclusivamente para el
            registro de la venta, el procesamiento del pedido y fines de
            seguimiento de la entrega. No se almacenarán para otros usos ni se
            compartirán con terceros para fines distintos a los mencionados,
            garantizando así tu privacidad y la seguridad de tus datos
            personales.
          </p>
        </div>
      </Container>
    </>
  );
}
