/**
 * Portadas e intros de categoría para la cabecera de la tienda (2026-09).
 *
 * Genera, con el mismo estilo pastel de las 8 portadas curadas, una imagen por
 * categoría sin foto y una intro corta por categoría sin `seoIntro`. Nunca toca
 * las categorías que ya tienen foto o intro.
 *
 *   npx tsx prisma/scripts/category-covers.ts plan                 # qué falta (sin llamadas)
 *   npx tsx prisma/scripts/category-covers.ts generate [--limit N] # imágenes + intros a ./tmp/category-covers
 *   npx tsx prisma/scripts/category-covers.ts sheet                # contact sheet HTML para revisar
 *   npx tsx prisma/scripts/category-covers.ts upload               # sube las aprobadas a Cloudinary (category-covers/)
 *   npx tsx prisma/scripts/category-covers.ts apply                # escribe imageUrl / seoIntro con respaldo JSON
 *
 * Requiere OPENAI_API_KEY (imágenes e intros; la clave de Gemini del panel es
 * de nivel gratuito y no genera imágenes) y las credenciales de Cloudinary en
 * .env. Para descartar una imagen antes de subirla basta con borrar su PNG.
 */
import { PrismaClient } from "@prisma/client";
import cloudinary from "cloudinary";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const STORE_ID = process.env.CATEGORY_COVERS_STORE_ID ?? "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";
const OUT_DIR = path.resolve("tmp/category-covers");
const IMAGE_MODEL = "gpt-image-1";
const TEXT_MODEL = "gpt-4.1-mini";

const STYLE_PROMPT = [
  "Square product photography for a Colombian kawaii stationery shop.",
  "Top-down flat lay on a soft pastel pink or peach paper background, gentle daylight, subtle soft shadows.",
  "A few cute pastel-colored items of the category arranged loosely with small kawaii accents (tiny stars, hearts, a bow, a strawberry) and one or two washi tapes at the edges.",
  "Colors: baby pink, lavender, mint, butter yellow, baby blue. Clean, uncluttered, no text, no logos, no people, no hands, no watermark.",
  "Style of a curated e-commerce category cover: airy, sweet, high quality, 1:1.",
].join(" ");

const prisma = new PrismaClient();
const strip = (name: string) => name.replace(/^[^A-Za-z0-9\u00C0-\u024F]+/, "").trim();
const slugify = (value: string) =>
  strip(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

type Row = { id: string; name: string; slug: string; imageUrl: string | null; seoIntro: string | null; type: { name: string } };

async function loadTargets(): Promise<Row[]> {
  return prisma.category.findMany({
    where: { storeId: STORE_ID, isArchived: false, products: { some: { isArchived: false } } },
    select: { id: true, name: true, slug: true, imageUrl: true, seoIntro: true, type: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
}

function openAiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY en .env");
  return apiKey;
}

async function openAi<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok || data.error) throw new Error(data.error?.message ?? `OpenAI ${response.status}`);
  return data;
}

async function generateCover(row: Row): Promise<Buffer> {
  const data = await openAi<{ data: { b64_json: string }[] }>("images/generations", {
    model: IMAGE_MODEL,
    prompt: `${STYLE_PROMPT} Category: "${strip(row.name)}" (${strip(row.type.name)}). Show items that belong to this category.`,
    size: "1024x1024",
    quality: "medium",
    n: 1,
  });
  return Buffer.from(data.data[0].b64_json, "base64");
}

async function generateIntro(row: Row): Promise<string> {
  const data = await openAi<{ choices: { message: { content: string } }[] }>("chat/completions", {
    model: TEXT_MODEL,
    temperature: 0.8,
    messages: [
      {
        role: "system",
        content:
          "Escribes textos cortos para una papelería colombiana en línea (P de Papel, Medellín, envíos a toda Colombia). Tono cercano y alegre, español de Colombia, sin emojis, sin signos de exclamación, sin comillas. No prometas precios ni stock.",
      },
      {
        role: "user",
        content: `Escribe la intro de la categoría «${strip(row.name)}» (tipo: ${strip(row.type.name)}): entre 110 y 160 caracteres, una o dos frases, sobre para qué sirven los productos o a quién le gustan. Devuelve solo el texto.`,
      },
    ],
  });
  return data.choices[0].message.content.trim().replace(/^["«]|["»]$/g, "");
}

const coverPath = (row: Row) => path.join(OUT_DIR, `${row.slug || slugify(row.name)}.png`);
const introsPath = path.join(OUT_DIR, "intros.json");
const uploadsPath = path.join(OUT_DIR, "uploads.json");
const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback);

