/**
 * Reglas del guardián de escrituras en producción, sin efectos secundarios,
 * para que `prod-approve.mjs`, `prod-write.mjs`, `prod-client.mjs` y las
 * pruebas compartan exactamente la misma decisión.
 *
 * El problema que resuelve: `.env` traía la URL de producción con el usuario
 * root y cualquier `node --env-file=.env script.mjs` escribía en Railway sin
 * ninguna puerta; la única barrera era una convención en la documentación.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const APPROVAL_FILE = ".prod-write-approval.json";
export const PROD_WRITE_ENV_FILE = ".env.prod-write";
/**
 * La URL de root de la base VIEJA (Railway us-west2) después del corte a
 * us-east4: solo para volver atrás, rotar sus credenciales o retirarla. Con
 * `--expect old` el envoltorio la usa si existe; todo lo demás va a
 * `.env.prod-write`, que apunta a la base nueva.
 */
export const PROD_WRITE_OLD_DB_ENV_FILE = ".env.prod-write.old-db";

/**
 * Qué base es: la nueva («MySQL US East», us-east4) tiene el esquema
 * `migration_meta` con la marca del corte; la vieja no lo tiene.
 */
export const DB_IDENTITIES = ["new", "old"];
export const DB_IDENTITY_MARKER_SCHEMA = "migration_meta";

/**
 * Las dos consultas que deciden la identidad. Ojo: un usuario sin SELECT
 * global (como `pdepapel_ro`, que solo tiene `railway.*`) no ve el esquema
 * `migration_meta` aunque exista, así que para él la base nueva parece la
 * vieja (comprobado el 2026-10-06). Por eso se mira también si el usuario
 * tiene SELECT global: solo así la ausencia de la marca significa algo.
 */
export const DB_IDENTITY_MARKER_SQL =
  "SELECT COUNT(*) AS n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'migration_meta'";
export const DB_IDENTITY_GLOBAL_SELECT_SQL =
  "SELECT COUNT(*) AS n FROM information_schema.USER_PRIVILEGES WHERE PRIVILEGE_TYPE = 'SELECT' AND GRANTEE = CONCAT(QUOTE(SUBSTRING_INDEX(CURRENT_USER(), '@', 1)), '@', QUOTE(SUBSTRING_INDEX(CURRENT_USER(), '@', -1)))";

/**
 * `new` si se ve la marca; `old` si no se ve y el usuario podría verla
 * (SELECT global); `unknown` si el usuario no podría verla aunque existiera.
 */
export function classifyDatabaseIdentity({ markerVisible, globalSelect }) {
  if (markerVisible) return "new";
  return globalSelect ? "old" : "unknown";
}

/**
 * Saca `--expect new|old` (o `--expect=new`) de los argumentos, esté donde
 * esté, y devuelve el resto tal cual. Sin `--expect`, o con un valor que no
 * sea `new`/`old`, devuelve un problema: el envoltorio no adivina a qué base
 * va una escritura.
 */
export function extractExpectArg(args) {
  const rest = [];
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--expect") {
      values.push(args[i + 1]);
      i += 1;
    } else if (arg.startsWith("--expect=")) {
      values.push(arg.slice("--expect=".length));
    } else {
      rest.push(arg);
    }
  }
  if (values.length === 0) {
    return { expect: null, rest, problem: "falta --expect new|old: di a qué base va la escritura (la nueva de us-east4 o la vieja de us-west2). Sin eso no se ejecuta nada." };
  }
  if (new Set(values).size > 1) return { expect: null, rest, problem: `--expect aparece con valores distintos (${values.join(", ")}).` };
  const [expect] = values;
  if (!DB_IDENTITIES.includes(expect)) return { expect: null, rest, problem: `--expect debe ser new u old, no «${expect ?? ""}».` };
  return { expect, rest, problem: null };
}

/** Archivo de la URL de escritura según la base esperada. */
export function prodWriteEnvFileFor(expect, oldDbFileExists) {
  return expect === "old" && oldDbFileExists ? PROD_WRITE_OLD_DB_ENV_FILE : PROD_WRITE_ENV_FILE;
}

