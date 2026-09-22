#!/usr/bin/env node
/**
 * Revelado automático de los RAW de producto.
 *
 * Vigila una carpeta de entrada, espera a que cada `.ARW` termine de copiarse
 * desde la tarjeta, lo pasa por `rawtherapee-cli` con un perfil `.pp3` y deja
 * el JPEG listo en la carpeta de salida. El RAW original se guarda en
 * `procesadas/`; nunca se borra.
 *
 * Aquí termina el trabajo automático: las fotos de `salida/` las sube Paula a
 * mano por el panel, mirándolas antes. Es un alto a propósito, no algo que
 * falte.
 *
 * Sin dependencias a propósito: solo Node (24, el mismo de los dos proyectos).
 * No hace falta `npm install` ni un `node_modules` aquí. Se vigila sondeando
 * la carpeta en vez de con `fs.watch` porque de todos modos hay que esperar a
 * que el archivo deje de crecer —una tarjeta SD no copia al instante— y
 * porque `fs.watch` es poco de fiar en volúmenes extraíbles en macOS, que es
 * justo de donde vienen estas fotos.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { homedir } from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * `new URL(".", import.meta.url).pathname` NO sirve aquí: la ruta del
 * repositorio lleva espacios («P de Papel Ecommerce») y saldrían como `%20`,
 * así que después no se encuentra el perfil. `fileURLToPath` los devuelve.
 */
const AQUI = fileURLToPath(new URL(".", import.meta.url));

/** Dónde vive todo por defecto: fuera del repositorio, que los RAW pesan. */
const BASE_POR_DEFECTO = join(homedir(), "Fotos P de Papel");

const RAWTHERAPEE = "/Applications/RawTherapee.app/Contents/MacOS/rawtherapee-cli";

/** Calidad del JPEG. 92 es el punto donde ya no se nota y el archivo no se dispara. */
const CALIDAD_JPEG = 92;

/**
 * Cuánto se espera entre sondeos y cuántas veces seguidas tiene que medir lo
 * mismo un archivo para darlo por copiado del todo.
 */
const SONDEO_MS = 3000;
const MEDIDAS_IGUALES_PARA_EMPEZAR = 2;

const EXTENSIONES_RAW = new Set([".arw"]);

function ahora() {
  return new Date().toLocaleTimeString("es-CO", { hour12: false });
}

const log = {
  info: (...m) => console.log(`[${ahora()}]`, ...m),
  ok: (...m) => console.log(`[${ahora()}] ✓`, ...m),
  aviso: (...m) => console.warn(`[${ahora()}] !`, ...m),
  error: (...m) => console.error(`[${ahora()}] ✗`, ...m),
};

function leerOpciones(argv) {
  const opciones = {
    entrada: join(BASE_POR_DEFECTO, "entrada"),
    salida: join(BASE_POR_DEFECTO, "salida"),
    procesadas: join(BASE_POR_DEFECTO, "procesadas"),
    fallidas: join(BASE_POR_DEFECTO, "fallidas"),
    perfil: join(AQUI, "perfiles", "producto-cuadrado.pp3"),
    unaVez: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const valor = () => {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        log.error(`A «${arg}» le falta la carpeta o el archivo que va después.`);
        process.exit(2);
      }
      i += 1;
      return resolve(v);
    };
    if (arg === "--entrada") opciones.entrada = valor();
    else if (arg === "--salida") opciones.salida = valor();
    else if (arg === "--procesadas") opciones.procesadas = valor();
    else if (arg === "--fallidas") opciones.fallidas = valor();
    else if (arg === "--perfil") opciones.perfil = valor();
    else if (arg === "--una-vez") opciones.unaVez = true;
    else if (arg === "--ayuda" || arg === "-h") {
      console.log(AYUDA);
      process.exit(0);
    } else {
      log.error(`No conozco la opción «${arg}». Usa --ayuda para ver las que hay.`);
      process.exit(2);
    }
  }
  return opciones;
}

const AYUDA = `
Revelado automático de los RAW de producto.

  node procesar-fotos.mjs [opciones]

  --entrada <carpeta>     De dónde se leen los .ARW
  --salida <carpeta>      Dónde quedan los JPEG listos para subir
  --procesadas <carpeta>  Dónde se archivan los RAW ya revelados
  --fallidas <carpeta>    Dónde van los RAW que dieron error
  --perfil <archivo.pp3>  Perfil de revelado de RawTherapee
  --una-vez               Procesa lo que haya y termina, sin quedarse vigilando
  --ayuda                 Esto

Por defecto todo cuelga de: ${BASE_POR_DEFECTO}
`.trim();

