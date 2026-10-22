/**
 * Las dos fases de una rotación, separadas del guion de producción para
 * probarlas contra el MySQL local (`tests/integration/credential-rotation.test.ts`).
 *
 * spec = {
 *   user, create?: { schema },            // create: cuenta nueva (pdepapel_app)
 *   urlBase,                              // URL de la que se copian host, puerto, esquema y parámetros
 *   oldPassword?,                         // si se conoce, la vuelta atrás la restaura como principal
 *   consumers(newPassword, newUrl),       // [{ label, newValue, oldValue?, apply(value) → { ok, detail } }]
 *   verify?(newUrl) → Promise<string | null>,   // comprobación extra; devuelve el problema o null
 * }
 * deps = { db, PrismaClient, log, secrets: string[] }
 */
import {
  accountHosts,
  accountName,
  canLogin,
  generatePassword,
  hasSecondaryPassword,
  redact,
  schemaName,
  sqlLiteral,
  updateConsumers,
  withCredentials,
} from "./lib.mjs";

const firstLine = (text) => (text.split("\n").map((line) => line.trim()).filter(Boolean).slice(-1)[0] ?? "error sin mensaje").slice(0, 300);

async function revertDatabase(spec, hosts, { db, log }) {
  if (spec.create) {
    await db.$executeRawUnsafe(`DROP USER IF EXISTS ${accountName(spec.user, "%")}`);
    log(`vuelta atrás: se borró ${spec.user}; nadie lo usaba todavía.`);
    return "reverted";
  }
  if (!spec.oldPassword) {
    log(
      `vuelta atrás: la contraseña vieja de ${spec.user} no se conoce aquí, pero sigue valiendo como secundaria y los consumidores no cambiaron. NO corras --phase discard; avisa antes de reintentar.`,
    );
    return "old-still-valid";
  }
  for (const host of hosts) {
    const account = accountName(spec.user, host);
    await db.$executeRawUnsafe(`ALTER USER ${account} IDENTIFIED BY ${sqlLiteral(spec.oldPassword)}`);
    await db.$executeRawUnsafe(`ALTER USER ${account} DISCARD OLD PASSWORD`);
  }
  log(`vuelta atrás: ${spec.user} quedó con su contraseña de antes y sin secundaria.`);
  return "reverted";
}

export async function rotate(spec, deps) {
  const { db, PrismaClient, log } = deps;
  const hosts = spec.create ? ["%"] : await accountHosts(db, spec.user);

  if (spec.create) {
    if ((await accountHosts(db, spec.user)).length > 0) throw new Error(`${spec.user} ya existe; no se tocó nada.`);
  } else {
    if (hosts.length === 0) throw new Error(`${spec.user} no existe; no se tocó nada.`);
    for (const host of hosts) {
      if (await hasSecondaryPassword(db, spec.user, host)) {
        throw new Error(`${spec.user}@${host} ya tiene contraseña secundaria (una rotación a medias): revisa antes de seguir. No se tocó nada.`);
      }
    }
  }

  const password = generatePassword();
  const newUrl = withCredentials(spec.urlBase, spec.user, password);
  const secrets = [...deps.secrets, password, newUrl];
  try {
    return await applyRotation(spec, deps, { hosts, password, newUrl, secrets });
  } catch (error) {
    throw new Error(firstLine(redact(String(error?.message ?? error), [...secrets, spec.oldPassword])));
  }
}

async function applyRotation(spec, deps, { hosts, password, newUrl, secrets }) {
  const { db, PrismaClient, log } = deps;

  try {
    if (spec.create) {
      const account = accountName(spec.user, "%");
      await db.$executeRawUnsafe(`CREATE USER ${account} IDENTIFIED BY ${sqlLiteral(password)}`);
      await db.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${schemaName(spec.create.schema)}.* TO ${account}`);
      await db.$executeRawUnsafe(`GRANT SELECT ON performance_schema.* TO ${account}`);
      log(`creada ${spec.user}@% con DML en ${spec.create.schema} y lectura de performance_schema.`);
    } else {
      for (const host of hosts) {
        await db.$executeRawUnsafe(`ALTER USER ${accountName(spec.user, host)} IDENTIFIED BY ${sqlLiteral(password)} RETAIN CURRENT PASSWORD`);
      }
      log(`${spec.user}: contraseña nueva en ${hosts.join(", ")}; la vieja sigue valiendo como secundaria.`);
    }
  } catch (error) {
    log("FALLÓ el cambio en la base; se deshace lo aplicado.");
    await revertDatabase(spec, hosts, deps).catch(() => log("ALERTA: la vuelta atrás también falló; revisa la cuenta a mano."));
    throw error;
  }

  let problem = (await canLogin(newUrl, spec.user, PrismaClient)) ? null : "la credencial nueva no entra";
  if (!problem && spec.verify) problem = await spec.verify(newUrl);
  if (problem) {
    log(`FALLÓ la comprobación: ${problem}.`);
    const dbState = await revertDatabase(spec, hosts, deps);
    return { ok: false, stage: "verify", db: dbState };
  }
  log(`${spec.user}: la credencial nueva entra.`);

  const result = updateConsumers(spec.consumers(password, newUrl), { secrets, log });
  if (!result.ok) {
    const dbState = await revertDatabase(spec, hosts, deps);
    return { ok: false, stage: "consumers", ...result, db: dbState };
  }
  return { ok: true, hosts };
}

/** Después del deploy verificado: la contraseña vieja deja de valer. */
export async function discard(spec, deps) {
  const { db, PrismaClient, log } = deps;
  const hosts = await accountHosts(db, spec.user);
  let discarded = 0;
  for (const host of hosts) {
    if (!(await hasSecondaryPassword(db, spec.user, host))) continue;
    await db.$executeRawUnsafe(`ALTER USER ${accountName(spec.user, host)} DISCARD OLD PASSWORD`);
    discarded += 1;
  }
  log(`${spec.user}: ${discarded} cuenta(s) sin contraseña vieja.`);
  if (spec.currentUrl) {
    const ok = await canLogin(spec.currentUrl, spec.user, PrismaClient);
    log(ok ? `${spec.user}: la credencial vigente entra.` : `ALERTA: ${spec.user} no entra con la credencial vigente.`);
    return { ok, discarded };
  }
  return { ok: true, discarded };
}
