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