async function main() {
  const [command = "plan", ...rest] = process.argv.slice(2);
  const limitArg = rest.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(rest[limitArg + 1]) : Infinity;
  mkdirSync(OUT_DIR, { recursive: true });
  const rows = await loadTargets();
  const needCover = rows.filter((row) => !row.imageUrl);
  const needIntro = rows.filter((row) => !row.seoIntro);

  if (command === "plan") {
    console.log(`categorías con productos: ${rows.length} · sin foto: ${needCover.length} · sin intro: ${needIntro.length}`);
    needCover.forEach((row) => console.log(` - foto: ${strip(row.name)} (${strip(row.type.name)})`));
    return;
  }

  if (command === "generate") {
    const intros = readJson<Record<string, string>>(introsPath, {});
    let done = 0;
    for (const row of needCover) {
      if (done >= limit) break;
      const file = coverPath(row);
      if (existsSync(file)) continue;
      process.stdout.write(`imagen ${strip(row.name)}… `);
      writeFileSync(file, await generateCover(row));
      console.log("ok");
      done += 1;
    }
    for (const row of needIntro) {
      if (intros[row.id]) continue;
      process.stdout.write(`intro ${strip(row.name)}… `);
      intros[row.id] = await generateIntro(row);
      writeFileSync(introsPath, JSON.stringify(intros, null, 2));
      console.log("ok");
    }
    console.log(`listo: ${readdirSync(OUT_DIR).filter((f) => f.endsWith(".png")).length} imágenes, ${Object.keys(intros).length} intros en ${OUT_DIR}`);
    return;
  }

  if (command === "sheet") {
    const intros = readJson<Record<string, string>>(introsPath, {});
    const cards = rows
      .map((row) => {
        const file = coverPath(row);
        const img = existsSync(file) ? `<img src="${path.basename(file)}">` : row.imageUrl ? `<img src="${row.imageUrl}"><small>ya en el panel</small>` : `<div class="missing">sin imagen</div>`;
        return `<figure>${img}<figcaption><b>${strip(row.name)}</b><span>${row.seoIntro ?? intros[row.id] ?? "—"}</span></figcaption></figure>`;
      })
      .join("");
    writeFileSync(
      path.join(OUT_DIR, "index.html"),
      `<!doctype html><meta charset="utf-8"><title>Portadas de categoría</title><style>body{font-family:system-ui;margin:24px;background:#faf9f5}main{display:grid;grid-template-columns:repeat(5,1fr);gap:18px}figure{margin:0;display:flex;flex-direction:column;gap:6px}img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px}.missing{aspect-ratio:1;border:1px dashed #bbb;border-radius:12px;display:grid;place-items:center;color:#888}figcaption{font-size:12px;display:flex;flex-direction:column;gap:2px}figcaption span{color:#666}</style><main>${cards}</main>`,
    );
    console.log(`contact sheet: ${path.join(OUT_DIR, "index.html")}`);
    return;
  }

  if (command === "upload") {
    cloudinary.v2.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true });
    const uploads = readJson<Record<string, string>>(uploadsPath, {});
    for (const row of needCover) {
      const file = coverPath(row);
      if (!existsSync(file) || uploads[row.id]) continue;
      process.stdout.write(`subiendo ${strip(row.name)}… `);
      const result = await cloudinary.v2.uploader.upload(file, {
        folder: "category-covers",
        public_id: `${row.slug || slugify(row.name)}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
        overwrite: false,
      });
      uploads[row.id] = result.secure_url;
      writeFileSync(uploadsPath, JSON.stringify(uploads, null, 2));
      console.log("ok");
    }
    console.log(`subidas: ${Object.keys(uploads).length}`);
    return;
  }

  if (command === "apply") {
    const uploads = readJson<Record<string, string>>(uploadsPath, {});
    const intros = readJson<Record<string, string>>(introsPath, {});
    const changes = rows
      .map((row) => ({
        id: row.id,
        name: strip(row.name),
        imageUrl: !row.imageUrl && uploads[row.id] ? uploads[row.id] : undefined,
        seoIntro: !row.seoIntro && intros[row.id] ? intros[row.id] : undefined,
        before: { imageUrl: row.imageUrl, seoIntro: row.seoIntro },
      }))
      .filter((change) => change.imageUrl || change.seoIntro);
    if (changes.length === 0) {
      console.log("nada que aplicar");
      return;
    }
    const backup = path.join(OUT_DIR, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(backup, JSON.stringify(changes, null, 2));
    await prisma.$transaction(
      changes.map((change) =>
        prisma.category.update({
          where: { id: change.id },
          data: { ...(change.imageUrl ? { imageUrl: change.imageUrl } : {}), ...(change.seoIntro ? { seoIntro: change.seoIntro } : {}) },
        }),
      ),
    );
    console.log(`aplicado en ${changes.length} categorías · respaldo: ${backup}`);
    console.log("Recuerda invalidar la caché de catálogo de la tienda (revalidate) o esperar los 5 minutos de ISR.");
    return;
  }

  throw new Error(`Comando desconocido: ${command}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
