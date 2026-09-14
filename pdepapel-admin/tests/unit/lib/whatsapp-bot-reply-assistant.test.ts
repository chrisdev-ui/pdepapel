import { describe, expect, it } from "vitest";

import {
  BOT_REPLY_ASSISTANT_NOTE_MAX_LENGTH,
  botReplyAssistantOutputSchema,
  botReplyAssistantRequestSchema,
  sanitizeAssistantNote,
  redactCustomerText,
  sanitizeBotReplyProposals,
  selectUnansweredMessages,
} from "@/lib/whatsapp/bot-reply-assistant";
import { LEGACY_WHATSAPP_BOT_MARKER } from "@/lib/whatsapp/bot-matching";

const EXISTING = [
  { label: "Horarios", triggers: ["horario"], answer: "De 9 a 6." },
];

function output(proposals: unknown[]) {
  return botReplyAssistantOutputSchema.parse({ proposals });
}

const base = {
  label: "Envíos",
  answer: "Enviamos a todo el país.",
  reason: "Es lo que más preguntan.",
  examples: [],
};

describe("sanitizeBotReplyProposals", () => {
  it("quita un disparador que otra respuesta activa ya se queda", () => {
    // «horario» ya existe, así que «horario de atencion» nunca se dispararía:
    // gana la primera coincidencia.
    const [proposal] = sanitizeBotReplyProposals(
      output([{ ...base, triggers: ["hacen envios", "horario de atencion"] }]),
      EXISTING,
    );

    expect(proposal.triggers).toEqual(["hacen envios"]);
    expect(proposal.droppedTriggers).toEqual(["horario de atencion"]);
  });

  it("no deja que dos propuestas de la misma tanda pidan la misma frase", () => {
    const proposals = sanitizeBotReplyProposals(
      output([
        { ...base, label: "Envíos", triggers: ["envio"] },
        { ...base, label: "Costo de envío", triggers: ["envio", "cuanto vale el envio"] },
      ]),
      [],
    );

    // «cuanto vale el envio» contiene «envio», que la primera acaba de tomar,
    // así que la segunda propuesta se queda sin disparadores y desaparece.
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ label: "Envíos", triggers: ["envio"] });
  });

  it("descarta disparadores demasiado cortos para ser útiles", () => {
    const [proposal] = sanitizeBotReplyProposals(
      output([{ ...base, triggers: ["si", "ok", "hacen envios"] }]),
      [],
    );

    expect(proposal.triggers).toEqual(["hacen envios"]);
    expect(proposal.droppedTriggers).toEqual(["si", "ok"]);
  });

  it("descarta la propuesta entera si no le queda ningún disparador", () => {
    expect(
      sanitizeBotReplyProposals(output([{ ...base, triggers: ["horario"] }]), EXISTING),
    ).toEqual([]);
  });

  it("quita el encabezado viejo si el modelo lo copió de un ejemplo", () => {
    const [proposal] = sanitizeBotReplyProposals(
      output([
        {
          ...base,
          triggers: ["hacen envios"],
          answer: `${LEGACY_WHATSAPP_BOT_MARKER}\n\nEnviamos a todo el país.`,
        },
      ]),
      [],
    );

    expect(proposal.answer).toBe("Enviamos a todo el país.");
  });

  it("ignora una propuesta sin nombre o sin respuesta", () => {
    expect(
      sanitizeBotReplyProposals(
        output([
          { ...base, label: "   ", triggers: ["hacen envios"] },
          { ...base, answer: "   ", triggers: ["otra cosa"] },
        ]),
        [],
      ),
    ).toEqual([]);
  });
});

