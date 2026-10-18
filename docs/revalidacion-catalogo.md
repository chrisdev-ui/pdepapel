# Revalidación del catálogo

El panel administrativo actualiza el catálogo público por medio de `POST /api/revalidate` después de modificar productos, categorías o inventario.

## Purgas acotadas (desde 2026-10-13)

Cada cambio purga solo lo que toca. El panel resuelve los productos afectados (`lib/storefront-cache-scope.ts`) y manda `{ version: 2, tags, paths }`; la tienda purga exactamente eso (`app/api/revalidate/route.ts`, con lista blanca de etiquetas y topes de 200 etiquetas / 50 rutas).

| Etiqueta | La lleva | Se purga cuando |
|---|---|---|
| `product:<slug, id o alias>` | la ficha (`actions/get-product.ts`) | cambia ese producto, una pieza de su kit o un kit que lo contiene |
| `products:group:<id>` | las variantes hermanas en la ficha | cambia una variante del grupo |
| `products:category:<id o slug>` | `/categoria/<slug>` y los sugeridos de cada ficha | cambia un producto de esa categoría |
| `products:type:<id o slug>` | `/tienda?typeId=` | cambia un producto de ese tipo |
| `products:featured` | el encabezado (todas las páginas) y la sección de favoritos del inicio | cambia un producto destacado |
| `products:list` | `/tienda`, rieles del inicio, carrito, próximamente, mapa del sitio | cambia cualquier producto |
| `products` | todas las anteriores | solo en purgas completas |
| `catalog` | árbol de tipos y categorías del encabezado | cambian categorías, tipos o atributos |
| `brands` | lista de marcas (menú, índice `/marcas`, mapa del sitio) | se edita, oculta, archiva, ordena o fusiona una marca, o se asignan marcas a productos |
| `brand:<slug>` | la página `/marcas/<slug>` | cambia esa marca (también sus direcciones anteriores y, en una fusión, las de las dos marcas) |

- Pedidos, pagos (Bold, Wompi), punto de venta, ferias, inventario, recepciones y Mercado Libre purgan los productos de sus líneas, incluidos los kits que los contienen.
- Guardar, mover o borrar un producto o grupo purga también el alcance que tenía antes (categoría, grupo o destacado anteriores).
- Un cambio de marca (`lib/brand-cache.ts › brandStorefrontTarget`) purga `brands`, `products:list`, `brand:<slug>` de cada dirección actual y anterior, las rutas `/marcas` y `/marcas/<slug>`, y los productos y grupos de la marca; una fusión, los de las dos marcas. No es una purga completa.
- Siguen siendo purgas completas, a propósito: ofertas, categorías, tipos, colores, tallas, diseños, atributos, portadas de categoría, migración del catálogo y ajustes de la tienda. `tests/unit/security/storefront-purge-scope-scan.test.ts` falla si aparece otra llamada sin alcance fuera de esa lista.
- Si el alcance no se puede resolver (error, nada resuelto o más de los topes), el panel manda la purga completa: nunca se queda una página vieja, a lo sumo se purga de más.
- Una petición sin `version` sigue haciendo la purga completa de antes, para que un panel y una tienda de despliegues distintos convivan.

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