/** Problema si la base real no es la esperada; null si coinciden. */
export function databaseIdentityProblem(expect, actual) {
  if (actual === expect) return null;
  if (actual === "unknown") {
    return "este usuario no puede ver la marca `migration_meta` (le falta SELECT global), así que no se sabe qué base es. Las escrituras van con root. No se ejecutó nada y la aprobación sigue válida.";
  }
  const name = (identity) => (identity === "new" ? "la NUEVA (us-east4, con migration_meta)" : "la VIEJA (us-west2, sin migration_meta)");
  return `la base de destino es ${name(actual)}, no ${name(expect)} como dice --expect ${expect}. No se ejecutó nada y la aprobación sigue válida.`;
}
export const PROD_WRITE_LOG = "ops/prod-writes.log";
export const APPROVAL_TTL_MS = 15 * 60 * 1000;

/** Hosts de la base de producción; cualquier otro destino se rechaza. */
export const PRODUCTION_DB_HOST_PATTERN = /(^|\.)(rlwy\.net|railway\.app|railway\.internal)$/i;

/**
 * Modelos del libro mayor: lo que la API sólo toca a través de sus guardas
 * (kardex, pedidos, pagos, ventas de Mercado Libre). Un script sólo puede
 * borrar o modificar aquí si el motivo de la aprobación nombra el modelo.
 */
export const LEDGER_MODELS = new Set([
  "InventoryMovement",
  "Order",
  "OrderItem",
  "PaymentDetails",
  "MarketplaceOrder",
  "MarketplaceOrderItem",
  "MarketplaceOutboxEvent",
  "PaymentWebhookEvent",
]);

export const GUARDED_OPERATIONS = new Set([
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "upsert",
]);

export function newApprovalToken() {
  return randomBytes(24).toString("hex");
}

/**
 * Lo que `prod-approve.mjs` escribe y `prod-write.mjs` consume.
 * @param {{ reason: string, operator?: string | null, now?: number, ttlMs?: number }} input
 */
export function buildApproval({ reason, operator = null, now = Date.now(), ttlMs = APPROVAL_TTL_MS }) {
  const trimmed = String(reason ?? "").trim();
  if (trimmed.length < 12) {
    throw new Error("El motivo debe decir qué se va a escribir y por qué (mínimo 12 caracteres).");
  }
  return {
    token: newApprovalToken(),
    reason: trimmed,
    operator: operator ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    usedAt: null,
  };
}

/**
 * Por qué una aprobación no sirve; `null` si sirve. Un token usado o vencido
 * no se «reactiva»: se pide otro.
 */
export function approvalProblem(approval, now = Date.now()) {
  if (!approval || typeof approval !== "object") return "No hay aprobación: ejecuta `npm run prod:approve -- \"<motivo>\"` en una terminal.";
  if (typeof approval.token !== "string" || approval.token.length < 32) return "La aprobación no tiene un token válido.";
  if (approval.usedAt) return `La aprobación ya se usó el ${approval.usedAt}; pide otra.`;
  const expires = Date.parse(approval.expiresAt ?? "");
  if (!Number.isFinite(expires)) return "La aprobación no tiene fecha de vencimiento.";
  if (expires <= now) return `La aprobación venció el ${approval.expiresAt}; pide otra.`;
  if (!approval.reason || String(approval.reason).trim().length < 12) return "La aprobación no trae motivo.";
  return null;
}

export function markApprovalUsed(approval, now = Date.now()) {
  return { ...approval, usedAt: new Date(now).toISOString() };
}

export function isProductionDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return PRODUCTION_DB_HOST_PATTERN.test(parsed.hostname);
  } catch {
    return false;
  }
}

/** Nunca se imprime la URL; sólo el host, para el registro. */
export function describeDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.username || "?"}@${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "url inválida";
  }
}

/**
 * El guion a ejecutar debe vivir en `scripts/` del proyecto o en el
 * borrador de la sesión: nada de rutas arbitrarias del disco.
 */
