# 0001. Copiloto experto: proveedor, presupuesto y acceso a datos

- Estado: **aceptada** el 2026-10-10, con los cambios de «Ajustes al aprobar» al final
- Fecha: 2026-10-10
- Diseño completo: [docs/design/asistente-experto-paula.md](../design/asistente-experto-paula.md)

## Contexto

Paula quiere un copiloto en el panel que asesore sobre el oficio (materiales, técnicas, marcas), lea los datos del negocio para decidir, y más adelante proponga cambios. Hay cinco restricciones:

1. Los datos del negocio y los datos personales no van a un proveedor gratuito. Gemini en este proyecto usa el plan gratuito.
2. Christian cuida el costo y la complejidad.
3. El 2026-10-09 MySQL se quedó sin memoria dos veces. La app tiene un pool de 6 conexiones con el usuario root y no hay tablas de resumen; varios loaders de análisis recorren tablas enteras.
4. Nada en el proyecto transmite respuestas en streaming. Todas las rutas de API tienen 60 s.
5. Ya existe un router de proveedores (`lib/ai-provider.ts`) con OpenAI principal, Gemini de respaldo, marcas de salto en Redis, registro de costo y un tope compartido de USD 1 al día.

## Decisión

### 1. Proveedor: OpenAI solamente, a través del router existente

- El copiloto llama a OpenAI con `streamText` directamente (sin `router.stream()`), pero respeta la marca de salto de OpenAI que pone el router y escribe el mismo registro `[AI_MODEL_CALL]` por paso.
- Hay dos modelos y los elige una regla, nunca el modelo:
  - `gpt-6-luna` para el modo normal;
  - `gpt-6.1-sol` (esfuerzo `low`) cuando Paula pide «análisis a fondo».
- Se usa la Responses API con `store: false`.
- Si OpenAI falla, el copiloto avisa que no está disponible; no cae a Gemini.

### 2. Presupuesto propio, separado del tope compartido

- Constantes en código: USD 1 al día y USD 15 al mes.
- Claves `ai:copiloto:spend:<día>` y `ai:copiloto:spend:<mes>`.
- Al 70 % del mes se apaga el modo fuerte.
- Si Redis no responde, el copiloto no arranca, porque sin Redis no se puede contar el gasto.
- El gasto del copiloto no cuenta en el tope compartido de USD 1, para no dejar sin servicio al bot de WhatsApp ni al asistente de productos.

### 3. Datos: herramientas tipadas sobre una conexión de solo lectura propia

- Un cliente Prisma solo para el copiloto, conectado como `copilot_ro`:
  - `connection_limit=1` y `pool_timeout=5`;
  - `max_execution_time` de 3 s por consulta.
- Requiere **una variable de entorno nueva, `COPILOT_DATABASE_URL`, solo en Production y marcada como sensible**. Sin ella el copiloto no existe: la página da 404, las rutas responden 404 o 503 y el menú no lo muestra. Nunca cae a la conexión root.
- `copilot_ro` tiene `MAX_USER_CONNECTIONS 2` y solo `SELECT`, por columna donde la tabla tiene datos de contacto. Por eso cada herramienta pide columnas explícitas y no reutiliza los loaders del panel; una cifra puede diferir del panel si el loader del panel usa columnas que el copiloto no ve.
- El modelo solo llama a herramientas con entradas validadas por zod y límites de filas. No hay SQL libre.
- Cada herramienta exige `requireStoreOwner` y devuelve un sobre fijo, marcado como datos no confiables y sin datos de contacto.
- v1 se limita a lecturas acotadas. Las tendencias y los rankings esperan a tablas de fotos diarias (v2), que llena un trabajo diario por QStash procesando solo el día anterior.

### 4. Streaming con el protocolo de mensajes de AI SDK 7

- `POST /api/[storeId]/copiloto/chat` con `streamText`:
  - herramientas y `stopWhen: isStepCount(6)`;
  - corte propio a los 50 s;
  - `consumeStream()` para guardar aunque se caiga la conexión;
  - `createUIMessageStreamResponse()` sobre SSE en el runtime Node.
- El cliente usa `useChat` de `@ai-sdk/react`, que requiere instalarlo.
- Lo que no cabe en 60 s pasa a un informe en segundo plano (v3).

