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
 * Funciona igual en Windows —el computador de Paula— y en macOS —donde se
 * desarrolla—. No hay nada escrito a la medida de un sistema: las rutas
 * pasan todas por `node:path` y lo único externo es `rawtherapee-cli`, que
 * se busca según el sistema (ver `buscarRawtherapee`).
 *
 * Sin dependencias a propósito: solo Node (24, el mismo de los dos proyectos).
 * No hace falta `npm install` ni un `node_modules` aquí. Se vigila sondeando
 * la carpeta en vez de con `fs.watch` porque de todos modos hay que esperar a
 * que el archivo deje de crecer —una tarjeta SD no copia al instante— y
 * porque `fs.watch` es poco de fiar en unidades extraíbles, que es justo de
 * donde vienen estas fotos.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
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

const ES_WINDOWS = process.platform === "win32";

/**
 * Dónde buscar `rawtherapee-cli`, en orden. Gana lo primero que exista.
 *
 * Se puede saltar todo esto con la variable de entorno `RAWTHERAPEE_CLI` o
 * con la opción `--rawtherapee`, que es lo que hay que usar si está instalado
 * en un sitio raro.
 */
export function candidatosRawtherapee(plataforma = process.platform) {
  if (plataforma === "win32") {
    const programas = [process.env["ProgramFiles"], process.env["ProgramW6432"], process.env["ProgramFiles(x86)"]]
      .filter(Boolean);
    const candidatos = [
      // 1. La copia portátil que vive junto a este script (no hace falta instalar).
      join(AQUI, "windows", "RawTherapee", "rawtherapee-cli.exe"),
    ];
    for (const base of programas) {
      candidatos.push(join(base, "RawTherapee", "rawtherapee-cli.exe"));
      // El instalador de Windows suele crear una subcarpeta con la versión
      // («RawTherapee\5.13\»). Se mira una capa más abajo en vez de dar por
      // sentado un número que cambia en cada versión.
      try {
        for (const hijo of readdirSync(join(base, "RawTherapee"), { withFileTypes: true })) {
          if (hijo.isDirectory()) candidatos.push(join(base, "RawTherapee", hijo.name, "rawtherapee-cli.exe"));
        }
      } catch {
        // Esa carpeta no existe: se sigue con el resto de candidatos.
      }
    }
    // 2. Por último, lo que haya en el PATH.
    candidatos.push("rawtherapee-cli.exe");
    return candidatos;
  }
  return [
    "/Applications/RawTherapee.app/Contents/MacOS/rawtherapee-cli",
    "rawtherapee-cli",
  ];
}

/** El primero de los candidatos que exista de verdad; `null` si ninguno. */
function buscarRawtherapee(indicado) {
  if (indicado) return existsSync(indicado) ? indicado : null;
  const delEntorno = process.env.RAWTHERAPEE_CLI;
  if (delEntorno) return existsSync(delEntorno) ? delEntorno : null;
  for (const candidato of candidatosRawtherapee()) {
    // El último candidato es un nombre suelto (el del PATH): ese no se puede
    // comprobar con `existsSync`, se deja pasar y ya fallará al ejecutarlo
    // con un mensaje claro.
    if (!candidato.includes(sep)) return candidato;
    if (existsSync(candidato)) return candidato;
  }
  return null;
}

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
    rawtherapee: null,
    unaVez: false,
    comprobar: false,
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
    else if (arg === "--rawtherapee") opciones.rawtherapee = valor();
    else if (arg === "--una-vez") opciones.unaVez = true;
    else if (arg === "--comprobar") opciones.comprobar = true;
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
  --rawtherapee <ruta>    Dónde está rawtherapee-cli, si no se encuentra solo
  --una-vez               Procesa lo que haya y termina, sin quedarse vigilando
  --comprobar             Revisa que todo esté en su sitio y sale
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

/**
 * Ancho y alto de un JPEG, leyendo el archivo directamente.
 *
 * Antes esto lo hacía `sips`, que solo existe en macOS. En Windows no hay
 * nada equivalente que venga de fábrica y sea fiable, así que se lee la
 * cabecera a mano: es la misma cuenta en los dos sistemas, sin depender de
 * ningún programa de fuera.
 *
 * Se busca el marcador SOF (el que declara el tamaño). Están entre 0xC0 y
 * 0xCF salvo 0xC4, 0xC8 y 0xCC, que son otra cosa (tablas Huffman,
 * extensiones y codificación aritmética).
 */
