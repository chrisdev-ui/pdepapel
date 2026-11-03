#!/usr/bin/env node
/**
 * Layer 2 — daily quick check of the public store. Plain Playwright, no Claude.
 *
 *   node scripts/monitoring/daily-check.mjs [--no-notify] [--base-url URL]
 *
 * Read-only by construction: every non-GET request is aborted except the
 * stateless consent cookie endpoint, and every analytics request (GA, Clarity,
 * TikTok, Vercel Analytics) is aborted after being recorded, so the run never
 * reaches the providers' data. Results: output/monitoreo/diario/YYYY-MM-DD.json.
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

import { findVitalRegressions } from "./lib/baseline.mjs";
import { bogotaDate, ensureDir, loadLocalEnv, outputDir, readJson, writeJson } from "./lib/common.mjs";
import { loadAlertState, notifyAll, saveAlertState, selectAlertable } from "./lib/notify.mjs";
import { runPsi } from "./lib/psi.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const BASE_URL = (argValue("--base-url") || process.env.MONITOREO_BASE_URL || "https://papeleriapdepapel.com").replace(/\/$/, "");
const NOTIFY = !args.includes("--no-notify");
// Set by run-daily.sh from checkout-guard.mjs: the check still runs, the result carries the warning.
const CHECKOUT_WARNING = process.env.MONITOREO_CHECKOUT_WARNING?.trim() || null;
const STORE_HOST = new URL(BASE_URL).hostname;

// Consent-gated providers. Vercel Web Analytics is cookieless and loads for everyone, so it is
// aborted (the run must not inflate its numbers) but never counted as a consent breach.
const CONSENT_GATED = /(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|clarity\.ms|analytics\.tiktok\.com)/;
const VERCEL_ANALYTICS = /\/_vercel\/(insights|speed-insights)\//;
const CLOUDINARY = /(^|\.)res\.cloudinary\.com$/;
const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);
const CONSENT_KEY = "pdepapel:analytics-consent:v3";
const STUB_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
const VIEWPORTS = {
  "390": { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  "1280": { viewport: { width: 1280, height: 800 } },
};
const POLICY_PAGES = ["/politicas/envios", "/politicas/devoluciones", "/politicas/privacidad", "/politicas/terminos"];

const today = bogotaDate();
const out = outputDir();
const dailyDir = ensureDir(path.join(out, "diario"));
const lockDir = path.join(out, ".lock-diario");

function acquireLock() {
  try {
    fs.mkdirSync(lockDir);
    return true;
  } catch {
    const age = Date.now() - fs.statSync(lockDir).mtimeMs;
    if (age > 2 * 3_600_000) {
      fs.rmSync(lockDir, { recursive: true, force: true });
      fs.mkdirSync(lockDir);
      return true;
    }
    return false;
  }
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "pdepapel-monitoreo/1.0" } });
  return { status: response.status, text: await response.text() };
}

function sitemapPaths(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    try {
      return new URL(m[1]).pathname;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/** One context per scenario; the guard and the recorders live on the context. */
async function newGuardedContext(browser, viewportId, { consent = "necesarias", realImages = false } = {}) {
  const context = await browser.newContext({ ...VIEWPORTS[viewportId], locale: "es-CO", timezoneId: "America/Bogota" });
  const record = { analytics: [], blockedWrites: [], serverActions: [], abortedUrls: new Set() };
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const gated = CONSENT_GATED.test(request.url());
    if (gated || VERCEL_ANALYTICS.test(url.pathname)) {
      if (gated) record.analytics.push(`${url.hostname}${url.pathname}`);
      record.abortedUrls.add(request.url());
      return route.abort();
    }
    if (!READ_ONLY.has(request.method())) {
      const onStore = url.hostname === STORE_HOST;
      const consentCookie = onStore && url.pathname === "/api/consent";
      // The store's only Server Actions read stock and the catalog; tests/unit/monitoring pins that list.
      const serverAction = onStore && request.method() === "POST" && Boolean(request.headers()["next-action"]);
      if (serverAction) record.serverActions.push(url.pathname);
      if (!consentCookie && !serverAction) {
        record.blockedWrites.push(`${request.method()} ${url.hostname}${url.pathname}`);
        record.abortedUrls.add(request.url());
        return route.abort();
      }
    }
    if (!realImages && CLOUDINARY.test(url.hostname)) {
      return route.fulfill({ status: 200, contentType: "image/png", body: STUB_PNG });
    }
    return route.continue();
  });
  if (consent === "necesarias") {
    await context.addInitScript(
      ({ key, value }) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {}
      },
      { key: CONSENT_KEY, value: JSON.stringify({ analytics: false, marketing: false, updatedAt: "2026-11-01T00:00:00.000Z" }) },
    );
  }
  await context.addInitScript(() => {
    const state = { lcpMs: null, cls: 0 };
    Object.defineProperty(window, "__monitor", { value: state });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.lcpMs = Math.round(entry.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) state.cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  });
  return { context, record };
}

