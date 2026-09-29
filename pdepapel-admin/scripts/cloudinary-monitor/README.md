# Seguimiento diario de créditos de Cloudinary

Guion independiente (`usage.mjs`, sin dependencias, Node 24) que consulta el Admin API de Cloudinary una vez al día y deja constancia del consumo del ciclo para decidir, antes de la renovación, si el plan gratuito (28 créditos) vuelve a alcanzar o el plan de pago se queda.

## Credencial

- Vive solo en `scripts/cloudinary-monitor/.env` (ignorado por git), como `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`. Es un token dedicado al seguimiento, distinto de la credencial de la app.
- Todo lo que el guion imprime, registra o escribe en disco pasa por `redact()`: borra la clave, el secreto y cualquier URL `cloudinary://`. El error crudo del transporte nunca llega a stdout ni a un archivo.

Variables opcionales en el mismo `.env`: `FREE_TIER_CREDITS` (28), `CYCLE_DAYS` (30), `BILLING_CYCLE_START` (`AAAA-MM-DD`; sin ella se toma el día 1 del mes en UTC).

## Correr a mano

```bash
cd pdepapel-admin && npm run cloudinary:usage
```

Salida: una línea `fecha · créditos (% de 28) · día N/30 · OK|WOULD EXCEED FREE TIER, projected X%`, más una fila en `usage-log.csv` y una entrada en `monitoring-log.md` (misma tabla periodo / transformaciones / ancho de banda / almacenamiento / total que la auditoría). Un error del API deja una línea redactada en `monitor-errors.log`, sale por stderr y el proceso termina con código distinto de cero.

## Corrida diaria (macOS, launchd)

`com.pdepapel.cloudinary-monitor.plist` se instala en `~/Library/LaunchAgents/` y corre el guion todos los días a las 08:00 hora local; si el Mac estaba dormido a esa hora, launchd lo corre al despertar. Salida y errores del agente van a `launchd.out.log` y `launchd.err.log` en esta carpeta.

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.pdepapel.cloudinary-monitor.plist   # registrar
launchctl print gui/$(id -u)/com.pdepapel.cloudinary-monitor | head -20                            # verificar
launchctl kickstart -k gui/$(id -u)/com.pdepapel.cloudinary-monitor                                # correr ahora
launchctl bootout gui/$(id -u)/com.pdepapel.cloudinary-monitor                                     # quitar
```

En Windows el equivalente sería una tarea diaria del Programador de tareas que ejecute el mismo comando `node --env-file=... usage.mjs`.