function medirJpeg(datos) {
  if (datos.length < 4 || datos[0] !== 0xff || datos[1] !== 0xd8) return null;
  let i = 2;
  while (i < datos.length - 9) {
    if (datos[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marcador = datos[i + 1];
    // Relleno entre segmentos.
    if (marcador === 0xff) {
      i += 1;
      continue;
    }
    // Marcadores sin longitud detrás.
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) {
      i += 2;
      continue;
    }
    const largo = datos.readUInt16BE(i + 2);
    if (marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      return { alto: datos.readUInt16BE(i + 5), ancho: datos.readUInt16BE(i + 7) };
    }
    if (largo < 2) return null; // cabecera corrupta: mejor no seguir adivinando
    i += 2 + largo;
  }
  return null;
}

async function medir(archivo) {
  try {
    return medirJpeg(await readFile(archivo));
  } catch {
    return null;
  }
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

  // Sin `shell: true` a propósito: Node le pasa el ejecutable y cada
  // argumento por separado a CreateProcess/execvp, así que los espacios de
  // «C:\\Program Files\\…» o «P de Papel Ecommerce» no hay que escaparlos.
  // Con `shell: true` sí habría que hacerlo, y es de donde salen los errores
  // clásicos de rutas en Windows.
  const { codigo, error } = await ejecutar(opciones.rawtherapee, [
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
    /*
     * No se arregla solo a propósito.
     *
     * Que salga rectangular significa que la foto no mide lo que el perfil
     * da por sentado (6016×4016, el sensor de la a6400), así que RawTherapee
     * ajustó el recorte a lo que cabía. Recortarla aquí por las bravas
     * taparía el problema y dejaría pasar fotos mal encuadradas una por una;
     * es el mismo error que ya se cometió con el recorte «inteligente».
     * Mejor una sola foto detenida y un aviso que diga qué hacer.
     */
    return {
      ok: false,
      motivo:
        `salió de ${medidas.ancho}×${medidas.alto}, y tiene que salir cuadrada. ` +
        `La foto no mide lo que espera el perfil (6016×4016, el de la a6400). ` +
        `Hay que ajustar la sección [Crop] de ${basename(opciones.perfil)}: ver el README, «Si las fotos no salen cuadradas».`,
    };
  }
  return { ok: true, jpeg: esperado, medidas };
}

async function main() {
  const opciones = leerOpciones(process.argv.slice(2));

  const encontrado = buscarRawtherapee(opciones.rawtherapee);
  if (!encontrado) {
    log.error("No encuentro RawTherapee.");
    log.error(ES_WINDOWS
      ? "   Instálalo desde rawtherapee.com/downloads (el paquete de Windows ya trae rawtherapee-cli.exe),"
      : "   Instálalo con:  brew install --cask rawtherapee,");
    log.error("   o dime dónde está con:  --rawtherapee <ruta>");
    process.exit(1);
  }
  opciones.rawtherapee = encontrado;

  if (!existsSync(opciones.perfil)) {
    log.error(`No encuentro el perfil de revelado: ${opciones.perfil}`);
    process.exit(1);
  }

  let carpetasOk = true;
  for (const carpeta of [opciones.entrada, opciones.salida, opciones.procesadas, opciones.fallidas]) {
    try {
      await mkdir(carpeta, { recursive: true });
    } catch (e) {
      log.error(`No pude crear la carpeta ${carpeta}: ${String(e.message ?? e)}`);
      carpetasOk = false;
    }
  }
  if (!carpetasOk) process.exit(1);

  if (opciones.comprobar) {
    const { salida, error } = await ejecutar(opciones.rawtherapee, ["--version"]);
    const texto = `${salida}${error}`.trim();
    const version = texto.split("\n")[0] || "";
    // `rawtherapee-cli --version` imprime la versión y sale con código 2, así
    // que el código no sirve para saber si funciona: lo que vale es que haya
    // contestado diciendo su nombre.
    const responde = /rawtherapee/i.test(texto);
    log.ok(`Node ${process.version} sobre ${process.platform}`);
    log.ok(`RawTherapee: ${opciones.rawtherapee}`);
    if (responde) {
      log.ok(`             ${version}`);
    } else {
      log.error("             no contestó como se esperaba; revisa la instalación");
    }
    log.ok(`Perfil: ${opciones.perfil}`);
    log.ok(`Carpetas listas dentro de ${dirname(opciones.entrada)}`);
    log.info(responde ? "Todo en su sitio. Ya se puede revelar." : "Falta algo, mira arriba.");
    process.exit(responde ? 0 : 1);
  }

  log.info("Entrada :", opciones.entrada);
  log.info("Salida  :", opciones.salida);
  log.info("Perfil  :", basename(opciones.perfil));
  log.info("RawTherapee:", opciones.rawtherapee);
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

/**
 * Solo arranca si lo llamaron directamente. Así una prueba puede importar
 * `candidatosRawtherapee` —para comprobar desde un Mac la rama de Windows—
 * sin que se ponga a vigilar carpetas.
 */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    log.error("Se cayó el programa:", String(e?.stack ?? e));
    process.exit(1);
  });
}