function watchConsole(page, record) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location()?.url;
    if (location && record.abortedUrls.has(location)) return;
    if (/net::ERR_FAILED|ERR_BLOCKED_BY_CLIENT/.test(message.text()) && !location) return;
    errors.push(message.text().slice(0, 300));
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error.message).slice(0, 300)}`));
  return errors;
}

const checks = [];
const vitals = {};
function addCheck(id, ok, details = {}) {
  checks.push({ id, ok, ...details });
  const mark = ok ? "ok " : "FALLA";
  console.log(`${mark} ${id}${details.error ? ` — ${details.error}` : ""}`);
}

async function checkPage(browser, viewportId, pagePath, { measure = false, attempt = 1 } = {}) {
  const id = `pagina:${pagePath}@${viewportId}`;
  const { context, record } = await newGuardedContext(browser, viewportId, { realImages: measure });
  const page = await context.newPage();
  const errors = watchConsole(page, record);
  const started = Date.now();
  try {
    const response = await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: "load", timeout: 45_000 });
    const status = response?.status() ?? 0;
    await page.waitForTimeout(measure ? 3_000 : 1_500);
    const h1 = await page.locator("h1").first().textContent({ timeout: 2_000 }).catch(() => null);
    if (measure) {
      const m = await page.evaluate(() => ({ lcpMs: window.__monitor?.lcpMs ?? null, cls: Number((window.__monitor?.cls ?? 0).toFixed(3)) }));
      vitals[`${pagePath === "/" ? "inicio" : "producto"}_${viewportId}`] = m;
    }
    const ok = status === 200 && errors.length === 0;
    if (!ok && attempt === 1) {
      await context.close();
      return checkPage(browser, viewportId, pagePath, { measure, attempt: 2 });
    }
    addCheck(id, ok, {
      status,
      ms: Date.now() - started,
      h1: h1?.trim().slice(0, 80) ?? null,
      consoleErrors: errors.slice(0, 5),
      error: status !== 200 ? `HTTP ${status}` : errors.length ? `${errors.length} errores de consola` : undefined,
      attempts: attempt,
    });
    return { page, context, record };
  } catch (error) {
    if (attempt === 1) {
      await context.close();
      return checkPage(browser, viewportId, pagePath, { measure, attempt: 2 });
    }
    addCheck(id, false, { error: error instanceof Error ? error.message.split("\n")[0] : "error", attempts: attempt });
    await context.close();
    return null;
  }
}

async function checkProductJsonLd(browser, productPath) {
  const { context, record } = await newGuardedContext(browser, "1280");
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}${productPath}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const parsed = [];
    let parseErrors = 0;
    for (const block of blocks) {
      try {
        const value = JSON.parse(block);
        parsed.push(...(Array.isArray(value) ? value : value["@graph"] ?? [value]));
      } catch {
        parseErrors += 1;
      }
    }
    const product = parsed.find((node) => [].concat(node?.["@type"]).includes("Product"));
    const offer = product ? [].concat(product.offers ?? [])[0] : null;
    const missing = [];
    if (!product) missing.push("Product");
    else {
      if (!product.name) missing.push("name");
      if (!product.image) missing.push("image");
      if (!offer) missing.push("offers");
      else {
        if (offer.price === undefined && offer.lowPrice === undefined) missing.push("offers.price");
        if (!offer.priceCurrency) missing.push("offers.priceCurrency");
        if (!offer.availability) missing.push("offers.availability");
      }
    }
    addCheck("jsonld:producto", parseErrors === 0 && missing.length === 0, {
      path: productPath,
      blocks: blocks.length,
      parseErrors,
      missing,
      availability: offer?.availability ?? null,
      error: parseErrors ? `${parseErrors} bloques no son JSON` : missing.length ? `faltan: ${missing.join(", ")}` : undefined,
    });
  } catch (error) {
    addCheck("jsonld:producto", false, { path: productPath, error: error instanceof Error ? error.message.split("\n")[0] : "error" });
  } finally {
    void record;
    await context.close();
  }
}

/** Adds one unit to the browser cart (client state only) and validates an empty step-1 submit. */
async function checkCartAndCheckout(browser, productCandidates) {
  const { context, record } = await newGuardedContext(browser, "1280");
  const page = await context.newPage();
  const errors = watchConsole(page, record);
  let addedFrom = null;
  try {
    for (const candidate of productCandidates.slice(0, 6)) {
      await page.goto(`${BASE_URL}${candidate}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      const button = page.getByRole("button", { name: /Agregar al carrito/ }).first();
      if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) continue;
      await button.click();
      const drawer = page.getByRole("dialog", { name: "Carrito de compras" });
      await drawer.getByText("Agregado al carrito", { exact: true }).waitFor({ timeout: 10_000 });
      addedFrom = candidate;
      break;
    }
    addCheck("carrito:agregar", Boolean(addedFrom), {
      path: addedFrom,
      tried: productCandidates.slice(0, 6).length,
      error: addedFrom ? undefined : "ningún producto candidato dejó agregar al carrito",
    });
    if (!addedFrom) return;

    await page.goto(`${BASE_URL}/carrito`, { waitUntil: "load", timeout: 45_000 });
    // isVisible() ignores its timeout and answers at once; the summary renders after hydration.
    const summary = await page
      .getByRole("heading", { name: "Resumen del pedido" })
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    addCheck("carrito:resumen", summary, { error: summary ? undefined : "el carrito no muestra «Resumen del pedido» con un producto" });

    await page.goto(`${BASE_URL}/finalizar-compra`, { waitUntil: "load", timeout: 45_000 });
    const next = page.getByRole("button", { name: "Continuar a entrega" });
    await next.waitFor({ timeout: 20_000 });
    addCheck("checkout:paso1-render", true);
    await next.click();
    await page.waitForTimeout(1_200);
    const invalid = await page.locator('[aria-invalid="true"]').count();
    const stillOnStep1 = await next.isVisible().catch(() => false);
    addCheck("checkout:paso1-valida-vacio", invalid > 0 && stillOnStep1, {
      invalidFields: invalid,
      error: invalid > 0 && stillOnStep1 ? undefined : `campos inválidos ${invalid}, sigue en paso 1: ${stillOnStep1}`,
    });
    addCheck("checkout:sin-errores-consola", errors.length === 0, {
      consoleErrors: errors.slice(0, 5),
      error: errors.length ? `${errors.length} errores de consola` : undefined,
    });
  } catch (error) {
    addCheck(addedFrom ? "checkout:paso1-render" : "carrito:agregar", false, {
      error: error instanceof Error ? error.message.split("\n")[0] : "error",
    });
  } finally {
    addCheck("seguridad:sin-escrituras", true, {
      blockedWrites: record.blockedWrites.slice(0, 10),
      serverActions: [...new Set(record.serverActions)],
      note: "Escrituras abortadas por el guardia y Server Actions de solo lectura permitidas (informativo).",
    });
    await context.close();
  }
}

