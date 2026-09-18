import { describe, expect, it, vi } from "vitest";

// `lib/utils` arrastra la validación de env; aquí solo se prueba el parser.
vi.mock("@/lib/env.mjs", () => ({ env: {} }));

import {
  collectReferencedPublicIds,
  findOrphanResources,
  findStillReferenced,
  type ReferenceDb,
  type ReferenceSource,
} from "@/lib/cloudinary-orphans";

const CLOUD = "https://res.cloudinary.com/demo/image/upload";
const url = (id: string, version = "v1700000000") =>
  `${CLOUD}/${version}/${id}.png`;

function fakeDb(rows: {
  images?: string[];
  orderItems?: (string | null)[];
  videos?: string[];
  categories?: string[];
  home?: { imageUrl?: string; primaryUrl?: string; secondaryUrl?: string }[];
  stores?: { logoUrl?: string | null; policies?: unknown }[];
  shippings?: { guideUrl?: string | null; trackingUrl?: string | null }[];
  products?: (string | null)[];
  groups?: (string | null)[];
  messages?: string[];
}): ReferenceDb {
  const many = <T>(list: T[]) => ({ findMany: async () => list });
  return {
    image: many((rows.images ?? []).map((u) => ({ url: u }))),
    orderItem: many((rows.orderItems ?? []).map((u) => ({ imageUrl: u }))),
    productVideo: many((rows.videos ?? []).map((u) => ({ url: u }))),
    category: many((rows.categories ?? []).map((u) => ({ imageUrl: u }))),
    homeContent: many(rows.home ?? []),
    store: many(rows.stores ?? []),
    shipping: many(rows.shippings ?? []),
    product: many((rows.products ?? []).map((d) => ({ description: d }))),
    productGroup: many((rows.groups ?? []).map((d) => ({ description: d }))),
    conversationMessage: many(
      (rows.messages ?? []).map((u) => ({ mediaUrl: u })),
    ),
  } as unknown as ReferenceDb;
}

describe("collectReferencedPublicIds", () => {
  it("keeps a photo that only an order snapshot still references", async () => {
    const refs = await collectReferencedPublicIds(
      fakeDb({ orderItems: [url("foto-pedido"), null] }),
    );
    expect(refs.get("foto-pedido")).toEqual(new Set(["OrderItem.imageUrl"]));
  });

  it("collects every table that stores a Cloudinary URL, folders included", async () => {
    const refs = await collectReferencedPublicIds(
      fakeDb({
        images: [url("productos/foto-a")],
        videos: [`${CLOUD.replace("/image/", "/video/")}/v1/clip.mp4`],
        categories: [url("portada-cat")],
        home: [{ imageUrl: url("home-hero"), primaryUrl: url("home-1"), secondaryUrl: url("home-2") }],
        stores: [{ logoUrl: url("logo"), policies: { banner: url("politica") } }],
        shippings: [{ guideUrl: url("guia"), trackingUrl: null }],
        products: [`<p>Mira <img src="${url("desc-prod")}"></p>`],
        groups: [`texto ${url("desc-grupo", "")}`.replace("//desc", "/desc")],
        messages: [url("wa-media")],
      }),
    );
    const ids = Array.from(refs.keys()).sort();
    expect(ids).toEqual(
      [
        "clip",
        "desc-grupo",
        "desc-prod",
        "guia",
        "home-1",
        "home-2",
        "home-hero",
        "logo",
        "politica",
        "portada-cat",
        "productos/foto-a",
        "wa-media",
      ].sort(),
    );
    expect(refs.get("productos/foto-a")).toEqual(new Set(["Image"]));
  });

  it("records every source when the same file is used twice", async () => {
    const refs = await collectReferencedPublicIds(
      fakeDb({ images: [url("compartida")], orderItems: [url("compartida")] }),
    );
    expect(Array.from(refs.get("compartida") ?? []).sort()).toEqual([
      "Image",
      "OrderItem.imageUrl",
    ]);
  });
});

describe("findOrphanResources / findStillReferenced", () => {
  const referenced = new Map<string, Set<ReferenceSource>>([
    ["usada", new Set<ReferenceSource>(["Image"])],
    ["pedido", new Set<ReferenceSource>(["OrderItem.imageUrl"])],
  ]);

  it("only lists files nobody references", () => {
    const orphans = findOrphanResources(
      [{ public_id: "usada" }, { public_id: "pedido" }, { public_id: "sobra" }],
      referenced,
    );
    expect(orphans.map((r) => r.public_id)).toEqual(["sobra"]);
  });

  it("names who still uses a file requested for deletion", () => {
    expect(findStillReferenced(["sobra", "pedido"], referenced)).toEqual([
      { publicId: "pedido", sources: ["OrderItem.imageUrl"] },
    ]);
  });
});
