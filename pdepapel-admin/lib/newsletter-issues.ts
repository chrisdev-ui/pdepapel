import "server-only";

import { NewsletterIssueStatus } from "@prisma/client";
import { z } from "zod";

import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { MAX_ISSUE_PAGES } from "@/lib/newsletter-issues-shared";
import { slugify } from "@/lib/slugify";

export { MAX_ISSUE_PAGES } from "@/lib/newsletter-issues-shared";

const pageSchema = z.object({
  imageUrl: z.string().trim().url().max(500),
  alt: z.string().trim().max(160).optional().nullable(),
});

const issueSchema = z.object({
  title: z.string().trim().min(1, "Ponle un título al número").max(160),
  intro: z.string().trim().max(600).optional().nullable(),
  coverUrl: z.string().trim().url("Sube la portada").max(500),
  coverAlt: z.string().trim().max(160).optional().nullable(),
  pages: z
    .array(pageSchema)
    .max(MAX_ISSUE_PAGES, `Hasta ${MAX_ISSUE_PAGES} páginas por número`),
});

export type NewsletterIssueInput = z.infer<typeof issueSchema>;

function parse(body: unknown): NewsletterIssueInput {
  const result = issueSchema.safeParse(body);
  if (!result.success) {
    throw ErrorFactory.InvalidRequest(
      result.error.issues[0]?.message ?? "Revisa los datos del número",
    );
  }
  return result.data;
}

/**
 * Un slug libre dentro de la tienda.
 *
 * `@@unique([storeId, slug])` lo exige, y dos números pueden llamarse igual
 * («Noviembre») en años distintos.
 */
async function uniqueSlug(storeId: string, title: string, ignoreId?: string) {
  const base = slugify(title) || "numero";
  let candidate = base;
  let suffix = 2;
  // La lista de números es corta: una consulta por intento no es un problema.
  for (;;) {
    const clash = await prismadb.newsletterIssue.findFirst({
      where: { storeId, slug: candidate, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

const ISSUE_SELECT = {
  id: true,
  slug: true,
  title: true,
  intro: true,
  coverUrl: true,
  coverAlt: true,
  status: true,
  sentAt: true,
  recipients: true,
  createdAt: true,
  pages: {
    select: { id: true, imageUrl: true, alt: true, position: true },
    orderBy: { position: "asc" },
  },
} as const;

export async function listNewsletterIssues(storeId: string) {
  const issues = await prismadb.newsletterIssue.findMany({
    where: { storeId },
    select: ISSUE_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return issues.map((issue) => ({
    ...issue,
    sentAt: issue.sentAt?.toISOString() ?? null,
    createdAt: issue.createdAt.toISOString(),
  }));
}

export async function createNewsletterIssue(storeId: string, body: unknown) {
  const input = parse(body);
  const slug = await uniqueSlug(storeId, input.title);

  return prismadb.newsletterIssue.create({
    data: {
      storeId,
      slug,
      title: input.title,
      intro: input.intro || null,
      coverUrl: input.coverUrl,
      coverAlt: input.coverAlt || null,
      pages: {
        create: input.pages.map((page, index) => ({
          imageUrl: page.imageUrl,
          alt: page.alt || null,
          position: index,
        })),
      },
    },
    select: ISSUE_SELECT,
  });
}

export async function updateNewsletterIssue(
  storeId: string,
  issueId: string,
  body: unknown,
) {
  const existing = await prismadb.newsletterIssue.findFirst({
    where: { id: issueId, storeId },
    select: { id: true, status: true },
  });
  if (!existing) throw ErrorFactory.NotFound("El número no existe");
  /*
    Un número enviado no se toca: el correo ya salió con ese contenido y la
    página de la tienda es la que recibieron. Editarlo dejaría el enlace
    apuntando a algo distinto de lo que se leyó.
  */
  if (existing.status === NewsletterIssueStatus.SENT) {
    throw ErrorFactory.Conflict("Este número ya se envió y no se puede editar");
  }

  const input = parse(body);
  const slug = await uniqueSlug(storeId, input.title, issueId);

  // `relationMode = "prisma"`: sin claves foráneas, las páginas se reemplazan a mano.
  return prismadb.$transaction(async (tx) => {
    await tx.newsletterIssuePage.deleteMany({ where: { issueId } });
    return tx.newsletterIssue.update({
      where: { id: issueId },
      data: {
        slug,
        title: input.title,
        intro: input.intro || null,
        coverUrl: input.coverUrl,
        coverAlt: input.coverAlt || null,
        pages: {
          create: input.pages.map((page, index) => ({
            imageUrl: page.imageUrl,
            alt: page.alt || null,
            position: index,
          })),
        },
      },
      select: ISSUE_SELECT,
    });
  });
}

export async function deleteNewsletterIssue(storeId: string, issueId: string) {
  const existing = await prismadb.newsletterIssue.findFirst({
    where: { id: issueId, storeId },
    select: { id: true, status: true },
  });
  if (!existing) throw ErrorFactory.NotFound("El número no existe");
  if (existing.status === NewsletterIssueStatus.SENT) {
    throw ErrorFactory.Conflict(
      "Este número ya se envió: el enlace sigue vivo en los correos que recibieron",
    );
  }

  await prismadb.$transaction(async (tx) => {
    await tx.newsletterIssuePage.deleteMany({ where: { issueId } });
    await tx.newsletterIssue.delete({ where: { id: issueId } });
  });
}

/** El número publicado que pide la tienda, por su slug. */
export async function getPublicNewsletterIssue(storeId: string, slug: string) {
  const issue = await prismadb.newsletterIssue.findFirst({
    where: { storeId, slug, status: NewsletterIssueStatus.SENT },
    select: {
      slug: true,
      title: true,
      intro: true,
      coverUrl: true,
      coverAlt: true,
      sentAt: true,
      pages: {
        select: { id: true, imageUrl: true, alt: true, position: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!issue) return null;
  return { ...issue, sentAt: issue.sentAt?.toISOString() ?? null };
}