describe("selectUnansweredMessages", () => {
  const at = new Date();

  it("deja fuera lo que el bot ya sabe contestar", () => {
    expect(
      selectUnansweredMessages(
        [
          { body: "cual es el horario?", createdAt: at },
          { body: "hacen envios a Cali?", createdAt: at },
        ],
        EXISTING,
      ),
    ).toEqual(["hacen envios a Cali?"]);
  });

  it("no cuenta dos veces el mismo mensaje", () => {
    expect(
      selectUnansweredMessages(
        [
          { body: "Hacen envíos?", createdAt: at },
          { body: "hacen envios", createdAt: at },
        ],
        [],
      ),
    ).toHaveLength(1);
  });

  it("descarta mensajes demasiado cortos para decir algo", () => {
    expect(selectUnansweredMessages([{ body: "ok", createdAt: at }], [])).toEqual([]);
  });

  it("respeta el tope de mensajes", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      body: `pregunta distinta numero ${index}`,
      createdAt: at,
    }));

    expect(selectUnansweredMessages(many, [], 10)).toHaveLength(10);
  });
});

describe("redactCustomerText", () => {
  it("borra teléfonos y correos antes de que el texto salga del servidor", () => {
    expect(
      redactCustomerText("Escríbeme a laura@correo.com o al 302 468 6403 gracias"),
    ).toBe("Escríbeme a [correo] o al [número] gracias");
  });

  it("no toca un número corto que es parte de la pregunta", () => {
    expect(redactCustomerText("tienen agendas 2027?")).toBe("tienen agendas 2027?");
  });
});

describe("botReplyAssistantRequestSchema", () => {
  it("exige el tema cuando se pide redactar uno", () => {
    expect(() => botReplyAssistantRequestSchema.parse({ mode: "topic" })).toThrow();
    expect(
      botReplyAssistantRequestSchema.parse({ mode: "topic", topic: "horarios" }).topic,
    ).toBe("horarios");
  });

  it("no pide tema para analizar conversaciones", () => {
    expect(botReplyAssistantRequestSchema.parse({ mode: "conversations" }).mode).toBe(
      "conversations",
    );
  });
});

describe("largos: recortar en vez de tumbar la respuesta", () => {
  // La nota exacta que rompió producción el 2026-09-14: 334 caracteres contra
  // un tope de 300. El análisis era correcto y se perdió entero con un 500.
  const NOTA_REAL =
    "Los mensajes recibidos son en su gran mayoría fragmentos de una conversación informal previa, saludos en inglés o asiático, o expresiones aleatorias sin una intención clara de compra o consulta frecuente. No hay suficientes mensajes repetitivos sobre un mismo tema de atención al cliente como envíos, pagos o catálogos para justificar la creación de nuevas respuestas automáticas.";

  it("acepta una nota más larga de lo esperado en vez de rechazarla", () => {
    expect(NOTA_REAL.length).toBeGreaterThan(300);
    expect(() =>
      botReplyAssistantOutputSchema.parse({ note: NOTA_REAL, proposals: [] }),
    ).not.toThrow();
  });

  it("acepta una propuesta con textos largos y los recorta al limpiarla", () => {
    const parsed = botReplyAssistantOutputSchema.parse({
      proposals: [
        {
          label: "L".repeat(200),
          triggers: ["hacen envios"],
          answer: "A".repeat(5000),
          reason: "R".repeat(900),
          examples: ["E".repeat(900)],
        },
      ],
    });

    const [proposal] = sanitizeBotReplyProposals(parsed, []);

    expect(proposal.label).toHaveLength(80);
    expect(proposal.answer.length).toBeLessThanOrEqual(1000);
    expect(proposal.reason).toHaveLength(280);
    expect(proposal.examples[0]).toHaveLength(200);
  });

  it("recorta la nota al mostrarla y trata el vacío como nada", () => {
    expect(sanitizeAssistantNote(NOTA_REAL)).toBe(NOTA_REAL);
    expect(sanitizeAssistantNote("N".repeat(900))).toHaveLength(
      BOT_REPLY_ASSISTANT_NOTE_MAX_LENGTH,
    );
    expect(sanitizeAssistantNote("   ")).toBeNull();
    expect(sanitizeAssistantNote(null)).toBeNull();
  });
});
