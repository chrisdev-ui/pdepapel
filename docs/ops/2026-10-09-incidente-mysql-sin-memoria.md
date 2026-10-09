# Incidente: MySQL se quedó sin memoria (2026-10-08 y 2026-10-09)

## Qué pasó

- **Servicio:** «MySQL US East» (proyecto Railway «PdePapel Database», servicio `735dd22e-860e-4b48-8e56-c11bb1930eba`, entorno `production` `cd420bfa-a0ad-450c-aeee-9ca43e6c711e`). Imagen `mysql:8.4` (8.4.11), límite de memoria de 2 GB.
- **Dos reinicios por falta de memoria (OOM):** 2026-10-08 11:58 UTC y 2026-10-09 19:38 UTC. La política de reinicio (On Failure) lo levantó en ~10 s cada vez; la recuperación de InnoDB fue limpia.
- **Patrón:** tras cada arranque la memoria del contenedor empezaba en ~600 MB y subía sin parar hasta 2 GB en 24–30 h.
- Christian reinició a mano a las 19:48:22 UTC y subió el servicio a 8 vCPU / 8 GB como tapón (el cambio de tamaño no reinició MySQL).

## Línea de tiempo del 2026-10-09 (registros de Vercel)

| UTC | Qué se vio |
|---|---|
| ~19:37:20 | Las consultas empiezan a colgarse; una página del panel llega al tope de 60 s a las 19:38:20. |
| 19:38:13–19:38:19 | 5 lecturas de `/products` de la tienda fallan con P2024 (sin conexión libre en el pool). |
| 19:38:33–19:38:34 | Corte por OOM: ~28 lecturas de la tienda (fichas y una subcategoría) fallan con P1017. |
| 19:48:22–19:48:29 | Reinicio manual: 2 eventos del webhook de WhatsApp y 1 página del panel fallan con P1001. |

Del 2026-10-08 no hay registros: Vercel guarda los de ejecución 1 día. En la base, esa ventana (11:40–12:20) no tiene webhooks, pagos, pedidos, outbox ni trabajos.

## Impacto

- **Pagos (Bold/Wompi), notificaciones y outbox de Mercado Libre, envíos y pedidos:** nada falló en ninguna de las dos ventanas; el outbox estaba completo y sin errores. Nada que reproducir.
- **Tienda:** las lecturas que fallaron fueron errores para esas visitas; las 8 fichas afectadas responden 200 después (no quedó un error en caché).
- **WhatsApp:** se perdieron 2 eventos (un acuse de entrega y el eco de un mensaje enviado desde la app de WhatsApp Business). El webhook responde 200 aunque no pueda guardar, para que Meta no desactive la suscripción, así que Meta no los reenvía. Se arregla con la cola de reintento de abajo.
- **Copia de seguridad:** la diaria del 2026-10-09 (15:28 UTC, 97 tablas) está completa y subida a R2.

## Causa raíz

**MySQL se dimensionaba con la RAM del servidor, no con la del contenedor**, y la memoria que soltaba no volvía al sistema.

Medido con `pdepapel_ro` (permiso de diagnóstico concedido el 2026-10-09 20:08 UTC con `scripts/grant-diagnostics-read.mjs` por `prod:write`):

| | 20:09 UTC (21 min de uptime) | 21:10 UTC (82 min) |
|---|---|---|
| Memoria que MySQL contabiliza (`sys.memory_global_total`) | 598 MiB | 605 MiB (+7) |
| Memoria del contenedor (gráfico de Railway) | ~610 MB | ~810 MB (+~200) |
| Pico de sentencias preparadas | 77 MiB | 194 MiB (bajó a 19) |
| Pico de tablas temporales en RAM (TempTable) | 41 MiB | 92 MiB (bajó a 23) |
| Conexiones de la app inactivas más de 1 h | 0 | 12 de 32 |

- MySQL contabiliza casi nada del crecimiento: lo que sube es memoria liberada que el asignador de glibc no devuelve (fragmentación), alimentada por picos de sentencias preparadas y tablas temporales.
- `temptable_max_ram` valía **4 GB** y `performance_schema` se autodimensionaba (~240 MiB), ambos calculados con la RAM del host.
- `wait_timeout` de 8 h mantenía vivas las conexiones que dejan las instancias de Vercel que se congelan o se reciclan (166 conexiones cortadas sin cerrar en una hora).
- El buffer pool (128 MB, ~34 MB de datos) no era el problema.
- Los avisos «Background histogram update … Lock wait timeout» no requieren acción: no hay histogramas (`information_schema.COLUMN_STATISTICS` vacío); es el recálculo de estadísticas que se salta una tabla bloqueada.

## Arreglo

### 1. MySQL (un solo reinicio; la hora va en «Después del cambio»)

Probado antes en un `mysql:8.4.11` local con 2 GB: arranca limpio en 9 s, reinicia limpio sobre los mismos datos y `SHOW VARIABLES` devuelve cada valor.

