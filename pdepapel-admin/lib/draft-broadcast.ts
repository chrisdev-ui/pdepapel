/**
 * Aviso entre pestañas de que un borrador ya se guardó: la otra pestaña deja
 * de guardar su copia (que tiene los mismos SKU) y ofrece abrir lo guardado.
 * BroadcastChannel donde exista; si no, el evento `storage` de una llave
 * propia. Sin datos de clientas: solo la llave del borrador y el id guardado.
 */
const CHANNEL = "pdepapel-draft-saved";
const STORAGE_KEY = "pdepapel:draft-saved";

export interface DraftSavedMessage {
  key: string;
  savedId?: string | null;
  at: number;
}

// Un solo canal para avisar, abierto mientras viva la página: cerrarlo justo
// después de `postMessage` puede perder el mensaje.
let sender: BroadcastChannel | null = null;

export function announceDraftSaved(key: string, savedId?: string | null): void {
  if (typeof window === "undefined") return;
  const message: DraftSavedMessage = { key, savedId: savedId ?? null, at: Date.now() };
  try {
    if (typeof BroadcastChannel !== "undefined") {
      sender ??= new BroadcastChannel(CHANNEL);
      sender.postMessage(message);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
  } catch {
    // Sin aviso entre pestañas el guardado igual responde 409 «ya se guardó».
  }
}

export function onDraftSaved(key: string, handler: (message: DraftSavedMessage) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const accept = (data: unknown) => {
    const message = data as Partial<DraftSavedMessage> | null;
    if (message && message.key === key) handler({ key, savedId: message.savedId ?? null, at: message.at ?? Date.now() });
  };
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => accept(event.data);
    return () => channel.close();
  }
  const listener = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      accept(JSON.parse(event.newValue));
    } catch {
      // Valor ajeno o roto: se ignora.
    }
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
