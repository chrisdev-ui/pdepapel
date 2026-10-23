import type { PrismaClient, SocialTagKind } from "@prisma/client";
import { z } from "zod";

import { SOCIAL_TAG_KINDS, SOCIAL_TAG_MAX_LENGTH, SOCIAL_TAGS_PER_KIND_MAX, uniqueTags, type PostTags } from "./tags";

export const postTagsInputSchema = z.object({
  FORMATO: z.array(z.string().max(SOCIAL_TAG_MAX_LENGTH * 2)).max(SOCIAL_TAGS_PER_KIND_MAX * 2),
  GANCHO: z.array(z.string().max(SOCIAL_TAG_MAX_LENGTH * 2)).max(SOCIAL_TAGS_PER_KIND_MAX * 2),
});

export class SocialPostNotFound extends Error {}
export class TooManySocialTags extends Error {}

type Db = Pick<PrismaClient, "socialPost" | "socialTag" | "socialPostTag" | "$transaction">;

/**
 * Reemplaza las etiquetas de una publicación. La publicación tiene que ser de
 * esta tienda (si no, «no encontrada»). Cada etiqueta se busca o crea por su
 * llave única; como MySQL compara sin mayúsculas ni tildes, «pov» reutiliza
 * «POV» y se devuelve con la ortografía guardada.
 */
export async function setSocialPostTags(db: Db, storeId: string, postId: string, input: z.infer<typeof postTagsInputSchema>): Promise<PostTags> {
  const post = await db.socialPost.findFirst({ where: { id: postId, account: { storeId } }, select: { id: true } });
  if (!post) throw new SocialPostNotFound();

  const wanted = {} as PostTags;
  for (const kind of SOCIAL_TAG_KINDS) {
    wanted[kind] = uniqueTags(input[kind]);
    if (wanted[kind].length > SOCIAL_TAGS_PER_KIND_MAX) throw new TooManySocialTags();
  }

  return db.$transaction(async (tx) => {
    const tagIds: string[] = [];
    const saved: PostTags = { FORMATO: [], GANCHO: [] };
    for (const kind of SOCIAL_TAG_KINDS) {
      for (const label of wanted[kind]) {
        const tag = await tx.socialTag.upsert({
          where: { storeId_kind_label: { storeId, kind: kind as SocialTagKind, label } },
          create: { storeId, kind, label },
          update: {},
          select: { id: true, label: true },
        });
        tagIds.push(tag.id);
        saved[kind].push(tag.label);
      }
    }
    await tx.socialPostTag.deleteMany({ where: { socialPostId: post.id, socialTagId: { notIn: tagIds } } });
    await tx.socialPostTag.createMany({ data: tagIds.map((socialTagId) => ({ socialPostId: post.id, socialTagId })), skipDuplicates: true });
    for (const kind of SOCIAL_TAG_KINDS) saved[kind].sort((a, b) => a.localeCompare(b, "es"));
    return saved;
  });
}
