import { readFile } from "node:fs/promises";
import path from "node:path";

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const IMAGE_DIR = path.join(process.cwd(), "content", "manual", "img");
const SAFE_NAME = /^[a-z0-9-]{1,64}$/;

/**
 * Capturas del manual del panel. La ruta no lleva extensión para que el
 * middleware de Clerk la proteja; además exige sesión aquí por si se llama
 * fuera del flujo normal. Solo sirve nombres simples dentro de content/manual/img.
 */
export async function GET(
  _req: Request,
  { params }: { params: { name: string } },
) {
  // Nombre primero: una petición con extensión (p. ej. inicio.jpg) no pasa por
  // el middleware y aquí no hay sesión que consultar; se responde 404 sin más.
  if (!SAFE_NAME.test(params.name)) {
    return new NextResponse("Imagen no encontrada.", { status: 404 });
  }
  let userId: string | null = null;
  try {
    userId = (await auth()).userId;
  } catch {
    userId = null;
  }
  if (!userId) {
    return new NextResponse("Inicia sesión para ver el manual.", { status: 401 });
  }

  try {
    const file = await readFile(path.join(IMAGE_DIR, `${params.name}.jpg`));
    return new NextResponse(file, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Imagen no encontrada.", { status: 404 });
  }
}
