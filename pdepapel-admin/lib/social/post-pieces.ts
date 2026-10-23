import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

export const linkPieceInputSchema = z.object({ otherPostId: z.string().min(1).max(191) });

export class SocialPieceError extends Error {
  constructor(
    readonly kind: "not_found" | "same_network" | "network_taken" | "other_piece" | "same_post",
    message: string,
  ) {
    super(message);
  }
}

type Db = Pick<PrismaClient, "$transaction">;

/**
 * Une dos publicaciones de la tienda en una pieza. Si una ya está en una pieza,
 * la otra entra en esa; si las dos están en piezas distintas, no las mezcla
 * (hay que separar primero). Una pieza tiene una publicación por red.
 */
export async function linkSocialPosts(db: Db, storeId: string, postId: string, otherPostId: string) {
  if (postId === otherPostId) throw new SocialPieceError("same_post", "Elige otra publicación");
  return db.$transaction(async (tx) => {
    const posts = await tx.socialPost.findMany({
      where: { id: { in: [postId, otherPostId] }, account: { storeId } },
      select: { id: true, platform: true, socialPieceId: true },
    });
    const post = posts.find((item) => item.id === postId);
    const other = posts.find((item) => item.id === otherPostId);
    if (!post || !other) throw new SocialPieceError("not_found", "No encontramos esa publicación");
    if (post.platform === other.platform) throw new SocialPieceError("same_network", "Una pieza une publicaciones de redes distintas");
    if (post.socialPieceId && other.socialPieceId) {
      if (post.socialPieceId === other.socialPieceId) return { pieceId: post.socialPieceId };
      throw new SocialPieceError("other_piece", "Esa publicación ya está en otra pieza: sepárala primero");
    }
    const pieceId = post.socialPieceId ?? other.socialPieceId;
    if (pieceId) {
      const joining = post.socialPieceId ? other : post;
      const taken = await tx.socialPost.count({ where: { socialPieceId: pieceId, platform: joining.platform } });
      if (taken) throw new SocialPieceError("network_taken", "Esa pieza ya tiene una publicación de esa red");
      await tx.socialPost.update({ where: { id: joining.id }, data: { socialPieceId: pieceId } });
      return { pieceId };
    }
    const piece = await tx.socialPiece.create({ data: { storeId }, select: { id: true } });
    await tx.socialPost.updateMany({ where: { id: { in: [post.id, other.id] } }, data: { socialPieceId: piece.id } });
    return { pieceId: piece.id };
  });
}

/** Saca la publicación de su pieza; una pieza que queda con una sola publicación se borra. */
export async function unlinkSocialPost(db: Db, storeId: string, postId: string) {
  return db.$transaction(async (tx) => {
    const post = await tx.socialPost.findFirst({ where: { id: postId, account: { storeId } }, select: { id: true, socialPieceId: true } });
    if (!post) throw new SocialPieceError("not_found", "No encontramos esa publicación");
    if (!post.socialPieceId) return { removed: false };
    await tx.socialPost.update({ where: { id: post.id }, data: { socialPieceId: null } });
    const left = await tx.socialPost.count({ where: { socialPieceId: post.socialPieceId } });
    if (left < 2) {
      await tx.socialPost.updateMany({ where: { socialPieceId: post.socialPieceId }, data: { socialPieceId: null } });
      await tx.socialPiece.delete({ where: { id: post.socialPieceId } });
    }
    return { removed: true };
  });
}
