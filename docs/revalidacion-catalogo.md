# Revalidación del catálogo

El panel administrativo actualiza el catálogo público por medio de `POST /api/revalidate` después de modificar productos, categorías o inventario.

## Configuración de producción

Configura `REVALIDATION_SECRET` con exactamente el mismo valor, de una sola línea, en ambos proyectos de Vercel:

- `pdepapel-admin`
- `pdepapel-store`

Usa un valor aleatorio sin espacios, comillas ni saltos de línea. El código elimina saltos de línea accidentales al comienzo o final, pero rechaza los que estén dentro del valor para evitar solicitudes HTTP inválidas.

## Verificación

1. Guarda la variable en ambos proyectos para los entornos de producción.
2. Despliega ambos proyectos.
3. Actualiza un producto de prueba en el panel administrativo.
4. Confirma en los registros del panel una respuesta exitosa de `/api/revalidate` y revisa el cambio en el catálogo público.

No compartas el valor del secreto por correo, chat ni capturas de pantalla.

## Firewall de Vercel

La llamada a `/api/revalidate` sale de una función de Vercel del panel, no de un navegador. Si el proyecto `pdepapel-store` tiene activo **Bot Protection** en modo «Challenge» (o **Attack Challenge Mode**), el firewall responde `429` con la cabecera `x-vercel-mitigated: challenge` antes de ejecutar la ruta: en los registros de la tienda no aparece ninguna llamada y el catálogo se queda desactualizado. Así falló la revalidación el 11 de septiembre de 2026.

Para que la protección siga activa para el resto de la tienda sin bloquear el panel:

1. En Vercel abre `pdepapel-store` › **Firewall** › **Rules** y crea una regla con condición *Request Path equals `/api/revalidate`* y acción **Bypass**. Publica los cambios.
2. Alternativa: deja **Bot Protection** en «Log» en vez de «Challenge».
3. Vuelve a guardar un producto en el panel y confirma en los registros de la tienda que `/api/revalidate` responde `200`.

La alerta por correo indica cuándo el fallo viene del firewall («el firewall de Vercel de la tienda respondió con «challenge»») para distinguirlo de un secreto mal configurado. Cualquier otro cliente que no sea un navegador (las pruebas de `public-health.yml`, monitores de disponibilidad) sufre el mismo desafío.