async function checkConsent(browser) {
  const scenario = async (id, action) => {
    const { context, record } = await newGuardedContext(browser, "1280", { consent: "ninguno" });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const banner = page.getByRole("region", { name: "Preferencias de privacidad" });
      await banner.waitFor({ timeout: 15_000 });
      return await action(page, record);
    } catch (error) {
      addCheck(id, false, { error: error instanceof Error ? error.message.split("\n")[0] : "error" });
      return null;
    } finally {
      await context.close();
    }
  };

  await scenario("consentimiento:nada-antes", async (page, record) => {
    await page.waitForTimeout(3_000);
    addCheck("consentimiento:nada-antes", record.analytics.length === 0, {
      requests: record.analytics.slice(0, 5),
      error: record.analytics.length ? "se pidió analítica antes de decidir" : undefined,
    });
  });
  await scenario("consentimiento:solo-necesarias", async (page, record) => {
    await page.getByRole("button", { name: "Solo necesarias" }).click();
    await page.waitForTimeout(3_000);
    addCheck("consentimiento:solo-necesarias", record.analytics.length === 0, {
      requests: record.analytics.slice(0, 5),
      error: record.analytics.length ? "«Solo necesarias» cargó analítica" : undefined,
    });
  });
  await scenario("consentimiento:aceptar-todo", async (page, record) => {
    await page.getByRole("button", { name: "Aceptar todo" }).click();
    const seen = () => ({
      ga: record.analytics.some((u) => u.includes("googletagmanager.com/gtag/js")),
      clarity: record.analytics.some((u) => u.includes("clarity.ms/tag")),
      tiktok: record.analytics.some((u) => u.includes("analytics.tiktok.com")),
    });
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline && Object.values(seen()).some((v) => !v)) await page.waitForTimeout(500);
    const loaded = seen();
    const missing = Object.entries(loaded).filter(([, v]) => !v).map(([k]) => k);
    addCheck("consentimiento:aceptar-todo", missing.length === 0, {
      loaded,
      error: missing.length ? `no cargó: ${missing.join(", ")}` : undefined,
    });
  });
}

