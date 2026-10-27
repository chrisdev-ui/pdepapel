/**
 * Un `Client` de QStash falso que rechaza lo mismo que el real: una llave de
 * flujo o un id de deduplicación con caracteres fuera de [A-Za-z0-9._-]
 * («flowControlKey must be alphanumeric, hyphen, underscore, or period»).
 * Un doble que acepta todo es lo que dejó pasar el «self:» del 2026-10-27.
 */
export interface PublishedMessage {
  flowControl?: { key: string; parallelism?: number };
  deduplicationId?: string;
  [key: string]: unknown;
}

const RULE = /^[A-Za-z0-9._-]+$/;

export function createStrictQStash() {
  const published: PublishedMessage[] = [];
  const publish = async (message: PublishedMessage) => {
    if (message.flowControl && !RULE.test(message.flowControl.key)) {
      throw new Error('{"error":"flowControlKey must be alphanumeric, hyphen, underscore, or period"}');
    }
    if (message.deduplicationId !== undefined && !RULE.test(message.deduplicationId)) {
      throw new Error('{"error":"deduplicationId must be alphanumeric, hyphen, underscore, or period"}');
    }
    published.push(message);
    return { messageId: `msg-${published.length}` };
  };
  class Client {
    publishJSON = publish;
    publish = publish;
  }
  class Receiver {
    verify = async () => true;
  }
  return { published, Client, Receiver };
}