/** @param {string} scriptPath @param {{ projectRoot: string, extraRoots?: (string | undefined)[] }} options */
export function isAllowedScriptPath(scriptPath, { projectRoot, extraRoots = [] }) {
  const absolute = resolve(projectRoot, scriptPath);
  const roots = [resolve(projectRoot, "scripts"), ...extraRoots.filter(Boolean).map((root) => resolve(root))];
  return roots.some((root) => {
    const rel = relative(root, absolute);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) && !rel.split(sep).includes("node_modules");
  });
}

/**
 * Con qué se ejecuta cada guion: `.mjs/.cjs/.js` con Node; `.ts/.mts/.tsx`
 * con `tsx`, que es lo que ya usan los guiones TypeScript del proyecto
 * (`normalize:product-slugs`, `export:products`, …). Cualquier otra
 * extensión se rechaza ANTES de gastar la aprobación: Node no carga `.ts`
 * a pelo y el primer intento real murió con ERR_UNKNOWN_FILE_EXTENSION.
 * @param {string} scriptPath
 * @param {{ projectRoot: string, nodePath?: string }} options
 * @returns {{ command: string, args: string[], runner: "node" | "tsx" } | null}
 */
export function runnerFor(scriptPath, { projectRoot, nodePath = process.execPath }) {
  const extension = scriptPath.toLowerCase().match(/\.[a-z]+$/)?.[0] ?? "";
  if ([".mjs", ".cjs", ".js"].includes(extension)) {
    return { command: nodePath, args: [], runner: "node" };
  }
  if ([".ts", ".mts", ".tsx"].includes(extension)) {
    const tsx = resolve(projectRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
    return { command: tsx, args: [], runner: "tsx" };
  }
  return null;
}

/** Estados posibles de una corrida en el registro. */
export const RUN_STATUS = {
  /** El guion corrió y terminó con código 0. */
  ok: "ok",
  /** El guion corrió (pudo tocar la base) y terminó con error. */
  error: "error",
  /** El proceso nunca arrancó: nada pudo llegar a la base. */
  notStarted: "sin-arrancar",
};

export function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
}

/**
 * Una línea por corrida, en el registro que va al repositorio. `status` dice
 * qué pasó de verdad: `ok`, `error` (corrió y falló) o `sin-arrancar` (nunca
 * llegó a la base). Antes toda corrida quedaba con la misma forma y un
 * fallo al cargar el guion se leía como una escritura hecha.
 */
export function formatLogLine({ at, operator, reason, scriptPath, scriptHash, target, status, exitCode, rowsAffected }) {
  const cells = [
    new Date(at).toISOString(),
    operator ?? "?",
    target,
    `${scriptPath}@${scriptHash}`,
    `estado=${status}`,
    `exit=${exitCode}`,
    rowsAffected === undefined || rowsAffected === null ? "rows=?" : `rows=${rowsAffected}`,
    JSON.stringify(reason),
  ];
  return `${cells.join(" | ")}\n`;
}

/**
 * ¿El motivo de la aprobación nombra el modelo? Se acepta el nombre del modelo
 * Prisma o la tabla en cualquier caja («inventorymovement», «InventoryMovement»,
 * «kardex» para el kardex).
 */
export function reasonNamesModel(reason, model) {
  const haystack = String(reason ?? "").toLowerCase().replace(/[\s_-]/g, "");
  const aliases = { InventoryMovement: ["kardex", "movimiento"], PaymentDetails: ["pago"], OrderItem: ["orderitem", "líneadepedido", "lineadepedido"], Order: ["pedido"] };
  const names = [model.toLowerCase(), ...(aliases[model] ?? []).map((alias) => alias.toLowerCase().replace(/[\s_-]/g, ""))];
  return names.some((name) => haystack.includes(name));
}

/** Decisión del cliente Prisma de guiones: bloquear o dejar pasar. */
export function isBlockedLedgerOperation({ model, operation, reason }) {
  if (!LEDGER_MODELS.has(model)) return false;
  if (!GUARDED_OPERATIONS.has(operation)) return false;
  return !reasonNamesModel(reason, model);
}
