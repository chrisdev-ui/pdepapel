import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

const MAX_SAVED_SEARCHES = 20;
const MAX_NAME = 80;
const MAX_QUERY = 1000;

const getCorsHeaders = (request: Request) => createCorsHeaders(request, { methods: "GET, POST, DELETE, OPTIONS" });
const noCache = (request: Request) => ({ ...getCorsHeaders(request), ...CACHE_HEADERS.NO_CACHE });

const select = { id: true, name: true, query: true, createdAt: true };

/** Solo se guarda una query string de la tienda: claves conocidas, sin esquema ni host. */
function normalizeQuery(value: unknown): string {
  if (typeof value !== "string") throw ErrorFactory.InvalidRequest("Falta la búsqueda que quieres guardar");
  const raw = value.trim().replace(/^\?/, "");
  if (!raw || raw.length > MAX_QUERY) throw ErrorFactory.InvalidRequest("La búsqueda está vacía o es demasiado larga");
  const params = new URLSearchParams(raw);
  params.delete("page");
  const kept = new URLSearchParams();
  for (const [key, entry] of Array.from(params.entries())) {
    if (/^[a-zA-Z]{1,32}$/.test(key) && entry !== "" && entry !== "false" && entry.length <= 200) kept.append(key, entry);
  }
  const query = kept.toString();
  if (!query) throw ErrorFactory.InvalidRequest("La búsqueda no tiene filtros que guardar");
  return query;
}

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function GET(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const searches = await prismadb.customerSavedSearch.findMany({
      where: { storeId: params.storeId, userId },
      orderBy: { createdAt: "desc" },
      select,
    });
    return NextResponse.json({ searches }, { headers: noCache(req) });
  } catch (error) {
    return handleErrorResponse(error, "CUSTOMER_SAVED_SEARCHES_GET", { headers: noCache(req) });
  }
}

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, MAX_NAME) : "";
    if (!name) throw ErrorFactory.InvalidRequest("Ponle un nombre a la búsqueda");
    const query = normalizeQuery(body.query);

    const count = await prismadb.customerSavedSearch.count({ where: { storeId: params.storeId, userId } });
    if (count >= MAX_SAVED_SEARCHES) {
      throw ErrorFactory.InvalidRequest(`Puedes guardar hasta ${MAX_SAVED_SEARCHES} búsquedas; borra alguna para guardar otra`);
    }

    const existing = await prismadb.customerSavedSearch.findFirst({ where: { storeId: params.storeId, userId, query }, select });
    if (existing) return NextResponse.json({ search: existing, duplicate: true }, { headers: noCache(req) });

    const search = await prismadb.customerSavedSearch.create({ data: { storeId: params.storeId, userId, name, query }, select });
    return NextResponse.json({ search }, { status: 201, headers: noCache(req) });
  } catch (error) {
    return handleErrorResponse(error, "CUSTOMER_SAVED_SEARCHES_POST", { headers: noCache(req) });
  }
}

export async function DELETE(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw ErrorFactory.InvalidRequest("Falta la búsqueda a borrar");

    await prismadb.customerSavedSearch.deleteMany({ where: { id, storeId: params.storeId, userId } });
    return NextResponse.json({ ok: true }, { headers: noCache(req) });
  } catch (error) {
    return handleErrorResponse(error, "CUSTOMER_SAVED_SEARCHES_DELETE", { headers: noCache(req) });
  }
}
