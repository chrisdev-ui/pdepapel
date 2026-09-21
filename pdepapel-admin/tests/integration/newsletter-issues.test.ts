import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createNewsletterIssue,
  deleteNewsletterIssue,
  getPublicNewsletterIssue,
  listNewsletterIssues,
  updateNewsletterIssue,
} from "@/lib/newsletter-issues";

import { testPrisma } from "./helpers/database";

const cover = "https://res.cloudinary.com/demo/image/upload/portada.jpg";
const page = (n: number) => ({
  imageUrl: `https://res.cloudinary.com/demo/image/upload/p${n}.jpg`,
});

describe("números del boletín", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId = "";
  let otherStoreId = "";

  beforeAll(async () => {
    await testPrisma.$connect();
    const store = await testPrisma.store.create({
      data: { name: `Boletín ${suffix}`, userId: `owner-${suffix}` },
    });
    const other = await testPrisma.store.create({
      data: { name: `Otra ${suffix}`, userId: `owner-otra-${suffix}` },
    });
    storeId = store.id;
    otherStoreId = other.id;
  });

  afterAll(async () => {
    for (const id of [storeId, otherStoreId]) {
      const issues = await testPrisma.newsletterIssue.findMany({
        where: { storeId: id },
        select: { id: true },
      });
      await testPrisma.newsletterIssuePage.deleteMany({
        where: { issueId: { in: issues.map((issue) => issue.id) } },
      });
      await testPrisma.newsletterCampaignSend.deleteMany({ where: { storeId: id } });
      await testPrisma.newsletterIssue.deleteMany({ where: { storeId: id } });
      await testPrisma.store.delete({ where: { id } });
    }
    await testPrisma.$disconnect();
  });

  it("crea un número con sus páginas en orden", async () => {
    const issue = await createNewsletterIssue(storeId, {
      title: "Regreso a clases",
      intro: "Lo que trae noviembre.",
      coverUrl: cover,
      pages: [page(1), page(2), page(3)],
    });

    expect(issue.slug).toBe("regreso-a-clases");
    expect(issue.status).toBe("DRAFT");
    expect(issue.pages.map((row) => row.position)).toEqual([0, 1, 2]);
    expect(issue.pages[0].imageUrl).toBe(page(1).imageUrl);
  });

  it("da un slug libre cuando dos números se llaman igual", async () => {
    const first = await createNewsletterIssue(storeId, {
      title: "Noviembre",
      coverUrl: cover,
      pages: [page(1)],
    });
    const second = await createNewsletterIssue(storeId, {
      title: "Noviembre",
      coverUrl: cover,
      pages: [page(1)],
    });
    expect(first.slug).toBe("noviembre");
    expect(second.slug).toBe("noviembre-2");
  });

  it("reemplaza las páginas al editar, sin dejar huérfanas", async () => {
    const issue = await createNewsletterIssue(storeId, {
      title: `Edición ${suffix}`,
      coverUrl: cover,
      pages: [page(1), page(2)],
    });
    const updated = await updateNewsletterIssue(storeId, issue.id, {
      title: `Edición ${suffix}`,
      coverUrl: cover,
      pages: [page(9)],
    });

    expect(updated.pages).toHaveLength(1);
    expect(updated.pages[0].imageUrl).toBe(page(9).imageUrl);
    const left = await testPrisma.newsletterIssuePage.count({
      where: { issueId: issue.id },
    });
    expect(left).toBe(1);
  });

  it("rechaza más páginas de las que caben", async () => {
    await expect(
      createNewsletterIssue(storeId, {
        title: "Demasiado",
        coverUrl: cover,
        pages: Array.from({ length: 13 }, (_, index) => page(index)),
      }),
    ).rejects.toThrow(/12 páginas/);
  });

  it("un número de otra tienda no se puede editar ni borrar", async () => {
    const issue = await createNewsletterIssue(otherStoreId, {
      title: "Ajeno",
      coverUrl: cover,
      pages: [page(1)],
    });
    // La consulta va acotada por tienda: desde `storeId` no existe.
    await expect(
      updateNewsletterIssue(storeId, issue.id, {
        title: "Secuestrado",
        coverUrl: cover,
        pages: [page(1)],
      }),
    ).rejects.toThrow(/no existe/i);
    await expect(deleteNewsletterIssue(storeId, issue.id)).rejects.toThrow(
      /no existe/i,
    );
  });

  it("la tienda solo ve números enviados", async () => {
    const issue = await createNewsletterIssue(storeId, {
      title: `Borrador ${suffix}`,
      coverUrl: cover,
      pages: [page(1)],
    });

    expect(await getPublicNewsletterIssue(storeId, issue.slug)).toBeNull();

    await testPrisma.newsletterIssue.update({
      where: { id: issue.id },
      data: { status: "SENT", sentAt: new Date(), recipients: 3 },
    });

    const published = await getPublicNewsletterIssue(storeId, issue.slug);
    expect(published?.title).toBe(`Borrador ${suffix}`);
    expect(published?.pages).toHaveLength(1);
  });

  it("un número enviado no se edita ni se borra", async () => {
    const [sent] = await listNewsletterIssues(storeId).then((issues) =>
      issues.filter((issue) => issue.status === "SENT"),
    );
    expect(sent).toBeDefined();

    await expect(
      updateNewsletterIssue(storeId, sent.id, {
        title: "Otra cosa",
        coverUrl: cover,
        pages: [page(1)],
      }),
    ).rejects.toThrow(/ya se envió/i);
    await expect(deleteNewsletterIssue(storeId, sent.id)).rejects.toThrow(
      /ya se envió/i,
    );
  });
});