- Variable de servicio nueva: `MALLOC_ARENA_MAX=2`.
- Comando de arranque nuevo:

```
docker-entrypoint.sh mysqld --innodb-use-native-aio=0 --disable-log-bin --max-connections=200 --slow-query-log=1 --long-query-time=0.5 --log-output=TABLE --performance-schema=1 --innodb-buffer-pool-size=256M --innodb-log-buffer-size=16M --temptable-max-ram=128M --tmp-table-size=32M --max-heap-table-size=32M --wait-timeout=600 --interactive-timeout=600 --table-open-cache=1000 --table-open-cache-instances=4 --table-definition-cache=600 --performance-schema-digests-size=2000 --performance-schema-events-statements-history-long-size=1000 --performance-schema-events-stages-history-long-size=1000 --performance-schema-events-waits-history-long-size=1000 --performance-schema-events-transactions-history-long-size=1000 --performance-schema-max-digest-length=512 --performance-schema-max-sql-text-length=512
```

**Volver atrás** (comando y variables anteriores, tal como estaban):

```
docker-entrypoint.sh mysqld --innodb-use-native-aio=0 --disable-log-bin --max-connections=300 --slow-query-log=1 --long-query-time=0.5 --log-output=TABLE --performance-schema=1
```

…y borrar `MALLOC_ARENA_MAX`. Valores anteriores: `max_connections` 300, `innodb_buffer_pool_size` 128M, `innodb_log_buffer_size` 64M, `temptable_max_ram` 4G, `tmp_table_size` y `max_heap_table_size` 16M, `wait_timeout` e `interactive_timeout` 28800, `table_open_cache` 4000 con 16 instancias, `table_definition_cache` 2000, performance_schema autodimensionado. Cómo se aplica: `serviceInstanceUpdate(startCommand)` y `variableUpsert`/`variableDelete` con `skipDeploys`, luego `serviceInstanceDeployV2`, siempre con el id del servicio de arriba (la CLI está enlazada a la base vieja de US West).

### 2. Prisma en Vercel

`withConnectionPoolParams` añade `max_idle_connection_lifetime=60` y `max_connection_lifetime=900` (salvo que la URL ya los traiga): las instancias vivas cierran sus conexiones ociosas en un minuto y renuevan las largas, lo que suelta sus sentencias preparadas. Al arrancar registra los parámetros efectivos del pool, sin host ni credenciales: `DATABASE_URL` es un secreto de Vercel que no se puede leer.

### 3. Vigilancia

La revisión diaria avisa si la memoria que contabiliza MySQL pasa del 70 % del límite, si las conexiones pasan del 70 % de `max_connections`, o si MySQL lleva menos de 24 h encendido sin un reinicio planeado (así un OOM nocturno se ve a la mañana siguiente).

La memoria del contenedor (la que tumbaba el servicio) no la ve MySQL: la revisión diaria la lee de las métricas de Railway con un token de proyecto (`RAILWAY_METRICS_TOKEN`) y manda un correo, como mucho uno cada 20 h, si pasa de 2 GB o crece más de 300 MB en 24 h. Los monitores de Railway piden el plan Pro.

### 4. WhatsApp

Si el webhook no puede guardar un evento, sigue respondiendo 200, pero guarda el cuerpo verificado en Upstash Redis (no depende de MySQL) y lo reintenta por QStash hasta guardarlo una sola vez.

## Después del cambio

Aplicado el 2026-10-09, después del despliegue del panel (`8f24ec46`, Ready a las 21:45 UTC).

| UTC | Qué pasó |
|---|---|
| 21:46:19 | Primer intento. Railway no pudo bajar la imagen: Docker Hub respondió «504 Gateway Timeout» para `mysql:8.4` (paso CREATE_CONTAINER). El contenedor nuevo nunca se creó y el viejo siguió atendiendo sin reiniciarse; se volvió a dejar el comando y las variables anteriores. |
| 21:54:02 | Segundo intento, mismo procedimiento. |
| 21:54:13 | «ready for connections» (8.4.11), 11 s después; el despliegue `87c01018` queda activo. |

**Verificado:** las 25 variables con su valor nuevo (`SHOW VARIABLES` con `pdepapel_ro`); panel y tienda en 200; 15 minutos sin errores ni avisos en los registros de Vercel de los dos proyectos. El registro `[PRISMA_POOL]` confirma que la `DATABASE_URL` de producción no trae parámetros de pool: rigen los del código.

| Memoria del contenedor (Railway) | Antes | Después |
|---|---|---|
| Recién arrancado | ~600 MB | 345 MB (a los 33 s) |
| A los ~20 min | ~610 MB | 440 MB (a los 16 min) |
| A las ~2 h | 937 MB y subiendo | se mide en la revisión del 2026-10-10 |

La memoria que contabiliza MySQL pasó de 598 MiB (21 min, antes) a 555 MiB (16 min, después). La prueba de fondo es la tendencia: antes subía ~200 MB por hora hasta el OOM.
