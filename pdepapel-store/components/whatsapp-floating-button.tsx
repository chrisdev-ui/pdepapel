"use client";

import { FloatingWhatsApp } from "@carlos8a/react-whatsapp-floating-button";

export function WhatsAppFloatingButton() {
  return (
    <div role="complementary" aria-label="Chat de WhatsApp">
      <FloatingWhatsApp
        phoneNumber="573132582293"
        accountName="Papelería P de Papel"
        avatar="/_next/image?url=%2Fimages%2Ftext-below-transparent-bg.webp&w=96&q=75"
        initialMessageByServer="¡Hola! 👋 Bienvenido a Papelería P de Papel. ¿En qué podemos ayudarte hoy?"
        initialMessageByClient="¡Hola! Encontré su contacto en la página web. Me gustaría consultar sobre..."
        statusMessage="En línea"
        startChatText="Iniciar chat con nosotros"
        tooltipText="¿Necesitas ayuda? ¡Haz clic para chatear!"
        allowEsc={true}
      />
    </div>
  );
}
