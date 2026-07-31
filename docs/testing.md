# Estrategia de pruebas

## Capas

- **Unitarias:** reglas puras que no requieren red, Clerk ni base de datos. Cubren rutas, pagos, slugs, firmas de Bold, normalización de pedidos y rangos de fechas.
- **Componentes:** comportamientos de interfaz con JSDOM. El selector de rangos comprueba atajos, restauración de borradores y que un clic no envíe el formulario.
- **E2E:** Playwright valida navegación pública de la tienda y la protección de acceso del administrador. Las pruebas públicas existentes siguen ejecutándose contra producción solo después de despliegues exitosos y no modifican datos. Las comprobaciones administrativas autenticadas usan una sesión temporal de Clerk Agent Tasks, no cookies ni contraseñas.
- **Integración de base de datos:** debe ejecutarse únicamente contra `TEST_DATABASE_URL`, nunca contra `DATABASE_URL`. Antes de agregar cada prueba con Prisma, se debe crear y limpiar su propio conjunto de datos.

## Comandos

Ejecuta cada comando desde la carpeta del proyecto correspondiente:

```bash
npm run test:unit
npm run test:unit:watch
npm run test:coverage
npm run test:db:up
npm run test:db:push
npm run test:integration
npm run test:e2e
npm run test:e2e:seed-admin
npm run test:e2e:admin
```

Para preparar la base de datos de integración del administrador, copia `pdepapel-admin/.env.test.example` como `pdepapel-admin/.env.test`. Las pruebas rechazan cualquier URL que no sea local y que no termine en `pdepapel_test`; nunca pueden utilizar Railway ni producción. Cuando termines, libera memoria y datos con `npm run test:db:down`.

La tienda ya permite indicar una URL segura para E2E:

```bash
E2E_BASE_URL=https://url-de-pruebas.example npm run test:e2e
```

Para ejecutar el recorrido de compra sin crear órdenes ni abrir una pasarela, define además un producto disponible del entorno de pruebas:

```bash
E2E_BASE_URL=https://url-de-pruebas.example \
E2E_PURCHASABLE_PRODUCT_SLUG=producto-de-pruebas \
npm run test:e2e
```

El administrador inicia en `http://127.0.0.1:3101` durante `npm run test:e2e`. Al iniciarlo localmente, Playwright exige `TEST_DATABASE_URL`, por lo que nunca usa Railway ni la base de datos productiva. Para usar un entorno de pruebas ya iniciado, define `E2E_ADMIN_BASE_URL` con un dominio asociado a la instancia de desarrollo/staging de Clerk.

### Clerk Agent Tasks

Las comprobaciones autenticadas crean una sesión temporal de hasta cinco minutos para un usuario E2E; no almacenan el estado del navegador. Clerk Agent Tasks está en beta, por lo que se utiliza solo contra una instancia de desarrollo o staging, nunca con claves `sk_live_`.

1. En Clerk Dashboard, crea un usuario exclusivo de pruebas y copia su ID (`user_...`).
2. Copia `pdepapel-admin/.env.e2e.example` como `pdepapel-admin/.env.e2e.local`.
3. Completa `CLERK_SECRET_KEY` y las claves publicables con valores `sk_test_...` y `pk_test_...` de esa instancia, además de `E2E_ADMIN_CLERK_USER_ID`.
4. Prepara la base local y la tienda cuyo dueño es ese usuario:

```bash
npm run test:db:up
npm run test:db:push
npm run test:e2e:seed-admin
npm run test:e2e:admin
```

`test:e2e:seed-admin` solo puede escribir en `pdepapel_test` y crea o actualiza la tienda `e2e-admin-store`. `test:e2e:admin` falla si faltan las claves de desarrollo en vez de simular una sesión. Al terminar, ejecuta `npm run test:db:down` para eliminar el contenedor y sus datos.

## Reglas de seguridad

- No ejecutar E2E de compra contra producción con pagos reales.
- No reutilizar credenciales personales ni de producción en pruebas autenticadas.
- Para flujos autenticados del administrador, usar una cuenta Clerk exclusiva de pruebas y una base de datos aislada.
- No subir `.env.e2e.local` ni claves de Clerk. Cuando se habilite este E2E en CI, configurar esas claves únicamente como secretos del repositorio.
- Cada regresión corregida debe añadir primero una prueba que falle con el comportamiento anterior.

## CI

`Quality checks` ejecuta tipos y pruebas con cobertura mínima en ambos proyectos para cada pull request y actualización de `main`. En administración también levanta MySQL temporal, aplica el esquema y ejecuta las pruebas de integración contra `pdepapel_test`. Los límites iniciales se basan en las rutas de mayor riesgo ya cubiertas y solo se deben aumentar cuando la cobertura se mantenga de forma consistente. Los límites consideran todos los módulos que importan las pruebas, no una selección artificial de archivos. `Public health checks` conserva la verificación E2E de navegación, SEO y rutas públicas después de cada despliegue de producción.