function ejecutar(comando, argumentos) {
  return new Promise((resolver) => {
    const hijo = spawn(comando, argumentos, { stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (error += d));
    hijo.on("error", (e) => resolver({ codigo: -1, salida, error: String(e.message ?? e) }));
    hijo.on("close", (codigo) => resolver({ codigo, salida, error }));
  });
}

/** Ancho y alto de una imagen, con `sips`, que viene en macOS. */
async function medir(archivo) {
  const { codigo, salida } = await ejecutar("sips", ["-g", "pixelWidth", "-g", "pixelHeight", archivo]);
  if (codigo !== 0) return null;
  const ancho = /pixelWidth:\s*(\d+)/.exec(salida)?.[1];
  const alto = /pixelHeight:\s*(\d+)/.exec(salida)?.[1];
  return ancho && alto ? { ancho: Number(ancho), alto: Number(alto) } : null;
}

/**
 * Deja la foto cuadrada recortando por el centro.
 *
 * Es la red de seguridad del recorte del perfil: el `.pp3` trae el cuadrado
 * calculado para el sensor de la a6400 (6000×4000) y si algún día entra una
 * foto de otro tamaño, RawTherapee ajusta el recorte y el resultado ya no
 * sale cuadrado. Entonces se recorta aquí y queda dicho en el registro.
 *
 * Recorte **centrado y tonto a propósito**: se probó uno «inteligente» que
 * busca el sujeto (`g_auto` de Cloudinary) y se cayó en la mitad de las fotos
 * reales, recortando el producto. Lo que hace fiable este es el encuadre, no
 * el algoritmo: hay que dejar margen en el lado largo al disparar.
 */
async function recortarCuadrado(archivo, medidas) {
  const lado = Math.min(medidas.ancho, medidas.alto);
  const { codigo, error } = await ejecutar("sips", ["-c", String(lado), String(lado), archivo]);
  return codigo === 0 ? { ok: true, lado } : { ok: false, error };
}

/** Un nombre que no pise a otro ya archivado: `foto.ARW`, `foto-2.ARW`… */
async function destinoLibre(carpeta, nombre) {
  const ext = extname(nombre);
  const raiz = basename(nombre, ext);
  let intento = join(carpeta, nombre);
  let n = 2;
  while (existsSync(intento)) {
    intento = join(carpeta, `${raiz}-${n}${ext}`);
    n += 1;
  }
  return intento;
}

async function procesarUno(archivo, opciones) {
  const nombre = basename(archivo);
  const esperado = join(opciones.salida, `${basename(nombre, extname(nombre))}.jpg`);

  const { codigo, error } = await ejecutar(RAWTHERAPEE, [
    "-o", opciones.salida,
    "-p", opciones.perfil,
    `-j${CALIDAD_JPEG}`,
    "-Y",
    "-c", archivo,
  ]);

  if (codigo !== 0) {
    return { ok: false, motivo: `rawtherapee-cli terminó con código ${codigo}. ${error.trim().split("\n").at(-1) ?? ""}` };
  }
  if (!existsSync(esperado)) {
    return { ok: false, motivo: `rawtherapee-cli dijo que todo bien pero no apareció ${basename(esperado)}.` };
  }

  const medidas = await medir(esperado);
  if (!medidas) {
    return { ok: true, jpeg: esperado, nota: "no se pudieron medir los lados; revísala a ojo" };
  }
  if (medidas.ancho !== medidas.alto) {
    const recorte = await recortarCuadrado(esperado, medidas);
    if (!recorte.ok) {
      return { ok: false, motivo: `salió de ${medidas.ancho}×${medidas.alto} y no se pudo cuadrar: ${recorte.error}` };
    }
    return {
      ok: true,
      jpeg: esperado,
      nota: `salió de ${medidas.ancho}×${medidas.alto} (no es una foto de la a6400) y se recortó al centro a ${recorte.lado}×${recorte.lado}`,
    };
  }
  return { ok: true, jpeg: esperado, medidas };
}

async function main() {
  const opciones = leerOpciones(process.argv.slice(2));

  if (!existsSync(RAWTHERAPEE)) {
    log.error("No encuentro RawTherapee. Instálalo con:  brew install --cask rawtherapee");
    process.exit(1);
  }
  if (!existsSync(opciones.perfil)) {
    log.error(`No encuentro el perfil de revelado: ${opciones.perfil}`);
    process.exit(1);
  }
  for (const carpeta of [opciones.entrada, opciones.salida, opciones.procesadas, opciones.fallidas]) {
    await mkdir(carpeta, { recursive: true });
  }

  log.info("Entrada :", opciones.entrada);
  log.info("Salida  :", opciones.salida);
  log.info("Perfil  :", basename(opciones.perfil));
  log.info(opciones.unaVez ? "Una pasada y listo." : "Vigilando. Ctrl+C para parar.");

  /** Lo medido la vuelta anterior, para saber si el archivo dejó de crecer. */
  const vistos = new Map();
  let trabajando = false;
  let procesadas = 0;
  let fallidas = 0;

  const vuelta = async () => {
    if (trabajando) return;
    trabajando = true;
    try {
      let entradas;
      try {
        entradas = await readdir(opciones.entrada);
      } catch (e) {
        log.error("No pude leer la carpeta de entrada:", String(e.message ?? e));
        return;
      }

      const raws = entradas.filter((n) => !n.startsWith(".") && EXTENSIONES_RAW.has(extname(n).toLowerCase()));

      for (const nombre of raws) {
        const archivo = join(opciones.entrada, nombre);
        let info;
        try {
          info = await stat(archivo);
        } catch {
          vistos.delete(nombre); // se lo llevaron mientras mirábamos
          continue;
        }
        if (!info.isFile() || info.size === 0) continue;

        const anterior = vistos.get(nombre);
        if (!anterior || anterior.size !== info.size) {
          vistos.set(nombre, { size: info.size, iguales: 1 });
          continue;
        }
        anterior.iguales += 1;
        if (anterior.iguales < MEDIDAS_IGUALES_PARA_EMPEZAR) continue;

        // Ya no crece: es seguro tocarlo.
        vistos.delete(nombre);
        log.info(`Revelando ${nombre} (${(info.size / 1e6).toFixed(1)} MB)…`);
        const resultado = await procesarUno(archivo, opciones);

        if (resultado.ok) {
          const destino = await destinoLibre(opciones.procesadas, nombre);
          await rename(archivo, destino);
          procesadas += 1;
          const medida = resultado.medidas ? ` ${resultado.medidas.ancho}×${resultado.medidas.alto}` : "";
          log.ok(`${nombre} → ${basename(resultado.jpeg)}${medida}${resultado.nota ? ` · ${resultado.nota}` : ""}`);
        } else {
          const destino = await destinoLibre(opciones.fallidas, nombre);
          await rename(archivo, destino);
          fallidas += 1;
          // Se aparta en vez de dejarla: si se quedara, lo volvería a
          // intentar cada tres segundos para siempre y el registro se
          // llenaría del mismo error.
          log.error(`${nombre}: ${resultado.motivo}`);
          log.error(`   El RAW quedó en ${opciones.fallidas} para que lo mires.`);
        }
      }
    } finally {
      trabajando = false;
    }
  };

  if (opciones.unaVez) {
    /*
     * Una pasada sola no alcanza: para dar un archivo por copiado hay que
     * medirlo dos veces seguidas igual, así que se repite hasta que no quede
     * ningún `.ARW` esperando. El tope es por si algo sigue creciendo para
     * siempre —una copia colgada—: mejor salir avisando que quedarse aquí.
     */
    const TOPE_VUELTAS = 200;
    for (let i = 0; i < TOPE_VUELTAS; i += 1) {
      await vuelta();
      const quedan = (await readdir(opciones.entrada).catch(() => [])).filter(
        (n) => !n.startsWith(".") && EXTENSIONES_RAW.has(extname(n).toLowerCase()),
      );
      if (quedan.length === 0) break;
      if (i === TOPE_VUELTAS - 1) {
        log.aviso(`Me rindo con ${quedan.length} archivo(s) que no dejan de cambiar: ${quedan.join(", ")}`);
        break;
      }
      await new Promise((r) => setTimeout(r, SONDEO_MS));
    }
    log.info(`Listo. Reveladas ${procesadas}, con error ${fallidas}.`);
    process.exit(fallidas > 0 ? 1 : 0);
  }

  await vuelta();

  const reloj = setInterval(() => void vuelta(), SONDEO_MS);
  const despedir = () => {
    clearInterval(reloj);
    log.info(`Parando. En esta sesión: reveladas ${procesadas}, con error ${fallidas}.`);
    process.exit(0);
  };
  process.on("SIGINT", despedir);
  process.on("SIGTERM", despedir);
}

main().catch((e) => {
  log.error("Se cayó el programa:", String(e?.stack ?? e));
  process.exit(1);
});
