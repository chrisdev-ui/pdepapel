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
