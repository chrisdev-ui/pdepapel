import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  triggerStorefrontRevalidation: vi.fn(),
  post: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prismadb", () => ({ default: { post: mocks.post } }));
vi.mock("@/lib/revalidate-store", () => ({
  triggerStorefrontRevalidation: mocks.triggerStorefrontRevalidation,
}));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: {
    NO_CACHE: { "Cache-Control": "no-store" },
    DYNAMIC: { "Cache-Control": "public, s-maxage=0, must-revalidate" },
    STATIC: { "Cache-Control": "public, s-maxage=3600" },
  },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));

import { GET as LIST, POST } from "@/app/api/[storeId]/posts/route";
import {
  DELETE,
  GET,
  PATCH,
} from "@/app/api/[storeId]/posts/[postId]/route";
import { NextRequest } from "next/server";

const storeId = "store-1";
const params = { storeId };
const itemParams = { storeId, postId: "post-1" };

const jsonRequest = (method: string, body: unknown) =>
  new Request(`https://admin.example.com/api/${storeId}/posts`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const storedPost = {
  id: "post-1",
  social: "Instagram",
  postId: "CxYz123AbCd",
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

describe("posts API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.triggerStorefrontRevalidation.mockResolvedValue(undefined);
    mocks.post.findFirst.mockResolvedValue(null);
    mocks.post.findMany.mockResolvedValue([storedPost]);
    mocks.post.create.mockResolvedValue(storedPost);
    mocks.post.update.mockResolvedValue(storedPost);
    mocks.post.delete.mockResolvedValue(storedPost);
  });

  describe("POST /posts", () => {
    it("extracts the id from a pasted link, stores it and revalidates /nosotros", async () => {
      const response = await POST(
        jsonRequest("POST", {
          social: "Instagram",
          postId: "https://www.instagram.com/p/CxYz123AbCd/?igsh=1",
        }),
        { params },
      );

      expect(response.status).toBe(200);
      expect(mocks.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { social: "Instagram", postId: "CxYz123AbCd", storeId },
          select: expect.objectContaining({ createdAt: true }),
        }),
      );
      expect(mocks.triggerStorefrontRevalidation).toHaveBeenCalledWith({
        paths: ["/nosotros"],
        tags: ["posts"],
      });
    });

    it("returns 400 with the Spanish message for an invalid identifier", async () => {
      const response = await POST(
        jsonRequest("POST", { social: "Instagram", postId: "ab" }),
        { params },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          error:
            "No parece un identificador de Instagram. Pega el enlace de la publicación o el código que va después de /p/.",
        }),
      );
      expect(mocks.post.create).not.toHaveBeenCalled();
      expect(mocks.triggerStorefrontRevalidation).not.toHaveBeenCalled();
    });

    it("returns 400 for a network the storefront no longer renders", async () => {
      const response = await POST(
        jsonRequest("POST", { social: "Twitter", postId: "1700000000000000000" }),
        { params },
      );

      expect(response.status).toBe(400);
      expect(mocks.post.create).not.toHaveBeenCalled();
    });

    it("returns 409 when the same post already exists for the store", async () => {
      mocks.post.findFirst.mockResolvedValueOnce({ id: "other" });

      const response = await POST(
        jsonRequest("POST", { social: "Instagram", postId: "CxYz123AbCd" }),
        { params },
      );

      expect(response.status).toBe(409);
      expect(mocks.post.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId, postId: "CxYz123AbCd", social: "Instagram" },
        }),
      );
      expect(mocks.post.create).not.toHaveBeenCalled();
    });

    it("requires a signed-in store owner", async () => {
      mocks.auth.mockResolvedValueOnce({ userId: null });

      const response = await POST(
        jsonRequest("POST", { social: "Instagram", postId: "CxYz123AbCd" }),
        { params },
      );

      expect(response.status).toBe(401);
      expect(mocks.post.create).not.toHaveBeenCalled();
    });
  });

  describe("GET /posts", () => {
    it("returns createdAt with a short public cache", async () => {
      const response = await LIST(
        new NextRequest(`https://admin.example.com/api/${storeId}/posts`),
        { params },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe(
        "public, s-maxage=0, must-revalidate",
      );
      expect(mocks.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId },
          select: expect.objectContaining({ createdAt: true }),
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("filters by a valid ?social and rejects an unknown one without caching", async () => {
      await LIST(
        new NextRequest(
          `https://admin.example.com/api/${storeId}/posts?social=TikTok`,
        ),
        { params },
      );
      expect(mocks.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { storeId, social: "TikTok" } }),
      );

      const response = await LIST(
        new NextRequest(
          `https://admin.example.com/api/${storeId}/posts?social=MySpace`,
        ),
        { params },
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("GET /posts/[postId]", () => {
    it("scopes the lookup to the store and 404s without caching when missing", async () => {
      const response = await GET(
        new Request(`https://admin.example.com/api/${storeId}/posts/post-1`),
        { params: itemParams },
      );

      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.post.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "post-1", storeId } }),
      );
    });
  });

  describe("PATCH /posts/[postId]", () => {
    it("404s for a post that belongs to another store", async () => {
      const response = await PATCH(
        jsonRequest("PATCH", { social: "Instagram", postId: "CxYz123AbCd" }),
        { params: itemParams },
      );

      expect(response.status).toBe(404);
      expect(mocks.post.update).not.toHaveBeenCalled();
      expect(mocks.triggerStorefrontRevalidation).not.toHaveBeenCalled();
    });

    it("returns 400 for an invalid identifier before touching the database", async () => {
      const response = await PATCH(
        jsonRequest("PATCH", { social: "TikTok", postId: "not-a-video" }),
        { params: itemParams },
      );

      expect(response.status).toBe(400);
      expect(mocks.post.findFirst).not.toHaveBeenCalled();
    });

    it("returns 409 when another post already uses the identifier", async () => {
      mocks.post.findFirst
        .mockResolvedValueOnce({ id: "post-1" })
        .mockResolvedValueOnce({ id: "post-2" });

      const response = await PATCH(
        jsonRequest("PATCH", { social: "Instagram", postId: "CxYz123AbCd" }),
        { params: itemParams },
      );

      expect(response.status).toBe(409);
      expect(mocks.post.update).not.toHaveBeenCalled();
    });

    it("updates within the store with the normalized id and revalidates", async () => {
      mocks.post.findFirst
        .mockResolvedValueOnce({ id: "post-1" })
        .mockResolvedValueOnce(null);

      const response = await PATCH(
        jsonRequest("PATCH", {
          social: "Youtube",
          postId: "https://youtu.be/dQw4w9WgXcQ?si=x",
        }),
        { params: itemParams },
      );

      expect(response.status).toBe(200);
      expect(mocks.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "post-1", storeId },
          data: { social: "Youtube", postId: "dQw4w9WgXcQ" },
        }),
      );
      expect(mocks.triggerStorefrontRevalidation).toHaveBeenCalledWith({
        paths: ["/nosotros"],
        tags: ["posts"],
      });
    });
  });

  describe("DELETE /posts/[postId]", () => {
    it("404s for a post of another store and never deletes", async () => {
      const response = await DELETE(
        new Request(`https://admin.example.com/api/${storeId}/posts/post-1`, {
          method: "DELETE",
        }),
        { params: itemParams },
      );

      expect(response.status).toBe(404);
      expect(mocks.post.delete).not.toHaveBeenCalled();
    });

    it("deletes within the store and revalidates the storefront", async () => {
      mocks.post.findFirst.mockResolvedValueOnce({ id: "post-1" });

      const response = await DELETE(
        new Request(`https://admin.example.com/api/${storeId}/posts/post-1`, {
          method: "DELETE",
        }),
        { params: itemParams },
      );

      expect(response.status).toBe(200);
      expect(mocks.post.delete).toHaveBeenCalledWith({
        where: { id: "post-1", storeId },
      });
      expect(mocks.triggerStorefrontRevalidation).toHaveBeenCalledWith({
        paths: ["/nosotros"],
        tags: ["posts"],
      });
    });
  });
});
