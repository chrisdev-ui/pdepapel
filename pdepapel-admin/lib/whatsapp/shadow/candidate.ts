/** Interruptor del modo sombra: en false no se clasifica ni se guarda nada. */
export const WHATSAPP_BOT_SHADOW_ENABLED = true;

/** Lo que `conversation-sync` le pasó al bot real para este mensaje. */
export interface ShadowCandidate {
  conversationId: string;
  body: string;
  interactiveReplyId: string | null;
  inboundMessageId: string | null;
  mediaForOwner?: boolean;
  eventId: string;
  eventCreatedAt: Date;
  customerPhone: string | null;
  customerBsuid: string | null;
}

export interface ShadowDeps {
  /** El texto de «Esa no me la sé» del bot real (vive en bot.ts, que la sombra no importa). */
  noMatchText: string;
}

/** Solo mensajes escritos: los toques y los adjuntos no pasan por el clasificador. */
export function isShadowCandidate(candidate: ShadowCandidate): boolean {
  return (
    WHATSAPP_BOT_SHADOW_ENABLED &&
    !candidate.interactiveReplyId &&
    !candidate.mediaForOwner &&
    Boolean(candidate.inboundMessageId) &&
    candidate.body.trim().length > 0
  );
}
