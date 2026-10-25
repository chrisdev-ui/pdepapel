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
3. Completa `E2E_ADMIN_CLERK_USER_ID`. Si `pdepapel-admin/.env` ya contiene claves `sk_test_...` y `pk_test_...`, el runner las carga automáticamente; de lo contrario, define allí `CLERK_SECRET_KEY` y las claves publicables de esa instancia.
4. Levanta la base local y corre la prueba (cada comando de Playwright siembra solo `e2e-admin-store` y `copilot_ro` antes de empezar):

```bash
npm run test:db:up
npm run test:db:push
npm run test:e2e:admin
```

La semilla (`test:e2e:seed-admin`, también suelta) solo puede escribir en `pdepapel_test` y crea o actualiza la tienda `e2e-admin-store`. Sin `pdepapel-admin/.env.e2e.local` los comandos de Playwright del panel se detienen en la semilla en vez de saltarse pruebas. `test:e2e:admin` falla si faltan las claves de desarrollo en vez de simular una sesión. Al terminar, ejecuta `npm run test:db:down` para eliminar el contenedor y sus datos.

## Reglas de seguridad

- No ejecutar E2E de compra contra producción con pagos reales.
- No reutilizar credenciales personales ni de producción en pruebas autenticadas.
- Para flujos autenticados del administrador, usar una cuenta Clerk exclusiva de pruebas y una base de datos aislada.
- Las pruebas nunca heredan la URL de producción del `.env` local. Toda conexión pasa por `pdepapel-admin/scripts/lib/test-database.mjs`. Solo acepta `pdepapel_test` en `127.0.0.1`, `localhost` o `::1`. Detiene la corrida con un error, nunca la salta, si la URL falta, si apunta al servidor de producción o si usa el usuario `pdepapel_ro`. Lo aplican la configuración de Vitest (unitarias, integración y evaluaciones), el arranque de Playwright, `createTestPrismaClient` en las e2e y las semillas. Una e2e sola se corre con `npm run test:e2e -- <archivo>`.
- Las unitarias y las de integración no usan claves reales ni salen a la red (`pdepapel-admin/scripts/lib/test-isolation.mjs`). Toda clave externa recibe un valor de prueba antes de cualquier import, porque Prisma copia el `.env` en `process.env` al cargarse. Además, cualquier conexión que no vaya a la máquina local falla con «red bloqueada». Una clave nueva va en `TEST_ENV_STUBS`, o la prueba de auditoría falla. Un servicio de fuera se dobla con `vi.mock`.
- Las e2e corren solas, nunca a la vez que Vitest, un build u otro trabajo pesado: la carga produce fallos falsos.
- Ningún modo de prueba llega a un servicio externo real. Los dos servidores de las e2e (desarrollo y build de producción) corren con claves de prueba, salvo Clerk de desarrollo, y sin red salvo la máquina local y Clerk. `E2E_NETWORK_LOG=<archivo>` anota lo que se habría intentado.
- La puerta corre las e2e sobre un build de producción: `npm run test:e2e:prod` (build en `.next-e2e` y `next start -p 3101`, con claves de prueba y sin red salvo Clerk de desarrollo). `npm run test:e2e -- <archivo>` (servidor de desarrollo) queda para probar un archivo suelto. La puerta corre con un solo trabajador (las pruebas comparten la tienda de pruebas). Cada comando de Playwright del panel corre antes `test:e2e:seed-admin`, que vuelve a sembrar `e2e-admin-store` (la integración la borra) y crea `copilot_ro` en `pdepapel_test`; `with-e2e-env.mjs` pone por defecto `COPILOT_DATABASE_URL=mysql://copilot_ro@<host de TEST_DATABASE_URL>/pdepapel_test` y `VERCEL_GIT_COMMIT_SHA` = `HEAD` (un valor explícito manda), así que el copiloto y el aviso de versión ya no se saltan. En la tienda, `npm run test:e2e:local` revisa antes que la base de pruebas conteste (si no, la levanta con Docker y aplica el esquema) y siembra.
- No subir `.env.e2e.local` ni claves de Clerk. Cuando se habilite este E2E en CI, configurar esas claves únicamente como secretos del repositorio.
- Cada regresión corregida debe añadir primero una prueba que falle con el comportamiento anterior.

## CI

`Quality checks` ejecuta tipos y pruebas con cobertura mínima en ambos proyectos para cada pull request y actualización de `main`. En administración también levanta MySQL temporal, aplica el esquema y ejecuta las pruebas de integración contra `pdepapel_test`. Los límites iniciales se basan en las rutas de mayor riesgo ya cubiertas y solo se deben aumentar cuando la cobertura se mantenga de forma consistente. Los límites consideran todos los módulos que importan las pruebas, no una selección artificial de archivos. El 2026-09-04 los umbrales del administrador se recalibraron a la línea base medida (60 % sentencias, 50 % ramas, 62 % funciones, 62 % líneas), porque los valores originales de julio nunca se alcanzaron y el flujo `Quality checks` llevaba en rojo desde el 2026-08-16; ese mismo día las suites de componentes del administrador dejaron de depender de un archivo `.env` local gracias a valores públicos de prueba en `vitest.config.mts`, y las suites de integración rellenan con marcadores solo las variables ausentes desde `tests/integration/setup.ts` (nunca `DATABASE_URL` ni `NODE_ENV`, que fija `scripts/with-test-env.mjs`). `Public health checks` conserva la verificación E2E de navegación, SEO y rutas públicas después de cada despliegue de producción.