async function main() {
  if (!acquireLock()) {
    console.log("Otra corrida diaria está en curso; salgo.");
    process.exit(0);
  }
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [id, file] of [["sitemap", "/sitemap.xml"], ["robots", "/robots.txt"]]) {
      try {
        const { status, text } = await fetchText(`${BASE_URL}${file}`);
        const ok = status === 200 && (id === "sitemap" ? /<urlset|<sitemapindex/.test(text) : /Sitemap:/i.test(text));
        addCheck(`http:${file}`, ok, { status, urls: id === "sitemap" ? sitemapPaths(text).length : undefined, error: ok ? undefined : `HTTP ${status} o contenido inesperado` });
        if (id === "sitemap") globalThis.__sitemap = sitemapPaths(text);
      } catch (error) {
        addCheck(`http:${file}`, false, { error: error instanceof Error ? error.name : "error" });
      }
    }

    const sitemap = globalThis.__sitemap ?? [];
    const targets = readJson(path.join(out, "targets.json"), {});
    const categoryPath = targets.categoryPath || sitemap.find((p) => p.startsWith("/categoria/")) || "/tienda";
    const sitemapProducts = sitemap.filter((p) => p.startsWith("/producto/"));
    const productCandidates = [...new Set([targets.topProductPath, ...(targets.productCandidates ?? []), ...sitemapProducts.slice(0, 8)].filter(Boolean))];
    const productPath = productCandidates[0];

    const pages = ["/", categoryPath, productPath, "/carrito", "/finalizar-compra", ...POLICY_PAGES].filter(Boolean);
    for (const viewportId of Object.keys(VIEWPORTS)) {
      for (const pagePath of pages) {
        const measure = pagePath === "/" || pagePath === productPath;
        const result = await checkPage(browser, viewportId, pagePath, { measure });
        if (result) await result.context.close();
      }
    }

    if (productPath) await checkProductJsonLd(browser, productPath);
    await checkCartAndCheckout(browser, productCandidates);
    await checkConsent(browser);

    let psi = { skipped: "sin PSI_API_KEY en scripts/monitoring/.env" };
    if (process.env.PSI_API_KEY) {
      psi = { results: [] };
      for (const pagePath of ["/", productPath].filter(Boolean)) psi.results.push(await runPsi(`${BASE_URL}${pagePath}`, "mobile"));
    }

    const previous = fs
      .readdirSync(dailyDir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name) && name < `${today}.json`)
      .sort()
      .map((name) => readJson(path.join(dailyDir, name)))
      .filter(Boolean);
    const regressions = findVitalRegressions(vitals, previous);
    const failures = checks.filter((c) => !c.ok).map((c) => c.id);

    const result = {
      schemaVersion: 1,
      date: today,
      startedAt,
      finishedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      targets: { categoryPath, productPath, source: targets.topProductPath ? "targets.json" : "sitemap" },
      ok: failures.length === 0 && regressions.length === 0,
      failures,
      regressions,
      vitals,
      vitalsNote: "Laboratorio local sin limitar red ni CPU: solo sirve para comparar día contra día.",
      psi,
      checks,
      warnings: CHECKOUT_WARNING ? [CHECKOUT_WARNING] : [],
    };
    const file = path.join(dailyDir, `${today}.json`);
    writeJson(file, result);
    console.log(`\nResultado: ${file}`);
    console.log(`Fallas: ${failures.length}, regresiones: ${regressions.length}`);
    if (CHECKOUT_WARNING) console.log(`AVISO en el resultado: ${CHECKOUT_WARNING}`);

    const issueKeys = [...failures.map((id) => `falla:${id}`), ...regressions.map((r) => `regresion:${r.id}:${r.metric}`)];
    if (NOTIFY && issueKeys.length) {
      const { fresh, state } = selectAlertable(issueKeys, loadAlertState(), today);
      if (fresh.length) {
        const body = `${fresh.length} problema(s): ${fresh.slice(0, 3).map((k) => k.replace(/^(falla|regresion):/, "")).join(" · ")}. Detalle: output/monitoreo/diario/${today}.json`;
        const sent = await notifyAll({ title: "P de Papel · monitoreo diario", body, url: "https://papeleriapdepapel.com", tag: `monitoreo-diario-${today}` });
        console.log("Avisos:", JSON.stringify(sent));
      } else {
        console.log("Avisos: ya se avisó hoy de estos problemas.");
      }
      saveAlertState(state);
    }
    return result.ok ? 0 : 1;
  } finally {
    await browser.close();
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error("monitoreo diario falló:", error instanceof Error ? error.message : error);
    fs.rmSync(lockDir, { recursive: true, force: true });
    process.exit(2);
  },
);