### 5. Conocimiento en el prompt, no en una base vectorial

- 30 a 40 notas en Markdown, aprobadas por Paula con huella del texto, van en el prefijo fijo del prompt para aprovechar la caché.
- Los borradores viven en el repositorio; lo que Paula corrige y aprueba se guarda en la base (`AssistantKnowledgeNote`). Una nota entra al prompt solo si la huella aprobada coincide con el texto vigente.
- Upstash Vector se adopta solo si el conocimiento supera unos 40.000 tokens.

### 6. Escrituras como propuestas (v2)

- El modelo produce una propuesta tipada; Paula ve el antes y el después y confirma.
- La ejecución usa la misma función de dominio que la ruta actual, con historial y deshacer.
- No hay borrados. Mercado Libre siempre es riesgo alto.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Gemini como respaldo del copiloto | plan gratuito; los datos del negocio no van ahí. Pagar Gemini exige un cambio de facturación que no está aprobado |
| xAI Grok | excluido por decisión del negocio; solo podría entrar en el módulo opcional de imagen y video, con su propio presupuesto |
| Conexión root actual + lista de llamadas permitidas en código | no necesita variable nueva, pero un error de código o una herramienta mal escrita podría escribir; la base no lo impide, y comparte el pool de 6 conexiones del panel. Queda como plan B si no se aprueba la variable, con el mismo cliente aparte de 1 conexión |
| SQL generado por el modelo | imposible de acotar en costo, memoria y datos personales |
| Calcular tendencias en vivo | fue lo que llevó a MySQL al límite; las fotos diarias cuestan una consulta pequeña por día |
| Upstash Vector desde v1 | infraestructura y variables nuevas para un conocimiento que cabe en el prompt; la búsqueda puede no traer la nota correcta |
| `needsApproval` de AI SDK para las escrituras | deja la ejecución dentro del ciclo del modelo; se prefiere una ruta aparte con historial, verificación del «antes» y deshacer |
| Respuesta completa sin streaming | con 5–20 s por respuesta, en el celular parece colgado |
| Vercel AI Gateway | otra cuenta y otra facturación para un solo proveedor; el router existente ya da saltos, registro y topes |

## Consecuencias

**A favor:**

- Costo esperado de ≈ USD 4 al mes con 50 conversaciones y ≈ USD 15 con 200, con techo duro de USD 15.
- La base de producción no recibe consultas pesadas del copiloto, y la conexión de solo lectura impide escribir aunque el código falle.
- El bot de WhatsApp y el asistente de productos conservan su presupuesto.
- Se reutilizan la marca de salto del router, los helpers de reportes, `lib/store-access.ts` y el patrón de aprobación por huella.

**En contra:**

- Una variable nueva en Production, y su URL contiene la clave de `copilot_ro`: hay que rotarla si se filtra.
- Un paquete nuevo (`@ai-sdk/react`).
- El copiloto tiene su propio camino de llamada a OpenAI, fuera del router.
- Sin respaldo de proveedor: si OpenAI cae, el copiloto no responde.
- v1 no responde tendencias largas hasta que existan las fotos diarias.
- Cada acción de escritura de v2 obliga a extraer el cuerpo de su ruta a un servicio compartido.

## Ajustes al aprobar (2026-10-10)

1. Variable de solo lectura: aprobada. Christian crea `copilot_ro` en la consola de Railway con su propia contraseña (`prisma/manual-migrations/20261010_create_copilot_ro_user.sql`) y agrega `COPILOT_DATABASE_URL`. Mientras no exista, el copiloto sale oculto.
2. `@ai-sdk/react` instalado y fijado a la línea de `ai@7`, con un solo `@ai-sdk/provider`.
3. Topes de USD 1 al día y USD 15 al mes, con «a fondo» apagado al 70 % del mes. El gasto se ve en Inicio → Sistemas.
4. `MAX_USER_CONNECTIONS 2`.
5. GA4 queda fuera de v1. El recordatorio semanal de Mercado Libre (#12) va en el resumen del lunes de v3.
6. Las cuentas de solo lectura de la agencia no ven el copiloto.
7. La primera escritura de v2 serán solo textos de productos.
