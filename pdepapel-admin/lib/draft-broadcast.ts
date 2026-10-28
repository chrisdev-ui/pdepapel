/**
 * Aviso entre pestañas de que un borrador ya se guardó: la otra pestaña deja
 * de guardar su copia (que tiene los mismos SKU) y ofrece abrir lo guardado.
 * BroadcastChannel donde exista; si no, el evento `storage` de una llave
 * propia. Sin datos de clientas: solo la llave del borrador y el id guardado.
 *
 * Cada mensaje lleva el id de la pestaña que lo manda y esa misma pestaña lo
 * ignora: BroadcastChannel entrega a todos los canales con el mismo nombre,
 * también a los de la propia pestaña, y la pestaña que guardaba se avisaba a
 * sí misma «se guardó en otra pestaña».
 */
const CHANNEL = "pdepapel-draft-saved";
const STORAGE_KEY = "pdepapel:draft-saved";

export interface DraftSavedMessage {
  key: string;
  savedId?: string | null;
  at: number;
  /** Pestaña que lo mandó. */
  from?: string;
}

function newInstanceId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Sin crypto: el respaldo de abajo basta para distinguir pestañas.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Un emisor y un oyente que comparten el id de su pestaña (las pruebas crean dos para simular dos pestañas). */
export function createDraftBroadcast(instanceId: string = newInstanceId()) {
  // Un solo canal para avisar, abierto mientras viva la página: cerrarlo justo
  // después de `postMessage` puede perder el mensaje.
  let sender: BroadcastChannel | null = null;

  function announceDraftSaved(key: string, savedId?: string | null): void {
    if (typeof window === "undefined") return;
    const message: DraftSavedMessage = { key, savedId: savedId ?? null, at: Date.now(), from: instanceId };
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

  function onDraftSaved(key: string, handler: (message: DraftSavedMessage) => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    const accept = (data: unknown) => {
      const message = data as Partial<DraftSavedMessage> | null;
      if (!message || message.key !== key || message.from === instanceId) return;
      handler({ key, savedId: message.savedId ?? null, at: message.at ?? Date.now(), from: message.from });
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

  return { instanceId, announceDraftSaved, onDraftSaved };
}

// La pestaña: un id por carga de la página, compartido por quien avisa y quien escucha.
const thisTab = createDraftBroadcast();

export const announceDraftSaved = thisTab.announceDraftSaved;
export const onDraftSaved = thisTab.onDraftSaved;
